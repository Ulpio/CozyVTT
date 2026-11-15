import { describe, expect, it } from 'vitest';
import { abilityModifier, FIFTH_EDITION_SKILLS } from '@/utils/rules/fifthEdition';
import type { FifthEditionCharacterData, FifthEditionSkills } from '@/types/game-systems/fifthEdition';
import { buildSheet } from '../buildSheet';
import { maxHitPoints } from '../derived';
import type { AbilityKey, CreationChoices } from '../types';
import { CREATION_DATA, FIXTURE_BOOK } from './fixtures/creationData';

const scores = (order: AbilityKey[]): Record<AbilityKey, number> => {
  const values = [15, 14, 13, 12, 10, 8];
  return Object.fromEntries(order.map((k, i) => [k, values[i]])) as Record<AbilityKey, number>;
};

const choices = (over: Partial<CreationChoices> & Pick<CreationChoices, 'classSlug' | 'raceSlug'>): CreationChoices => ({
  subclassSlug: '',
  backgroundSlug: 'soldado',
  method: 'STANDARD_ARRAY',
  baseScores: scores(['str', 'dex', 'con', 'int', 'wis', 'cha']),
  racialChoices: {},
  skillPicks: [],
  expertisePicks: [],
  languagePicks: [],
  toolPicks: [],
  optionPicks: {},
  equipmentPicks: [],
  anyOfPicks: {},
  cantripSlugs: [],
  spellSlugs: [],
  details: { name: `Teste ${over.classSlug}` },
  ...over,
});

