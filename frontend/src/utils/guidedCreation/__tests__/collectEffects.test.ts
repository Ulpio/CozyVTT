import { describe, expect, it } from 'vitest';
import type { BackgroundData, ClassData, FeatData, RaceData, SubclassData, SubraceData, WeaponData } from '../compendiumData';
import {
  abilityChoiceSlots,
  abilityPickErrors,
  choiceStates,
  collectEffects,
  pruneChoices,
  type RulesData,
} from '../collectEffects';
import { CREATION_DATA } from './fixtures/creationData';
import type { CreationChoices, SkillKey } from '../types';

// Invented placeholder entries: just the fields the rules read, no book text.
const cls = (
  slug: string,
  choose: number,
  from: SkillKey[],
  savingThrows: ClassData['savingThrows'],
  caster = false,
  armor: string[] = [],
) => ({
  slug,
  name: slug,
  data: {
    hitDie: 8,
    savingThrows,
    proficiencies: { armor, weapons: [], tools: [] },
    skills: { choose, from },
    startingEquipment: [],
    subclassLevel: 3,
    features: [],
    ...(caster ? { spellcasting: { ability: 'int' } } : {}),
  } as ClassData,
});

const data: RulesData = {
  races: [
    { slug: 'humano', name: 'Humano', data: { size: 'Médio', speed: 9, traits: [], languages: ['Comum', 'x'] } as RaceData },
    { slug: 'elfo', name: 'Elfo', data: { size: 'Médio', speed: 9, traits: [], proficiencies: ['perception'], abilityIncreases: { dex: 2 } } as RaceData },
  ],
  subraces: [
    { slug: 'humano-variante', name: 'Variante', data: { parent: 'humano', traits: [] } as SubraceData },
  ],
  classes: [
    cls('guerreiro', 2, ['athletics', 'perception', 'survival'], ['str', 'con'], false, ['Todas as armaduras', 'escudos']),
    cls('mago', 2, ['arcana', 'history'], ['int', 'wis'], true),
    cls('ladino', 4, ['acrobatics', 'stealth', 'deception', 'perception', 'investigation'], ['dex', 'int']),
    cls('feiticeiro', 2, ['arcana', 'deception'], ['con', 'cha'], true),
    cls('clerigo', 2, ['history', 'insight', 'medicine', 'persuasion', 'religion'], ['wis', 'cha'], true),
    cls('bruxo', 2, ['arcana', 'deception'], ['wis', 'cha'], true),
    cls('bardo', 3, ['arcana', 'history', 'stealth'], ['dex', 'cha'], true),
    cls('monge', 2, ['acrobatics', 'stealth'], ['str', 'dex']),
  ],
  subclasses: [
    { slug: 'linhagem-draconica', name: 'Linhagem', data: { parent: 'feiticeiro', features: [] } as SubclassData },
    { slug: 'campeao', name: 'Campeão', data: { parent: 'guerreiro', features: [] } as SubclassData },
    { slug: 'mestre-de-batalha', name: 'Mestre', data: { parent: 'guerreiro', features: [] } as SubclassData },
    { slug: 'dominio-do-conhecimento', name: 'Conhecimento', data: { parent: 'clerigo', features: [] } as SubclassData },
    { slug: 'dominio-da-vida', name: 'Vida', data: { parent: 'clerigo', features: [] } as SubclassData },
  ],
  backgrounds: [
    {
      slug: 'acolito',
      name: 'Acólito',
      data: { proficiencies: { skills: ['insight', 'religion'], tools: [] }, languages: 2, equipment: [], feature: { name: 'x', description: 'x' } } as BackgroundData,
    },
  ],
  feats: [
    { slug: 'robusto', name: 'Robusto', data: {} as FeatData },
    { slug: 'alerta', name: 'Alerta', data: {} as FeatData },
    { slug: 'maestria-em-armadura-pesada', name: 'Maestria', data: {} as FeatData },
    { slug: 'imobilizador', name: 'Imobilizador', data: {} as FeatData },
    { slug: 'atirador-de-magia', name: 'Atirador', data: {} as FeatData },
    { slug: 'mestre-de-armas', name: 'Mestre de Armas', data: {} as FeatData },
    { slug: 'perito', name: 'Perito', data: {} as FeatData },
  ],
  weapons: [
    { slug: 'espada-longa', name: 'Espada Longa', data: {} as WeaponData },
    { slug: 'arco-longo', name: 'Arco Longo', data: {} as WeaponData },
  ],
  tools: [
    { slug: 'ferramentas-de-ferreiro', name: 'Ferreiro', data: {} },
    { slug: 'alaude', name: 'Alaúde', data: {} },
    { slug: 'ferramentas-de-ladrao', name: 'Ladrão', data: {} },
  ],
};

const base = (over: Partial<CreationChoices> = {}): CreationChoices => ({
  raceSlug: 'humano',
  classSlug: 'guerreiro',
  subclassSlug: '',
  backgroundSlug: 'acolito',
  method: 'STANDARD_ARRAY',
  baseScores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
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
  details: { name: '' },
  ...over,
});

describe('collectEffects', () => {
  it('lists an unpicked fighting style with its six options', () => {
    const { pending } = collectEffects(base(), data);
    const style = pending.find((p) => p.id === 'fightingStyle');
    expect(style).toMatchObject({ kind: 'option', count: 1 });
    expect(style?.options).toHaveLength(6);
  });

  it('applies a picked option and drops it from pending', () => {
    const { effects, pending } = collectEffects(base({ optionPicks: { fightingStyle: ['defesa'] } }), data);
    expect(pending.find((p) => p.id === 'fightingStyle')).toBeUndefined();
    expect(effects).toContainEqual({ type: 'acBonus', amount: 1, whenArmored: true });
  });

  it('lists the class skill choice and the class saves', () => {
    const { effects, pending } = collectEffects(base({ skillPicks: ['athletics'] }), data);
    expect(effects).toContainEqual({ type: 'save', ability: 'str' });
    const skills = pending.find((p) => p.kind === 'skillChoice');
    expect(skills?.count).toBe(1);
    expect(skills?.options?.map((o) => o.id)).toEqual(['perception', 'survival']);
  });

  it('offers rogue expertise only among proficient skills', () => {
    const choices = base({ raceSlug: 'elfo', classSlug: 'ladino', skillPicks: ['stealth', 'acrobatics', 'deception', 'investigation'] });
    const expertise = collectEffects(choices, data).pending.find((p) => p.kind === 'expertiseChoice');
    expect(expertise?.count).toBe(2);
    expect(expertise?.options?.map((o) => o.id).sort()).toEqual(
      ['acrobatics', 'deception', 'insight', 'investigation', 'perception', 'religion', 'stealth', 'ferramentas-de-ladrao'].sort(),
    );
    const done = collectEffects({ ...choices, expertisePicks: ['stealth', 'perception'] }, data).pending;
    expect(done.find((p) => p.kind === 'expertiseChoice')).toBeUndefined();
  });

  it('gives the Draconic sorcerer hit points and unarmored AC', () => {
    const { effects } = collectEffects(base({ classSlug: 'feiticeiro', subclassSlug: 'linhagem-draconica' }), data);
    expect(effects).toContainEqual({ type: 'hpPerLevel', amount: 1 });
    expect(effects).toContainEqual({ type: 'unarmoredAC', base: 13, abilities: ['dex'] });
  });

  it('ignores a subclass of another class', () => {
    const { effects } = collectEffects(base({ subclassSlug: 'linhagem-draconica' }), data);
    expect(effects).not.toContainEqual({ type: 'hpPerLevel', amount: 1 });
  });

  it('applies the variant human feat', () => {
    const vh = base({ subraceSlug: 'humano-variante' });
    const before = collectEffects(vh, data).pending.find((p) => p.id === 'feat');
    expect(before).toMatchObject({ kind: 'featChoice', count: 1 });
    expect(before?.options).toContainEqual({ id: 'robusto', name: 'Robusto' });
    const { effects, pending } = collectEffects({ ...vh, optionPicks: { feat: ['robusto'] } }, data);
    expect(effects).toContainEqual({ type: 'hpPerLevel', amount: 2 });
    expect(pending.find((p) => p.id === 'feat')).toBeUndefined();
  });

  it('turns race data into effects', () => {
    const { effects } = collectEffects(base({ raceSlug: 'elfo' }), data);
    expect(effects).toContainEqual({ type: 'ability', ability: 'dex', amount: 2 });
    expect(effects).toContainEqual({ type: 'skill', skill: 'perception' });
    expect(effects).toContainEqual({ type: 'skill', skill: 'religion' });
  });

  it('gives nested choices an id under their option', () => {
    const tome = collectEffects(base({ classSlug: 'bruxo', optionPicks: { pactBoon: ['pacto-do-tomo'] } }), data)
      .pending.find((p) => p.kind === 'cantripChoice');
    expect(tome).toMatchObject({ id: 'pactBoon.pacto-do-tomo:cantripChoice:0', count: 3 });
  });
});