/** One sample per class, with the hit die and per-level HP bonus its sheet should have. */
const SAMPLES: Array<{ choices: CreationChoices; hitDie: number; hpPerLevel: number }> = [
  {
    hitDie: 10,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'guerreiro',
      subclassSlug: 'campeao',
      raceSlug: 'humano',
      baseScores: scores(['str', 'con', 'dex', 'wis', 'cha', 'int']),
      skillPicks: ['perception', 'survival'],
      toolPicks: ['kit-de-jogo-conjunto-de-dados'],
      optionPicks: { fightingStyle: ['defesa'], 'race:languageChoice:0': ['Élfico'] },
      equipmentPicks: [0, 1],
      anyOfPicks: { '1.0.0': 'espada-longa', '1.0.1': 'machado-grande' },
    }),
  },
  {
    hitDie: 12,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'barbaro',
      subclassSlug: 'caminho-do-guerreiro-totemico',
      raceSlug: 'meio-orc',
      backgroundSlug: 'forasteiro',
      baseScores: scores(['str', 'con', 'dex', 'wis', 'cha', 'int']),
      skillPicks: ['perception', 'nature'],
      languagePicks: ['Gigante'],
      toolPicks: ['flauta'],
      optionPicks: { totemSpirit: ['urso'] },
      equipmentPicks: [0],
    }),
  },
  {
    hitDie: 8,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'bardo',
      subclassSlug: 'colegio-do-conhecimento',
      raceSlug: 'meio-elfo',
      backgroundSlug: 'artista',
      baseScores: scores(['cha', 'dex', 'con', 'str', 'wis', 'int']),
      racialChoices: { abilityPicks: ['dex', 'con'] },
      skillPicks: ['deception', 'persuasion', 'insight', 'arcana', 'history', 'stealth', 'perception', 'medicine'],
      expertisePicks: ['performance', 'persuasion'],
      toolPicks: ['alaude'],
      optionPicks: { 'race:languageChoice:0': ['Anão'] },
      equipmentPicks: [0, 0],
      cantripSlugs: ['maos-magicas', 'luz'],
      spellSlugs: ['magia-1-01', 'magia-1-02', 'magia-1-03', 'magia-1-04', 'magia-1-05', 'magia-2-01'],
    }),
  },
  {
    hitDie: 8,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'bruxo',
      subclassSlug: 'o-corruptor',
      raceSlug: 'tiefling',
      backgroundSlug: 'criminoso',
      baseScores: scores(['cha', 'con', 'dex', 'wis', 'int', 'str']),
      skillPicks: ['arcana', 'intimidation'],
      toolPicks: ['kit-de-jogo-conjunto-de-dados'],
      optionPicks: {
        invocations: ['explosao-agonizante', 'armadura-de-sombras'],
        pactBoon: ['pacto-do-tomo'],
        'pactBoon.pacto-do-tomo:cantripChoice:0': ['chama-sagrada', 'orientacao', 'arte-druidica'],
      },
      equipmentPicks: [0],
      cantripSlugs: ['rajada-mistica', 'toque-arrepiante'],
      spellSlugs: ['patrono-1', 'magia-1-01', 'patrono-2', 'magia-2-01'],
    }),
  },
  {
    hitDie: 8,
    hpPerLevel: 1,
    choices: choices({
      classSlug: 'clerigo',
      subclassSlug: 'dominio-da-vida',
      raceSlug: 'anao',
      subraceSlug: 'anao-da-colina',
      backgroundSlug: 'acolito',
      baseScores: scores(['wis', 'con', 'str', 'cha', 'dex', 'int']),
      skillPicks: ['history', 'medicine'],
      languagePicks: ['Élfico', 'Gigante'],
      equipmentPicks: [2],
      cantripSlugs: ['luz', 'chama-sagrada', 'orientacao'],
      spellSlugs: ['magia-1-01', 'magia-1-02', 'magia-1-03', 'magia-1-04', 'magia-1-05', 'magia-1-06'],
    }),
  },
  {
    hitDie: 8,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'druida',
      subclassSlug: 'circulo-da-terra',
      raceSlug: 'elfo',
      subraceSlug: 'elfo-da-floresta',
      backgroundSlug: 'eremita',
      baseScores: scores(['wis', 'con', 'dex', 'int', 'cha', 'str']),
      skillPicks: ['nature', 'animalHandling'],
      languagePicks: ['Silvestre'],
      optionPicks: { landTerrain: ['floresta'], 'subclass:cantripChoice:0': ['arte-druidica'] },
      cantripSlugs: ['produzir-chamas', 'orientacao'],
      spellSlugs: ['magia-1-01', 'magia-1-02', 'magia-1-03', 'magia-1-04', 'magia-2-01', 'magia-1-05'],
    }),
  },
  {
    hitDie: 6,
    hpPerLevel: 1,
    choices: choices({
      classSlug: 'feiticeiro',
      subclassSlug: 'linhagem-draconica',
      raceSlug: 'draconato',
      backgroundSlug: 'sabio',
      baseScores: scores(['cha', 'con', 'dex', 'int', 'wis', 'str']),
      skillPicks: ['deception', 'persuasion'],
      languagePicks: ['Anão', 'Gigante'],
      optionPicks: { ancestry: ['vermelho'], draconicAncestor: ['vermelho'] },
      cantripSlugs: ['raio-de-fogo', 'luz', 'maos-magicas', 'mensagem'],
      spellSlugs: ['magia-1-01', 'magia-1-02', 'magia-1-03', 'magia-2-02'],
    }),
  },
  {
    hitDie: 6,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'mago',
      subclassSlug: 'escola-de-evocacao',
      raceSlug: 'elfo',
      subraceSlug: 'alto-elfo',
      backgroundSlug: 'sabio',
      baseScores: scores(['int', 'dex', 'con', 'wis', 'cha', 'str']),
      skillPicks: ['investigation', 'insight'],
      languagePicks: ['Anão', 'Orc'],
      optionPicks: { 'subrace:languageChoice:0': ['Dracônico'], 'subrace:cantripChoice:0': ['prestidigitacao'] },
      equipmentPicks: [0],
      cantripSlugs: ['raio-de-fogo', 'luz', 'maos-magicas'],
      spellSlugs: [
        'magia-1-01',
        'magia-1-02',
        'magia-1-03',
        'magia-1-04',
        'magia-1-05',
        'magia-1-06',
        'magia-1-07',
        'magia-1-08',
        'magia-2-01',
        'magia-2-02',
      ],
    }),
  },
  {
    hitDie: 8,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'monge',
      subclassSlug: 'caminho-dos-quatro-elementos',
      raceSlug: 'humano',
      subraceSlug: 'humano-variante',
      baseScores: scores(['dex', 'wis', 'con', 'str', 'int', 'cha']),
      racialChoices: { abilityPicks: ['dex', 'wis'] },
      skillPicks: ['perception', 'acrobatics', 'stealth'],
      toolPicks: ['kit-de-jogo-conjunto-de-dados'],
      optionPicks: {
        feat: ['mobilidade'],
        elementalDiscipline: ['punho-do-ar-continuo'],
        'race:languageChoice:0': ['Élfico'],
      },
      equipmentPicks: [0],
    }),
  },
  {
    hitDie: 10,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'paladino',
      subclassSlug: 'juramento-de-devocao',
      raceSlug: 'humano',
      baseScores: scores(['str', 'cha', 'con', 'wis', 'dex', 'int']),
      skillPicks: ['persuasion', 'religion'],
      toolPicks: ['kit-de-jogo-conjunto-de-dados'],
      optionPicks: { fightingStyle: ['duelismo'], 'race:languageChoice:0': ['Anão'] },
      equipmentPicks: [0],
      anyOfPicks: { '0.0.0': 'espada-longa' },
      spellSlugs: ['magia-1-01', 'magia-1-02', 'magia-1-03'],
    }),
  },
  {
    hitDie: 10,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'patrulheiro',
      subclassSlug: 'conclave-do-cacador',
      raceSlug: 'halfling',
      subraceSlug: 'halfling-pes-leves',
      backgroundSlug: 'forasteiro',
      baseScores: scores(['dex', 'wis', 'con', 'str', 'int', 'cha']),
      skillPicks: ['perception', 'stealth', 'nature'],
      languagePicks: ['Élfico'],
      toolPicks: ['flauta'],
      optionPicks: { favoredEnemy: ['bestas'], fightingStyle: ['arquearia'], huntersPrey: ['assassino-de-colossos'] },
      equipmentPicks: [1],
      spellSlugs: ['magia-1-01', 'magia-1-02', 'magia-1-03'],
    }),
  },
  {
    hitDie: 8,
    hpPerLevel: 0,
    choices: choices({
      classSlug: 'ladino',
      subclassSlug: 'trapaceiro-arcano',
      raceSlug: 'elfo',
      subraceSlug: 'elfo-da-floresta',
      backgroundSlug: 'criminoso',
      baseScores: scores(['dex', 'int', 'con', 'wis', 'cha', 'str']),
      skillPicks: ['acrobatics', 'investigation', 'sleightOfHand', 'insight'],
      expertisePicks: ['stealth', 'ferramentas-de-ladrao'],
      toolPicks: ['kit-de-jogo-conjunto-de-dados'],
      equipmentPicks: [0],
      cantripSlugs: ['raio-de-fogo', 'luz'],
      spellSlugs: ['magia-1-01', 'magia-1-02', 'magia-1-03'],
    }),
  },
];