describe('pruneChoices', () => {
  it('drops the fighting style when the class changes to wizard', () => {
    const fighter = base({ optionPicks: { fightingStyle: ['defesa'] }, skillPicks: ['athletics', 'perception'] });
    expect(pruneChoices(fighter, data)).toBe(fighter);
    const wizard = pruneChoices({ ...fighter, classSlug: 'mago' }, data);
    expect(wizard.optionPicks.fightingStyle).toBeUndefined();
    expect(wizard.skillPicks).toEqual([]);
  });

  it('drops a subclass of another class and unknown option ids', () => {
    const out = pruneChoices(base({ subclassSlug: 'linhagem-draconica', optionPicks: { fightingStyle: ['nope'] } }), data);
    expect(out.subclassSlug).toBe('');
    expect(out.optionPicks).toEqual({});
  });

  it('drops expertise in a skill no longer proficient and the feat without the variant', () => {
    const rogue = base({
      raceSlug: 'humano',
      subraceSlug: 'humano-variante',
      classSlug: 'ladino',
      skillPicks: ['stealth', 'acrobatics', 'deception', 'investigation'],
      expertisePicks: ['stealth', 'insight'],
      optionPicks: { feat: ['alerta'] },
    });
    expect(pruneChoices(rogue, data)).toBe(rogue);
    const fighter = pruneChoices({ ...rogue, classSlug: 'guerreiro', subraceSlug: undefined }, data);
    expect(fighter.expertisePicks).toEqual([]);
    expect(fighter.optionPicks.feat).toBeUndefined();
  });
});

describe('collectEffects, review round 1', () => {
  const ids = (p: { options?: { id: string }[] } | undefined) => p?.options?.map((o) => o.id) ?? [];

  it('matches skill picks to choices so no legal pick is lost', () => {
    const knowledge = base({
      classSlug: 'clerigo',
      subclassSlug: 'dominio-do-conhecimento',
      backgroundSlug: '',
      skillPicks: ['history', 'religion', 'arcana'],
    });
    expect(pruneChoices(knowledge, data)).toBe(knowledge);
    const { effects, pending } = collectEffects(knowledge, data);
    const skillPending = pending.filter((p) => p.kind === 'skillChoice');
    expect(skillPending.map((p) => p.count)).toEqual([1]);
    expect(effects).toContainEqual({ type: 'expertise', skill: 'arcana' });
    expect(effects.filter((e) => e.type === 'expertise')).toHaveLength(1);
  });

  it('offers invocations only when their prerequisite is met', () => {
    const warlock = base({ classSlug: 'bruxo', optionPicks: { pactBoon: ['pacto-da-corrente'] } });
    const offered = ids(collectEffects(warlock, data).pending.find((p) => p.id === 'invocations'));
    expect(offered).not.toContain('explosao-agonizante');
    expect(offered).not.toContain('livro-de-segredos-antigos');
    expect(offered).toContain('voz-do-mestre-das-correntes');
    const blast = { ...warlock, cantripSlugs: ['rajada-mistica'] };
    expect(ids(collectEffects(blast, data).pending.find((p) => p.id === 'invocations'))).toContain('explosao-agonizante');
  });

  it('drops invocations whose prerequisite went away', () => {
    const tome = base({
      classSlug: 'bruxo',
      cantripSlugs: ['rajada-mistica'],
      optionPicks: { pactBoon: ['pacto-do-tomo'], invocations: ['livro-de-segredos-antigos', 'explosao-agonizante'] },
    });
    expect(pruneChoices(tome, data)).toBe(tome);
    const chain = pruneChoices({ ...tome, optionPicks: { ...tome.optionPicks, pactBoon: ['pacto-da-corrente'] } }, data);
    expect(chain.optionPicks.invocations).toEqual(['explosao-agonizante']);
    const noBlast = pruneChoices({ ...chain, cantripSlugs: [] }, data);
    expect(noBlast.optionPicks.invocations).toBeUndefined();
  });

  it('offers only the feats whose prerequisites are met', () => {
    const vh = (over: Partial<CreationChoices>) => base({ subraceSlug: 'humano-variante', ...over });
    const feats = (c: CreationChoices) => ids(collectEffects(c, data).pending.find((p) => p.id === 'feat'));
    expect(feats(vh({}))).toEqual(['robusto', 'alerta', 'maestria-em-armadura-pesada', 'imobilizador', 'mestre-de-armas', 'perito']);
    const weakWizard = vh({ classSlug: 'mago', baseScores: { str: 12, dex: 14, con: 13, int: 15, wis: 10, cha: 8 } });
    expect(feats(weakWizard)).toEqual(['robusto', 'alerta', 'atirador-de-magia', 'mestre-de-armas', 'perito']);
    // +1 STR from the variant human's own increase reaches 13 before the feat.
    expect(feats({ ...weakWizard, racialChoices: { abilityPicks: ['str', 'dex'] } })).toContain('imobilizador');
  });

  it("the variant human's two +1 picks replace the human's +1 to every score", () => {
    const withIncreases: RulesData = {
      ...data,
      races: data.races!.map((r) =>
        r.slug === 'humano'
          ? { ...r, data: { ...r.data, abilityIncreases: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } } }
          : r,
      ),
    };
    const human = collectEffects(base(), withIncreases).effects.filter((e) => e.type === 'ability');
    expect(human).toHaveLength(6);
    const variant = collectEffects(base({ subraceSlug: 'humano-variante' }), withIncreases).effects;
    expect(variant.filter((e) => e.type === 'ability')).toEqual([]);
    expect(variant).toContainEqual({ type: 'abilityChoice', count: 2, amount: 1 });
  });

  it('reports the picks each choice ended up with', () => {
    const { picks } = collectEffects(base({ optionPicks: { fightingStyle: ['defesa', 'arquearia'] } }), data);
    expect(picks).toEqual([
      { id: 'fightingStyle', effect: expect.objectContaining({ type: 'option' }), picks: ['defesa'] },
    ]);
  });

  it('drops a feat whose prerequisite went away', () => {
    const fighter = base({ subraceSlug: 'humano-variante', optionPicks: { feat: ['maestria-em-armadura-pesada'] } });
    expect(pruneChoices(fighter, data)).toBe(fighter);
    expect(pruneChoices({ ...fighter, classSlug: 'mago' }, data).optionPicks.feat).toBeUndefined();
  });

  it('turns Weapon Master picks into weapon proficiencies', () => {
    const vh = base({ subraceSlug: 'humano-variante', optionPicks: { feat: ['mestre-de-armas'] } });
    const weapons = collectEffects(vh, data).pending.find((p) => p.kind === 'weaponChoice');
    expect(weapons).toMatchObject({ id: 'feat:weaponChoice:0', count: 4 });
    expect(ids(weapons)).toEqual(['espada-longa', 'arco-longo']);
    const picked = { ...vh, optionPicks: { ...vh.optionPicks, 'feat:weaponChoice:0': ['espada-longa'] } };
    const out = collectEffects(picked, data);
    expect(out.effects).toContainEqual({ type: 'weaponProficiency', weapon: 'espada-longa' });
    expect(out.pending.find((p) => p.kind === 'weaponChoice')?.count).toBe(3);
  });

  it('keeps only the language picks still owed after a subclass change', () => {
    const knowledge = base({
      classSlug: 'clerigo',
      subclassSlug: 'dominio-do-conhecimento',
      languagePicks: ['Anão', 'Gnômico'],
      optionPicks: { 'race:languageChoice:0': ['Élfico'], 'subclass:languageChoice:0': ['Orc', 'Infernal'] },
    });
    expect(pruneChoices(knowledge, data)).toBe(knowledge);
    const life = pruneChoices({ ...knowledge, subclassSlug: 'dominio-da-vida' }, data);
    expect(life.optionPicks).toEqual({ 'race:languageChoice:0': ['Élfico'] });
    expect(life.languagePicks).toEqual(['Anão', 'Gnômico']);
    const noBackground = pruneChoices({ ...life, backgroundSlug: 'nenhum' }, data);
    expect(noBackground.languagePicks).toEqual([]);
    expect(pruneChoices(base({ languagePicks: ['a', 'b', 'c'] }), data).languagePicks).toEqual(['a', 'b']);
  });

  it('limits the Battle Master tool to artisan tools', () => {
    const bm = base({ subclassSlug: 'mestre-de-batalha' });
    const tool = collectEffects(bm, data).pending.find((p) => p.kind === 'toolChoice');
    expect(tool).toMatchObject({ id: 'subclass:toolChoice:0', count: 1 });
    expect(ids(tool)).toEqual(['ferramentas-de-ferreiro']);
  });

  it("lets rogue expertise take thieves' tools", () => {
    const rogue = base({ classSlug: 'ladino', skillPicks: ['stealth', 'acrobatics', 'deception', 'investigation'] });
    expect(ids(collectEffects(rogue, data).pending.find((p) => p.kind === 'expertiseChoice'))).toContain(
      'ferramentas-de-ladrao',
    );
    const done = { ...rogue, expertisePicks: ['stealth', 'ferramentas-de-ladrao'] };
    expect(collectEffects(done, data).pending.find((p) => p.kind === 'expertiseChoice')).toBeUndefined();
    expect(pruneChoices(done, data)).toBe(done);
  });
});