const LONG: Record<AbilityKey, keyof FifthEditionCharacterData['stats']> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

/** Every number in the sheet, with its path. */
function numbers(value: unknown, path = ''): Array<[string, number]> {
  if (typeof value === 'number') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbers(v, `${path}.${k}`));
  }
  return [];
}

const built = new Map<string, FifthEditionCharacterData>();
const sheetOf = (classSlug: string) => {
  const sample = SAMPLES.find((s) => s.choices.classSlug === classSlug)!;
  if (!built.has(classSlug)) built.set(classSlug, buildSheet(sample.choices, CREATION_DATA));
  return built.get(classSlug)!;
};

describe('buildSheet, one sample per class', () => {
  it('covers the twelve classes', () => {
    expect(SAMPLES.map((s) => s.choices.classSlug).sort()).toEqual(CREATION_DATA.classes.map((c) => c.slug).sort());
  });

  describe.each(SAMPLES.map((s) => [s.choices.classSlug, s] as const))('%s', (classSlug, sample) => {
    // The backend's guidedSheets test parses the copies in fixtures/sheets (run with -u to update them).
    it('is a 3rd-level sheet with finite numbers, as in its JSON fixture', async () => {
      const sheet = sheetOf(classSlug);
      expect(sheet.level).toBe(3);
      expect(sheet.proficiencyBonus).toBe(2);
      for (const [path, n] of numbers(sheet)) expect(Number.isFinite(n), path).toBe(true);
      await expect(`${JSON.stringify(sheet, null, 2)}\n`).toMatchFileSnapshot(`./fixtures/sheets/${classSlug}.json`);
    });

    it('every skill bonus is the modifier plus proficiency, doubled for expertise', () => {
      const sheet = sheetOf(classSlug);
      for (const { key, ability } of FIFTH_EDITION_SKILLS) {
        const skill = sheet.skills![key as keyof FifthEditionSkills];
        const mod = abilityModifier(sheet.stats[LONG[ability]].score);
        const prof = skill.proficient ? (skill.expertise ? 4 : 2) : 0;
        expect(skill.bonus, key).toBe(mod + prof + (skill.otherBonus ?? 0));
        if (skill.expertise) expect(skill.proficient, key).toBe(true);
      }
    });

    it('stat modifiers and hit points follow the scores', () => {
      const sheet = sheetOf(classSlug);
      for (const stat of Object.values(sheet.stats)) expect(stat.modifier).toBe(abilityModifier(stat.score));
      const con = sheet.stats.constitution.modifier;
      expect(sheet.hp).toEqual({
        maximum: maxHitPoints(sample.hitDie, 3, con, sample.hpPerLevel),
        current: maxHitPoints(sample.hitDie, 3, con, sample.hpPerLevel),
        temporary: 0,
      });
      expect(sheet.hitDice).toEqual([{ class: expect.any(String), die: `d${sample.hitDie}`, maximum: 3, remaining: 3 }]);
    });

    it('points at the compendium: origin and every spell', () => {
      const sheet = sheetOf(classSlug);
      expect(sheet.origin?.class).toEqual({ bookId: FIXTURE_BOOK, slug: classSlug });
      expect(sheet.origin?.subclass?.slug).toBe(sample.choices.subclassSlug);
      for (const spell of sheet.spellcasting?.spells ?? []) expect(spell.compendiumRef, spell.name).toBeDefined();
      const refs = (sheet.spellcasting?.cantripRefs ?? []).map((r) => r.name);
      expect(refs).toEqual(sheet.spellcasting?.cantrips ?? []);
    });
  });
});