describe('collectEffects, Task 11 tool picks and choice states', () => {
  const ids = (p: { options?: { id: string }[] } | undefined) => p?.options?.map((o) => o.id) ?? [];
  const toolEffects = (c: CreationChoices) =>
    collectEffects(c, data).effects.flatMap((e) => (e.type === 'tool' ? [e.tool] : []));

  it('the bard picks three musical instruments', () => {
    const bard = base({ classSlug: 'bardo' });
    const tool = collectEffects(bard, data).pending.find((p) => p.kind === 'toolChoice');
    expect(tool).toMatchObject({ id: 'class:toolChoice:0', count: 3 });
    expect(ids(tool)).toEqual(['alaude']);
    expect(toolEffects({ ...bard, optionPicks: { 'class:toolChoice:0': ['alaude', 'ferramentas-de-ferreiro'] } })).toEqual([
      'alaude',
    ]);
  });

  it("the monk picks one artisan's tool or one musical instrument", () => {
    const monk = base({ classSlug: 'monge' });
    const tool = collectEffects(monk, data).pending.find((p) => p.kind === 'toolChoice');
    expect(tool).toMatchObject({ id: 'class:toolChoice:0', count: 1 });
    expect(ids(tool).sort()).toEqual(['alaude', 'ferramentas-de-ferreiro']);
    const picked = { ...monk, optionPicks: { 'class:toolChoice:0': ['ferramentas-de-ferreiro'] } };
    expect(toolEffects(picked)).toEqual(['ferramentas-de-ferreiro']);
    expect(collectEffects(picked, data).pending.find((p) => p.kind === 'toolChoice')).toBeUndefined();
    expect(pruneChoices({ ...monk, optionPicks: { 'class:toolChoice:0': ['ferramentas-de-ladrao'] } }, data).optionPicks).toEqual({});
  });

  it('Skilled (perito) picks may be skills or tools', () => {
    const skilled = base({
      subraceSlug: 'humano-variante',
      optionPicks: { feat: ['perito'] },
      skillPicks: ['athletics', 'perception', 'arcana'],
    });
    const before = collectEffects(skilled, data).pending.find((p) => p.id === 'feat:skillChoice:0');
    expect(ids(before)).toEqual(expect.arrayContaining(['history', 'alaude', 'ferramentas-de-ladrao']));

    const withTools = { ...skilled, optionPicks: { ...skilled.optionPicks, 'feat:skillChoice:0': ['alaude', 'ferramentas-de-ladrao'] } };
    // Class 2 (athletics, perception) and the variant's 1 (arcana) leave the feat its two tools and one skill.
    const withSkill = { ...withTools, skillPicks: [...withTools.skillPicks, 'history' as SkillKey] };
    const out = collectEffects(withSkill, data);
    expect(out.pending.find((p) => p.id === 'feat:skillChoice:0')).toBeUndefined();
    expect(toolEffects(withSkill)).toEqual(['alaude', 'ferramentas-de-ladrao']);
    expect(pruneChoices(withSkill, data)).toBe(withSkill);
    // A fourth skill has no room left.
    const extra = { ...withSkill, skillPicks: [...withSkill.skillPicks, 'stealth' as SkillKey] };
    expect(pruneChoices(extra, data).skillPicks).toEqual(withSkill.skillPicks);
  });

  it('choiceStates lists each choice with its picks, picked or not', () => {
    const fighter = base({ optionPicks: { fightingStyle: ['defesa'] }, skillPicks: ['athletics'] });
    const states = choiceStates(fighter, data);
    const style = states.find((s) => s.id === 'fightingStyle');
    expect(style).toMatchObject({ count: 1, picks: ['defesa'] });
    expect(ids(style)).toContain('arquearia');
    const skills = states.find((s) => s.id === 'class:skillChoice:0');
    expect(skills).toMatchObject({ count: 2, picks: ['athletics'] });
    // Its own pick stays among its options; the background's skills are not offered.
    expect(ids(skills)).toEqual(['athletics', 'perception', 'survival']);
    expect(states.find((s) => s.id === 'background:languageChoice:0')).toMatchObject({ count: 2, picks: [] });
  });
});

describe('collectEffects, review round 1 of Task 11', () => {
  const fixture = (over: Partial<CreationChoices>) =>
    base({ raceSlug: 'anao', subraceSlug: 'anao-da-colina', backgroundSlug: 'acolito', ...over });

  it('a background skill the race already gives is replaced by a pick of any skill', () => {
    const elfSailor = fixture({ raceSlug: 'elfo', subraceSlug: 'alto-elfo', backgroundSlug: 'marinheiro' });
    const pending = collectEffects(elfSailor, CREATION_DATA).pending.find((p) => p.id === 'background:skillChoice:0');
    expect(pending).toMatchObject({ kind: 'skillChoice', count: 1 });
    expect(pending?.options?.map((o) => o.id)).not.toContain('perception');
    expect(collectEffects(fixture({ backgroundSlug: 'marinheiro' }), CREATION_DATA).pending.map((p) => p.id)).not.toContain(
      'background:skillChoice:0',
    );
  });

  it("a background tool the class already gives is replaced by a pick of any tool (rogue, Criminal's thieves' tools)", () => {
    const rogue = fixture({ classSlug: 'ladino', backgroundSlug: 'criminoso' });
    const tools = collectEffects(rogue, CREATION_DATA).pending.filter((p) => p.kind === 'toolChoice');
    expect(tools.map((p) => p.id)).toEqual(['background:toolChoice:0', 'background:toolChoice:1']);
    expect(tools[1].options?.length).toBe(CREATION_DATA.tools.length);
    // The two background picks share toolPicks, in order.
    const picked = { ...rogue, toolPicks: ['kit-de-jogo-conjunto-de-dados', 'kit-de-disfarce'] };
    expect(collectEffects(picked, CREATION_DATA).effects).toContainEqual({ type: 'tool', tool: 'kit-de-disfarce' });
    expect(collectEffects(fixture({ classSlug: 'guerreiro', backgroundSlug: 'criminoso' }), CREATION_DATA).pending.filter((p) => p.kind === 'toolChoice')).toHaveLength(1);
  });

  it('caps cantrip and spell choices at the spells the books have', () => {
    const highElf = fixture({ raceSlug: 'elfo', subraceSlug: 'alto-elfo' });
    const noSpells = { ...CREATION_DATA, spells: CREATION_DATA.spells.filter((s) => s.slug !== 'raio-de-fogo' && !s.data.classes.includes('mago')) };
    expect(collectEffects(highElf, noSpells).pending.map((p) => p.id)).not.toContain('subrace:cantripChoice:0');
    expect(collectEffects(highElf, CREATION_DATA).pending.map((p) => p.id)).toContain('subrace:cantripChoice:0');
  });

  it('lists the ability choices by source: the race, then the feat', () => {
    const vh = fixture({ raceSlug: 'humano', subraceSlug: 'humano-variante', optionPicks: { feat: ['atleta'] } });
    expect(abilityChoiceSlots(vh, CREATION_DATA).map(({ feat, start, effect }) => [feat, start, effect.count])).toEqual([
      [false, 0, 2],
      [true, 2, 1],
    ]);
    const racialDone = { ...vh, racialChoices: { abilityPicks: ['str', 'dex'] } };
    expect(abilityPickErrors(racialDone, CREATION_DATA, false)).toEqual([]);
    expect(abilityPickErrors(racialDone, CREATION_DATA, true)).toEqual(['missingPick']);
    // The feat may raise an ability the race raised.
    const featDone = { ...vh, racialChoices: { abilityPicks: ['str', 'dex', 'str'] } };
    expect(abilityPickErrors(featDone, CREATION_DATA)).toEqual([]);
    expect(abilityPickErrors({ ...vh, racialChoices: { abilityPicks: ['str', 'dex', 'wis'] } }, CREATION_DATA, true)).toEqual([
      'excludedAbility',
    ]);
  });
});