describe('buildSheet, class details', () => {
  const attack = (sheet: FifthEditionCharacterData, slug: string) =>
    sheet.attacks?.find((a) => a.compendiumRef?.slug === slug);

  it('fighter: chain mail and Defense give AC 17; longsword +5, 1d8+3', () => {
    const sheet = sheetOf('guerreiro');
    expect(sheet.stats.strength.score).toBe(16);
    expect(sheet.armorClass).toBe(17);
    expect(attack(sheet, 'espada-longa')).toMatchObject({
      name: 'Espada longa',
      attackBonus: 5,
      damageRoll: '1d8+3',
      additionalDamage: [{ damageRoll: '1d10+3', damageType: 'cortante' }],
    });
    expect(sheet.speed).toBe(30);
    expect(sheet.savingThrows?.strength).toEqual({ proficient: true, bonus: 5 });
    expect(sheet.savingThrows?.dexterity).toEqual({ proficient: false, bonus: 2 });
    expect(sheet.featuresAndTraits).toContainEqual({ name: 'Estilo de Luta: Defesa', description: '' });
    expect(sheet.featuresAndTraits?.map((f) => (typeof f === 'string' ? f : f.name))).not.toContain('Guerreiro 5');
    expect(sheet.spellcasting).toBeUndefined();
    expect(sheet.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 });
    expect(sheet.inventory).toContainEqual(
      expect.objectContaining({ name: 'A cota-de-malha', quantity: 1, weight: 55, equipped: true, compendiumRef: { bookId: FIXTURE_BOOK, slug: 'cota-de-malha' } }),
    );
  });

  it('fighter: proficiency boxes and languages', () => {
    const p = sheetOf('guerreiro').proficiencies as Record<string, string>;
    expect(p.armor).toBe('Armaduras leves, armaduras médias, armaduras pesadas, escudos');
    expect(p.weapons).toBe('Armas simples, armas marciais');
    expect(p.tools).toBe('Kit de jogo: conjunto de dados, Veículos (terrestres)');
    expect(p.languages).toBe('Comum, Élfico');
  });

  it('barbarian: unarmored defense with DEX and CON', () => {
    const sheet = sheetOf('barbaro');
    expect(sheet.armorClass).toBe(10 + sheet.stats.dexterity.modifier + sheet.stats.constitution.modifier);
    expect(sheet.featuresAndTraits).toContainEqual({ name: 'Espírito Totêmico: Urso', description: '' });
  });

  it('warlock: Armor of Shadows beats the leather armor, which is carried, not worn', () => {
    const sheet = sheetOf('bruxo');
    expect(sheet.armorClass).toBe(13 + sheet.stats.dexterity.modifier);
    expect(sheet.inventory?.find((i) => i.compendiumRef?.slug === 'couro')).toMatchObject({ equippable: true, equipped: false });
  });

  it('bard: Jack of All Trades on unproficient skills and initiative; expertise doubles', () => {
    const sheet = sheetOf('bardo');
    expect(sheet.skills?.athletics).toMatchObject({ proficient: false, otherBonus: 1 });
    expect(sheet.skills?.persuasion).toMatchObject({ proficient: true, expertise: true });
    expect(sheet.skills?.persuasion.otherBonus).toBeUndefined();
    expect(sheet.initiativeBonus).toBe(1);
    expect(sheet.initiative).toBe(sheet.stats.dexterity.modifier + 1);
    expect(sheet.spellcasting?.spells).toHaveLength(6);
    expect(sheet.spellcasting?.spells?.every((s) => s.prepared)).toBe(true);
  });

  it('warlock: pact slots counted once, expanded spells, tome cantrips, Agonizing Blast', () => {
    const sc = sheetOf('bruxo').spellcasting!;
    expect(sc.slots?.['1'].total).toBe(0);
    expect(sc.slots?.['2'].total).toBe(2);
    expect(sc.ability).toBe('charisma');
    expect(sc.spellSaveDC).toBe(13);
    expect(sc.spells?.map((s) => s.compendiumRef?.slug)).toEqual(['magia-1-01', 'patrono-1', 'magia-2-01', 'patrono-2']);
    expect(sc.cantrips).toHaveLength(5);
    expect(attack(sheetOf('bruxo'), 'rajada-mistica')).toMatchObject({ attackBonus: 5, damageRoll: '1d10+3' });
    expect((sheetOf('bruxo').proficiencies as Record<string, string>).tools).toContain('Ferramentas de ladrão');
  });

  it('cleric: heavy armor and shield, domain spells always prepared up to 2nd level', () => {
    const sheet = sheetOf('clerigo');
    expect(sheet.armorClass).toBe(18);
    const spells = sheet.spellcasting!.spells!;
    expect(spells.filter((s) => s.prepared)).toHaveLength(10);
    expect(spells.map((s) => s.compendiumRef?.slug)).toEqual(expect.arrayContaining(['magia-1-11', 'magia-2-02']));
    expect(spells.map((s) => s.compendiumRef?.slug)).not.toContain('magia-3-01');
    expect(sheet.spellcasting?.slots?.['2'].total).toBe(2);
    expect(sheet.speed).toBe(25);
    expect((sheet.proficiencies as Record<string, string>).tools).toBe('Uma ferramenta à escolha entre algumas');
  });

  it('druid: wood elf speed 35 ft; Circle of the Land cantrip and terrain spell', () => {
    const sheet = sheetOf('druida');
    expect(sheet.speed).toBe(35);
    expect(sheet.spellcasting?.cantrips).toHaveLength(3);
    expect(sheet.spellcasting?.spells?.find((s) => s.compendiumRef?.slug === 'magia-2-02')?.prepared).toBe(true);
  });

  it('sorcerer: draconic resilience', () => {
    const sheet = sheetOf('feiticeiro');
    expect(sheet.armorClass).toBe(13 + sheet.stats.dexterity.modifier);
    expect((sheet.proficiencies as Record<string, string>).languages).toContain('Dracônico');
  });

  it('wizard: ten spellbook spells, the first six prepared; the high elf cantrip', () => {
    const sheet = sheetOf('mago');
    const spells = sheet.spellcasting!.spells!;
    expect(spells).toHaveLength(10);
    expect(spells.filter((s) => s.prepared)).toHaveLength(6);
    expect(sheet.spellcasting?.cantrips).toHaveLength(4);
    expect(attack(sheet, 'raio-de-fogo')).toMatchObject({ attackBonus: 5, damageRoll: '1d10' });
    expect((sheet.proficiencies as Record<string, string>).weapons).toContain('Espada longa');
  });

  it('monk: unarmored movement and Mobile: 50 ft; martial arts', () => {
    const sheet = sheetOf('monge');
    expect(sheet.speed).toBe(50);
    expect(sheet.armorClass).toBe(10 + sheet.stats.dexterity.modifier + sheet.stats.wisdom.modifier);
    expect(sheet.attacks?.find((a) => !a.compendiumRef)).toMatchObject({ attackBonus: 5, damageRoll: '1d4+3' });
    expect(sheet.featuresAndTraits).toContainEqual({ name: 'Mobilidade', description: expect.stringContaining('inventado') });
  });

  it('paladin: Dueling on the longsword, oath spell prepared', () => {
    const sheet = sheetOf('paladino');
    expect(sheet.armorClass).toBe(18);
    expect(attack(sheet, 'espada-longa')).toMatchObject({ attackBonus: 5, damageRoll: '1d8+5', additionalDamage: [{ damageRoll: '1d10+3' }] });
    expect(sheet.spellcasting?.spells?.map((s) => s.compendiumRef?.slug)).toContain('magia-1-12');
    expect(sheet.spellcasting?.spells).toHaveLength(4);
  });

  it('ranger: Archery longbow +7 with range in feet', () => {
    const sheet = sheetOf('patrulheiro');
    expect(attack(sheet, 'arco-longo')).toMatchObject({ attackBonus: 7, damageRoll: '1d8+3', range: 150 });
    expect(sheet.speed).toBe(25);
  });

  it("rogue: expertise in thieves' tools as a custom skill; Arcane Trickster's fixed cantrip", () => {
    const sheet = sheetOf('ladino');
    expect(sheet.customSkills).toEqual([{ name: 'Ferramentas de ladrão', ability: 'dexterity', proficient: true, expertise: true }]);
    expect(sheet.skills?.stealth).toMatchObject({ proficient: true, expertise: true });
    expect(sheet.spellcasting?.cantrips).toContain('S maos-magicas');
    expect(sheet.spellcasting?.cantrips).toHaveLength(3);
    expect(sheet.spellcasting?.spells).toHaveLength(3);
  });
});

describe('buildSheet, review fixes', () => {
  const sample = (classSlug: string) => SAMPLES.find((s) => s.choices.classSlug === classSlug)!.choices;
  const featureNames = (sheet: FifthEditionCharacterData) =>
    (sheet.featuresAndTraits ?? []).map((f) => (typeof f === 'string' ? f : f.name));

  it('heavy armor above the character’s STR costs 10 ft of speed', () => {
    const cleric = sample('clerigo');
    const human = buildSheet(
      { ...cleric, raceSlug: 'humano', subraceSlug: undefined, baseScores: scores(['wis', 'con', 'cha', 'dex', 'int', 'str']), optionPicks: { 'race:languageChoice:0': ['Orc'] } },
      CREATION_DATA,
    );
    expect(human.stats.strength.score).toBe(9);
    expect(human.speed).toBe(20);
    const strong = buildSheet({ ...cleric, raceSlug: 'humano', subraceSlug: undefined }, CREATION_DATA);
    expect(strong.stats.strength.score).toBe(14);
    expect(strong.speed).toBe(30);
  });

  it('dwarves (any subrace) ignore the Strength requirement of heavy armor', () => {
    const sheet = buildSheet({ ...sample('clerigo'), baseScores: scores(['wis', 'con', 'cha', 'dex', 'int', 'str']) }, CREATION_DATA);
    expect(sheet.stats.strength.score).toBe(8);
    expect(sheet.speed).toBe(25);
  });

  it("the dragonborn's ancestry and the sorcerer's ancestor are told apart", () => {
    const names = featureNames(sheetOf('feiticeiro')).filter((n) => n.includes('Vermelho'));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it('only the known spells kept spend the free school pick', () => {
    // magia-1-03 and -07 are evocation; -01, -02, -05, -06 enchantment/illusion.
    const rogue = sample('ladino');
    const spells = (spellSlugs: string[]) =>
      buildSheet({ ...rogue, spellSlugs }, CREATION_DATA).spellcasting!.spells!.map((s) => s.compendiumRef!.slug);
    expect(spells(['magia-1-01', 'magia-1-02', 'magia-1-05', 'magia-1-03'])).toEqual(['magia-1-01', 'magia-1-02', 'magia-1-05']);
    expect(spells(['magia-1-03', 'magia-1-07', 'magia-1-01', 'magia-1-02'])).toEqual(['magia-1-01', 'magia-1-02', 'magia-1-03']);
  });

  it('a subrace whose name lacks the race is written with the race', () => {
    expect(sheetOf('patrulheiro').race).toBe('Halfling (Pés-Leves)');
    expect(sheetOf('druida').race).toBe('Elfo da Floresta');
  });

  it('a proficient weapon missing from the compendium gets a readable name', () => {
    const weapons = (sheetOf('mago').proficiencies as Record<string, string>).weapons;
    expect(weapons).toContain('Funda');
    expect(weapons).not.toMatch(/\bfunda\b/);
  });
});
