import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { characterActions as characterActionsAll, npcActions as npcActionsAll, costFromCastingTime, spellcastingModifier, characterLevel, CompendiumSpell, CompendiumWeapon } from '../catalogue';
import { fifthEditionCharacterDataSchema } from '../../../validators/game-systems/fifthEdition.schema';
import { fifthEditionSpellSaveDC } from '../../../utils/rules/fifthEdition';

const SHEETS = resolve(__dirname, '../../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const sheet = (name: string) => JSON.parse(readFileSync(resolve(SHEETS, `${name}.json`), 'utf8'));

const weapon = (over: Partial<CompendiumWeapon['data']> = {}): CompendiumWeapon => ({
  slug: 'x',
  name: 'X',
  data: { range: 'melee', damage: { dice: '1d8', type: 'cortante' }, properties: [], ...over },
});
const spell = (data: Partial<CompendiumSpell['data']>, name = 'Magia'): CompendiumSpell => ({
  slug: 'm',
  name,
  data: { level: 0, range: '36 metros', concentration: false, ...data },
});

const spells = new Map<string, CompendiumSpell>([
  ['book-test/raio-de-fogo', spell({ range: '36 metros', mechanics: { attack: 'ranged', damage: [{ dice: '1d10', type: 'fogo' }], scaling: { cantrip: true } } }, 'Raio de Fogo')],
  ['book-test/curar-ferimentos', spell({ level: 1, range: 'Toque', mechanics: { damage: [], healing: '1d8', healingAddsModifier: true, scaling: { perSlot: '1d8' } } }, 'Curar Ferimentos')],
  ['book-test/luz', spell({ range: 'Toque', mechanics: { damage: [] } }, 'Luz')],
  ['book-test/bencao', spell({ level: 1, concentration: true, range: '9 metros' }, 'Bênção')],
]);
const weapons = new Map<string, CompendiumWeapon>([
  ['book-test/espada-longa', weapon({ properties: ['versátil'] })],
]);


// Most tests below are about the options a sheet or stat block brings; the common actions are tested apart.
const notCommon = <T extends { option: { group: string } }>(xs: T[]): T[] => xs.filter((x) => x.option.group !== 'common');
const characterActions = (...args: Parameters<typeof characterActionsAll>) => notCommon(characterActionsAll(...args));
const npcActions = (...args: Parameters<typeof npcActionsAll>) => notCommon(npcActionsAll(...args));
describe('characterActions', () => {
  it('lists a fighter weapon with both grips', () => {
    const out = characterActions(sheet('guerreiro'), spells, weapons);
    const a = out.find((s) => s.option.id === 'attack:0')!;
    expect(a.option).toMatchObject({ name: 'Espada longa', group: 'attack', resolution: 'attack', grips: ['one', 'two'], reach: { kind: 'feet', normal: 5 } });
    expect(a.attackBonus).toBe(5);
    expect(a.damage).toEqual([{ dice: '1d8+3', type: 'cortante' }]);
    expect(a.versatileDamage).toEqual({ dice: '1d10+3', type: 'cortante' });
    const b = out.find((s) => s.option.id === 'attack:1')!;
    expect(b.option.grips).toBeUndefined();
  });

  it('lists a wizard attack cantrip once, as the spell', () => {
    const out = characterActions(sheet('mago'), spells, weapons);
    const s = out.find((x) => x.option.id === 'spell:book-test/raio-de-fogo')!;
    expect(s.option).toMatchObject({ name: 'Raio de Fogo', group: 'spell', resolution: 'attack', spellLevel: 0, reach: { kind: 'feet', normal: 120 } });
    expect(s.attackBonus).toBe(5);
    expect(s.damage).toEqual([{ dice: '1d10', type: 'fogo' }]);
    expect(s.scaling).toEqual({ cantrip: true });
    expect(out.filter((x) => x.option.name.toLowerCase().includes('fogo'))).toHaveLength(1);
    expect(out.find((x) => x.option.id === 'attack:0')).toBeDefined();
    expect(out.find((x) => x.option.id === 'attack:1')).toBeUndefined();
  });

  it('adds the sheet row\'s flat modifier to an attack cantrip it duplicates, keeping the book\'s dice', () => {
    const withRow = (roll: string) => {
      const w = sheet('mago');
      w.attacks.find((a: any) => a.name === 'S raio-de-fogo').damageRoll = roll;
      const found = characterActions(w, spells, weapons).find((x) => x.option.id === 'spell:book-test/raio-de-fogo')!;
      return found.damage;
    };
    expect(withRow('1d10+3')).toEqual([{ dice: '1d10+3', type: 'fogo' }]);
    expect(withRow('1d10 - 1')).toEqual([{ dice: '1d10-1', type: 'fogo' }]);
    expect(withRow('1d10')).toEqual([{ dice: '1d10', type: 'fogo' }]);
    expect(withRow('muito')).toEqual([{ dice: '1d10', type: 'fogo' }]);
  });

  it('lists a healing spell with the modifier flag', () => {
    const c = sheet('clerigo');
    c.spellcasting.spells = [{ level: 1, name: 'Curar Ferimentos', prepared: true, ritual: false, concentration: false, compendiumRef: { bookId: 'book-test', slug: 'curar-ferimentos' } }];
    const s = characterActions(c, spells, weapons).find((x) => x.option.id === 'spell:book-test/curar-ferimentos')!;
    expect(s.option).toMatchObject({ resolution: 'heal', spellLevel: 1, reach: { kind: 'touch' } });
    expect(s.healing).toEqual({ dice: '1d8', addModifier: true });
    expect(s.scaling).toEqual({ perSlot: '1d8' });
  });

  it('lists a spell without attack or healing as a cast, with concentration', () => {
    const c = sheet('clerigo');
    c.spellcasting.spells = [{ level: 1, name: 'Bênção', prepared: true, ritual: false, concentration: true, compendiumRef: { bookId: 'book-test', slug: 'bencao' } }];
    const s = characterActions(c, spells, weapons).find((x) => x.option.id === 'spell:book-test/bencao')!;
    expect(s.option).toMatchObject({ resolution: 'cast', concentration: true });
  });

  it('gives a hand-made melee weapon 5 ft reach', () => {
    const out = characterActions({ attacks: [{ name: 'Clava', attackBonus: 3, damageRoll: '1d4+1' }] } as any, spells, weapons);
    expect(out).toHaveLength(1);
    expect(out[0].option).toMatchObject({ id: 'attack:0', name: 'Clava', reach: { kind: 'feet', normal: 5 } });
    expect(out[0].damage).toEqual([{ dice: '1d4+1', type: undefined }]);
  });

  it('gives a reach weapon 10 ft', () => {
    const out = characterActions({ attacks: [{ name: 'Chicote', attackBonus: 3, damageRoll: '1d4', properties: ['alcance'] }] } as any, spells, weapons);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 10 });
  });

  it('adds extra damage lines that are not the two-handed one', () => {
    const out = characterActions({ attacks: [{ name: 'Espada Flamejante', attackBonus: 6, damageRoll: '1d8+3', damageType: 'cortante', additionalDamage: [{ label: 'Fogo', damageRoll: '1d6', damageType: 'fogo' }, { label: '', damageRoll: '' }] }] } as any, spells, weapons);
    expect(out[0].damage).toEqual([{ dice: '1d8+3', type: 'cortante' }, { dice: '1d6', type: 'fogo' }]);
    expect(out[0].option.grips).toBeUndefined();
  });

  it('adds a thrown option for a thrown weapon, from its compendium range', () => {
    const w = new Map([['book-test/adaga', weapon({ properties: ['acuidade', 'leve', 'arremesso'], normalRange: 6, longRange: 18 })]]);
    const out = characterActions({ attacks: [{ name: 'Adaga', attackBonus: 4, damageRoll: '1d4+2', compendiumRef: { bookId: 'book-test', slug: 'adaga' } }] } as any, spells, w);
    expect(out.map((x) => x.option.id)).toEqual(['attack:0', 'attack:0:thrown']);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 5 });
    expect(out[1].option.reach).toEqual({ kind: 'feet', normal: 20, long: 60 });
    expect(out[1].damage).toEqual(out[0].damage);
  });

  it('reads a ranged weapon range in feet', () => {
    const w = new Map([['book-test/arco', weapon({ range: 'ranged', normalRange: 24, longRange: 96, properties: ['munição'] })]]);
    const out = characterActions({ attacks: [{ name: 'Arco', attackBonus: 4, damageRoll: '1d8', compendiumRef: { bookId: 'book-test', slug: 'arco' } }] } as any, spells, w);
    expect(out).toHaveLength(1);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 80, long: 320 });
  });

  it("reads a hand-made ranged weapon's range from the sheet, in feet", () => {
    const out = characterActions({ attacks: [{ name: 'Funda', attackBonus: 3, damageRoll: '1d4+1', range: 30 }] } as any, spells, weapons);
    expect(out).toHaveLength(1);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 30 });
  });

  it("keeps a hand-made thrown weapon in melee and throws it to the sheet's range", () => {
    const out = characterActions({ attacks: [{ name: 'Lança', attackBonus: 3, damageRoll: '1d6+1', range: 20, properties: ['thrown'] }] } as any, spells, weapons);
    expect(out.map((x) => x.option.id)).toEqual(['attack:0', 'attack:0:thrown']);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 5 });
    expect(out[1].option.reach).toEqual({ kind: 'feet', normal: 20 });
  });

  it('reads the English reach property', () => {
    const out = characterActions({ attacks: [{ name: 'Whip', attackBonus: 3, damageRoll: '1d4', properties: ['Reach'] }] } as any, spells, weapons);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 10 });
  });

  it('lists a spell with no compendium entry as a cast, by its index on the sheet', () => {
    const c = sheet('clerigo');
    c.spellcasting.spells = [
      { level: 1, name: 'Bênção', prepared: true, ritual: false, concentration: true, compendiumRef: { bookId: 'book-test', slug: 'bencao' } },
      { level: 2, name: 'Magia caseira', prepared: true, ritual: false, concentration: true },
    ];
    c.spellcasting.cantrips = [...c.spellcasting.cantrips, 'Truque caseiro'];
    const out = characterActions(c, spells, weapons);
    const s = out.find((x) => x.option.id === 'spell:sheet:1')!;
    expect(s.option).toMatchObject({ name: 'Magia caseira', group: 'spell', resolution: 'cast', spellLevel: 2, concentration: true });
    const cantrip = out.find((x) => x.option.id === `spell:sheet-cantrip:${c.spellcasting.cantrips.length - 1}`)!;
    expect(cantrip.option).toMatchObject({ name: 'Truque caseiro', resolution: 'cast', spellLevel: 0 });
    // A cantrip the sheet already points at a book for is listed once, by its book id.
    expect(out.filter((x) => x.option.name === 'S luz' || x.option.id.startsWith('spell:sheet-cantrip:')).length).toBe(1);
  });

  it('leaves out a spell with no compendium entry that the sheet already lists as an attack', () => {
    const out = characterActions({
      attacks: [{ name: 'Rajada caseira', attackBonus: 5, damageRoll: '1d10' }],
      spellcasting: { cantrips: ['Rajada caseira'], spells: [] },
    } as any, spells, weapons);
    expect(out.map((x) => x.option.id)).toEqual(['attack:0']);
  });

  it('gives a cast spell its compendium text to post', () => {
    const withText = new Map(spells);
    withText.set('book-test/bencao', { ...spells.get('book-test/bencao')!, text: 'Texto inventado da magia.' });
    const c = sheet('clerigo');
    c.spellcasting.spells = [{ level: 1, name: 'Bênção', prepared: true, ritual: false, concentration: true, compendiumRef: { bookId: 'book-test', slug: 'bencao' } }];
    const s = characterActions(c, withText, weapons).find((x) => x.option.id === 'spell:book-test/bencao')!;
    expect(s.description).toBe('Texto inventado da magia.');
  });

  it('keeps an attack with unreadable damage, with no damage', () => {
    const out = characterActions({ attacks: [{ name: 'Golpe', attackBonus: 3, damageRoll: 'muito' }] } as any, spells, weapons);
    expect(out[0].option.id).toBe('attack:0');
    expect(out[0].damage).toEqual([]);
  });

  it('normalises a unicode minus in dice', () => {
    const out = characterActions({ attacks: [{ name: 'Bordão', attackBonus: 0, damageRoll: '1d6\u22121' }] } as any, spells, weapons);
    expect(out[0].damage).toEqual([{ dice: '1d6-1', type: undefined }]);
  });

  it('works on a sheet with no attacks and no spellcasting', () => {
    expect(characterActions({} as any, spells, weapons)).toEqual([]);
  });

  it('all fixture sheets list without throwing and with unique ids', () => {
    for (const n of ['barbaro', 'bardo', 'bruxo', 'clerigo', 'druida', 'feiticeiro', 'guerreiro', 'ladino', 'mago', 'monge', 'paladino', 'patrulheiro']) {
      const ids = characterActions(sheet(n), spells, weapons).map((s) => s.option.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('spellcastingModifier and characterLevel', () => {
  it('reads the ability modifier and level from the sheet', () => {
    const c = sheet('clerigo');
    expect(spellcastingModifier(c)).toBe(Math.floor((c.stats.wisdom.score - 10) / 2));
    expect(characterLevel(c)).toBe(c.level);
  });
  it('is 0 and 1 for a bare sheet', () => {
    expect(spellcastingModifier({} as any)).toBe(0);
    expect(characterLevel({} as any)).toBe(1);
  });
});

describe('schema fields', () => {
  it('accepts concentratingOn, and sheets without it', () => {
    const c = sheet('clerigo');
    expect(fifthEditionCharacterDataSchema.safeParse(c).success).toBe(true);
    const withIt = fifthEditionCharacterDataSchema.safeParse({ ...c, concentratingOn: { name: 'Bênção', compendiumRef: { bookId: 'book-test', slug: 'bencao' } } });
    expect(withIt.success && withIt.data.concentratingOn?.name).toBe('Bênção');
    expect(fifthEditionCharacterDataSchema.safeParse({ ...c, concentratingOn: null }).success).toBe(true);
  });
});

describe('npcActions', () => {
  const goblin = {
    actions: [
      { name: 'Cimitarra', description: 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.' },
      { name: 'Arco Curto', description: 'Ataque à Distância com Arma: +4 para atingir, distância 24/96 m, um alvo. Acerto: 5 (1d6 + 2) de dano perfurante.' },
    ],
    bonusActions: [{ name: 'Fuga Ágil', description: 'O goblin pode usar Desengajar ou Esconder como ação bônus.' }],
  };

  it('lists the goblin attacks as attacks and the rest as posts', () => {
    const out = npcActions(goblin as any);
    expect(out.map((o) => o.option.id)).toEqual(['npc:actions:0', 'npc:actions:1', 'npc:bonusActions:0']);
    expect(out.filter((o) => o.option.resolution === 'attack')).toHaveLength(2);
    expect(out[0]).toMatchObject({ attackBonus: 4, damage: [{ dice: '1d6 + 2', type: 'cortante' }] });
    expect(out[0].option).toMatchObject({ group: 'npc', name: 'Cimitarra', reach: { kind: 'feet', normal: 5 } });
    expect(out[0].option.summary).toBe('+4, 1d6 + 2 cortante');
    expect(out[1].option.reach).toEqual({ kind: 'feet', normal: 80, long: 320 });
    expect(out[2].option.resolution).toBe('post');
    expect(out[2].description).toMatch(/Desengajar/);
  });

  it('handles an empty stat block and reactions', () => {
    expect(npcActions({} as any)).toEqual([]);
    expect(npcActions({ reactions: [{ name: 'Aparar', description: 'Texto.' }] } as any)[0].option.id).toBe('npc:reactions:0');
  });

  it('marks a Multiattack action as the one that starts the Attack action, and nothing else', () => {
    const out = npcActions({
      actions: [
        { name: 'Ataques Múltiplos', description: 'Faz dois ataques.' },
        { name: 'Multiataque', description: 'Faz três ataques.' },
        { name: 'Multiattack', description: 'Two attacks.' },
        { name: 'Rugido', description: 'Texto.' },
      ],
      bonusActions: [{ name: 'Multiataque rápido', description: 'Texto.' }],
    } as any);
    expect(out.map((o) => o.option.startsAttackAction)).toEqual([true, true, true, undefined, undefined]);
    expect(out[0].option).toMatchObject({ resolution: 'post', cost: 'action' });
  });

  it('posts the text of an attack whose damage cannot be read (a net, say)', () => {
    const description = 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (muito) de dano cortante.';
    const out = npcActions({ actions: [{ name: 'X', description }] } as any);
    expect(out[0].option).toMatchObject({ id: 'npc:actions:0', resolution: 'post' });
    expect(out[0].description).toBe(description);
  });
});

describe('save spells, rays and areas', () => {
  const ref = (slug: string) => ({ bookId: 'book-test', slug });
  const saveSpells = new Map<string, CompendiumSpell>([
    ['book-test/bola-de-fogo', spell({ level: 3, range: '45 metros', mechanics: { save: 'dex', damage: [{ dice: '8d6', type: 'fogo' }], halfOnSave: true, area: { shape: 'esfera', size: '6 m de raio' }, scaling: { perSlot: '1d6' } } }, 'Bola de Fogo')],
    ['book-test/maos-flamejantes', spell({ level: 1, range: 'Pessoal (cone de 4,5 metros)', mechanics: { save: 'dex', damage: [{ dice: '3d6', type: 'fogo' }], halfOnSave: true, area: { shape: 'cone', size: '4,5 m' } } }, 'Mãos Flamejantes')],
    ['book-test/rajada-mistica', spell({ range: '36 metros', mechanics: { attack: 'ranged', damage: [{ dice: '1d10', type: 'energia' }], rays: { count: 1, cantripLevels: true } } }, 'Rajada Mística')],
    ['book-test/misseis-magicos', spell({ level: 1, range: '36 metros', mechanics: { damage: [{ dice: '1d4+1', type: 'energia' }], rays: { count: 3, perSlot: 1 }, autoHit: true } }, 'Mísseis Mágicos')],
    ['book-test/raio-ardente', spell({ level: 2, range: '36 metros', mechanics: { attack: 'ranged', damage: [{ dice: '2d6', type: 'fogo' }], rays: { count: 3, perSlot: 1 } } }, 'Raio Ardente')],
    ['book-test/toque-gelido', spell({ level: 1, range: 'Toque', mechanics: { save: 'con', damage: [{ dice: '2d8', type: 'frio' }], halfOnSave: true, area: { shape: 'esfera', size: '1,5 m de raio' } } }, 'Toque Gélido')],
    ['book-test/imobilizar-pessoa', spell({ level: 2, concentration: true, range: '18 metros', mechanics: { save: 'wis', damage: [], targets: 1, targetsPerSlot: 1 } }, 'Imobilizar Pessoa')],
    ['book-test/chuva-de-meteoros', spell({ level: 9, range: '1,5 quilômetro', mechanics: { damage: [], castOnly: 'dois efeitos de área' } }, 'Chuva de Meteoros')],
    ['book-test/corrente-de-relampagos', spell({ level: 6, range: '45 metros', mechanics: { save: 'dex', damage: [{ dice: '10d8', type: 'elétrico' }], halfOnSave: true, targets: 4 } }, 'Corrente de Relâmpagos')],
    ['book-test/curar-ferimentos-em-massa', spell({ level: 5, range: '18 metros', mechanics: { damage: [], healing: '3d8', healingAddsModifier: true, targets: 6, scaling: { perSlot: '1d8' } } }, 'Curar Ferimentos em Massa')],
    ['book-test/cura-completa', spell({ level: 6, range: '18 metros', mechanics: { damage: [], healing: '70', targets: 1, scaling: { perSlot: '10' } } }, 'Cura Completa')],
    ['book-test/toque-vampirico', spell({ level: 3, range: 'Pessoal', mechanics: { attack: 'melee', damage: [{ dice: '3d6', type: 'necrótico' }], selfHeal: 'half-damage' } }, 'Toque Vampírico')],
  ]);
  const caster = (base: string, level: number, slugs: string[]) => {
    const c = sheet(base);
    c.level = level;
    c.spellcasting.cantripRefs = [];
    c.spellcasting.cantrips = [];
    c.spellcasting.spells = slugs.map((slug) => ({ level: 1, name: slug, prepared: true, ritual: false, concentration: false, compendiumRef: ref(slug) }));
    return c;
  };
  const optionOf = (c: any, slug: string) => characterActions(c, saveSpells, weapons).find((x) => x.option.id === `spell:book-test/${slug}`)!;

  it('lists Fireball as a save with the caster DC and a point area', () => {
    const wiz = caster('mago', 5, ['bola-de-fogo']);
    const s = optionOf(wiz, 'bola-de-fogo');
    expect(s.option).toMatchObject({
      resolution: 'save',
      saveAbility: 'dex',
      saveDc: fifthEditionSpellSaveDC(wiz),
      targeting: { kind: 'area', area: { shape: 'sphere', sizeFt: 20 }, origin: 'point', rangeFeet: 150 },
    });
    expect(s.save).toEqual({ ability: 'dex', dc: fifthEditionSpellSaveDC(wiz), damage: [{ dice: '8d6', type: 'fogo' }], halfOnSave: true });
    expect(s.scaling).toEqual({ perSlot: '1d6' });
    expect(s.source).toBe('spell');
  });

  it('places a touch area at a point within 5 feet', () => {
    const s = optionOf(caster('mago', 5, ['toque-gelido']), 'toque-gelido');
    expect(s.option.targeting).toEqual({ kind: 'area', area: { shape: 'sphere', sizeFt: 5 }, origin: 'point', rangeFeet: 5 });
  });

  it('lists Burning Hands as a cone from the caster', () => {
    const s = optionOf(caster('mago', 5, ['maos-flamejantes']), 'maos-flamejantes');
    expect(s.option.targeting).toEqual({ kind: 'area', area: { shape: 'cone', sizeFt: 15 }, origin: 'self' });
    expect(s.option.reach).toEqual({ kind: 'self' });
  });

  it('gives Eldritch Blast 1, 2, 3 or 4 beams by character level and adds the sheet row modifier to each', () => {
    const at = (level: number) => {
      const lock = sheet('bruxo');
      lock.level = level;
      return characterActions(lock, saveSpells, weapons).find((x) => x.option.id === 'spell:book-test/rajada-mistica')!;
    };
    expect(at(1).option.targeting).toEqual({ kind: 'multi', count: 1, distinct: false });
    expect(at(5).option.targeting).toEqual({ kind: 'multi', count: 2, distinct: false });
    expect(at(11).option.targeting).toEqual({ kind: 'multi', count: 3, distinct: false });
    expect(at(17).option.targeting).toEqual({ kind: 'multi', count: 4, distinct: false });
    expect(at(5)).toMatchObject({ option: { resolution: 'attack' }, damage: [{ dice: '1d10+3', type: 'energia' }], rays: { count: 1, cantripLevels: true } });
  });

  it('lists Magic Missile as auto-hit darts and Scorching Ray as attack rays', () => {
    const wiz = caster('mago', 5, ['misseis-magicos', 'raio-ardente']);
    const mm = optionOf(wiz, 'misseis-magicos');
    expect(mm.option).toMatchObject({ resolution: 'attack', targeting: { kind: 'multi', count: 3, perSlot: 1, distinct: false } });
    expect(mm.autoHit).toBe(true);
    expect(mm.attackBonus).toBeUndefined();
    const sr = optionOf(wiz, 'raio-ardente');
    expect(sr.option.targeting).toEqual({ kind: 'multi', count: 3, perSlot: 1, distinct: false });
    expect(sr.attackBonus).toBe(5);
    expect(sr.autoHit).toBeUndefined();
  });

  it('lists Hold Person and Chain Lightning with distinct targets', () => {
    const wiz = caster('mago', 9, ['imobilizar-pessoa', 'corrente-de-relampagos']);
    const hold = optionOf(wiz, 'imobilizar-pessoa');
    expect(hold.option).toMatchObject({ resolution: 'save', saveAbility: 'wis', targeting: { kind: 'multi', count: 1, perSlot: 1, distinct: true } });
    expect(hold.save?.damage).toEqual([]);
    expect(optionOf(wiz, 'corrente-de-relampagos').option.targeting).toEqual({ kind: 'multi', count: 4, distinct: true });
  });

  it('keeps a cast-only spell a cast', () => {
    const s = optionOf(caster('mago', 9, ['chuva-de-meteoros']), 'chuva-de-meteoros');
    expect(s.option.resolution).toBe('cast');
    expect(s.option.targeting).toBeUndefined();
  });

  it('gives a mass heal several distinct targets and a single heal none', () => {
    const cle = caster('clerigo', 9, ['curar-ferimentos-em-massa', 'cura-completa']);
    const mass = optionOf(cle, 'curar-ferimentos-em-massa');
    expect(mass.option).toMatchObject({ resolution: 'heal', targeting: { kind: 'multi', count: 6, distinct: true } });
    const heal = optionOf(cle, 'cura-completa');
    expect(heal.option.targeting).toBeUndefined();
    expect(heal.healing).toEqual({ dice: '70', addModifier: false });
  });

  it('carries the self-heal of a draining touch', () => {
    expect(optionOf(caster('mago', 5, ['toque-vampirico']), 'toque-vampirico').selfHeal).toBe('half-damage');
  });
});

describe('npcActions saves', () => {
  const breath = 'O dragão exala fogo em um cone de 18 metros. Cada criatura na área deve fazer um teste de resistência de Destreza CD 21, sofrendo 63 (18d6) de dano de fogo se falhar, ou metade desse dano se obtiver sucesso.';
  const block = {
    actions: [
      { name: 'Mordida', description: 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano perfurante.' },
      { name: 'Sopro de Fogo (Recarrega 5–6)', description: breath },
    ],
  };

  it('lists a breath weapon as a save with an area from the monster and its recharge', () => {
    const out = npcActions(block as any);
    expect(out[1].option).toMatchObject({
      id: 'npc:actions:1',
      resolution: 'save',
      saveAbility: 'dex',
      targeting: { kind: 'area', area: { shape: 'cone', sizeFt: 60 }, origin: 'self' },
      recharge: { min: 5, spent: false },
    });
    expect(out[1].option.saveDc).toBeUndefined();
    // The GM's line under the button, in pt-BR like the damage types in it.
    expect(out[1].option.summary).toBe('CD 21 Des, 18d6 fogo');
    expect(out[1].save).toMatchObject({ ability: 'dex', dc: 21, damage: [{ dice: '18d6', type: 'fogo' }], halfOnSave: true });
    expect(out[1].source).toBe('monster');
    expect(out[0].source).toBe('monster');
  });

  it('marks the recharge spent when the token lists the option id', () => {
    expect(npcActions(block as any, ['npc:actions:1'])[1].option.recharge).toEqual({ min: 5, spent: true });
    expect(npcActions(block as any, ['npc:actions:0'])[1].option.recharge).toEqual({ min: 5, spent: false });
  });

  it('places a ranged monster sphere at a point, and keeps a cone at the monster', () => {
    const out = npcActions({ actions: [{ name: 'Granizo', description: 'O monstro lança uma bola de gelo num ponto a até 36 metros dele; cada criatura numa esfera de 6 metros de raio ali faz um teste de resistência de Destreza CD 15, sofrendo 22 (5d8) de dano de frio se falhar, ou metade desse dano se passar.' }] } as any);
    expect(out[0].option.targeting).toEqual({ kind: 'area', area: { shape: 'sphere', sizeFt: 20 }, origin: 'point', rangeFeet: 120 });
    expect(npcActions(block as any)[1].option.targeting).toMatchObject({ origin: 'self' });
  });

  it('lists a save with no damage as a single-target save for the GM to read', () => {
    const out = npcActions({ actions: [{ name: 'Engolir', description: 'O monstro engole um alvo. O alvo deve ser bem-sucedido em um teste de resistência de Força CD 15 ou fica agarrado.' }] } as any);
    expect(out[0].option).toMatchObject({ resolution: 'save', saveAbility: 'str', targeting: { kind: 'single' } });
    expect(out[0].damage).toEqual([]);
    expect(out[0].save?.extraText).toBeTruthy();
    expect(out[0].extraText).toBe(out[0].save?.extraText);
  });

  it('keeps the save rider of an attack on the attack', () => {
    const d = 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano perfurante. O alvo deve ser bem-sucedido em um teste de resistência de Constituição CD 11, ou fica envenenado por 1 minuto.';
    const out = npcActions({ actions: [{ name: 'Ferrão', description: d }] } as any);
    expect(out[0].option.resolution).toBe('attack');
    expect(out[0].onHitSave).toMatchObject({ ability: 'con', dc: 11 });
  });
});

const DATA = resolve(__dirname, '../../../../../materiais/.compendio/data/phb');
(existsSync(resolve(DATA, 'spell.json')) ? describe : describe.skip)('real compendium data', () => {
  it('curated healing spells add the modifier', () => {
    const all = JSON.parse(readFileSync(resolve(DATA, 'spell.json'), 'utf8'));
    for (const slug of ['curar-ferimentos', 'palavra-curativa', 'oracao-curativa']) {
      expect(all.find((s: any) => s.slug === slug).data.mechanics.healingAddsModifier).toBe(true);
    }
  });
});

describe('the cost of each option in the turn', () => {
  const casting = (castingTime: string, data: Partial<CompendiumSpell['data']> = {}) => spell({ castingTime, ...data } as any);
  const withSpells = new Map<string, CompendiumSpell>([
    ['b/bola-de-fogo', casting('1 ação', { level: 3, mechanics: { save: 'dex', damage: [{ dice: '8d6', type: 'fogo' }], area: { shape: 'sphere', size: '6 metros' } } })],
    ['b/palavra-curativa', casting('1 ação bônus', { level: 1, range: '18 metros', mechanics: { damage: [], healing: '1d4' } })],
    ['b/escudo', casting('1 reação, que você toma quando é atingido', { level: 1, range: 'Pessoal' })],
    ['b/ritual', casting('10 minutos', { level: 1, range: 'Pessoal' })],
  ]);
  const caster = {
    level: 5,
    spellcasting: {
      spells: [
        { name: 'Bola', level: 3, compendiumRef: { bookId: 'b', slug: 'bola-de-fogo' } },
        { name: 'Palavra', level: 1, compendiumRef: { bookId: 'b', slug: 'palavra-curativa' } },
        { name: 'Escudo', level: 1, compendiumRef: { bookId: 'b', slug: 'escudo' } },
        { name: 'Ritual', level: 1, compendiumRef: { bookId: 'b', slug: 'ritual' } },
        { name: 'Sem livro', level: 1 },
      ],
    },
  } as any;
  const byId = (id: string) => characterActionsAll(caster, withSpells, weapons).find((s) => s.option.id === id)!.option;

  it('reads the casting time of a spell', () => {
    expect(costFromCastingTime('1 ação')).toEqual({ cost: 'action' });
    expect(costFromCastingTime('1 Ação Bônus')).toEqual({ cost: 'bonus' });
    expect(costFromCastingTime('1 reação, que você toma quando algo acontece')).toEqual({ cost: 'reaction' });
    expect(costFromCastingTime('1 hora')).toEqual({ cost: 'action', combatUnavailable: true });
    expect(costFromCastingTime('')).toEqual({ cost: 'action' });
  });

  it('gives spells the cost of their casting time', () => {
    expect(byId('spell:b/bola-de-fogo')).toMatchObject({ cost: 'action', castingTime: '1 ação' });
    expect(byId('spell:b/palavra-curativa').cost).toBe('bonus');
    expect(byId('spell:b/escudo').cost).toBe('reaction');
    expect(byId('spell:b/ritual')).toMatchObject({ cost: 'action', combatUnavailable: true });
    expect(byId('spell:b/bola-de-fogo').combatUnavailable).toBeUndefined();
  });

  it('gives a sheet-only spell the action', () => {
    expect(byId('spell:sheet:4')).toMatchObject({ cost: 'action' });
    expect(byId('spell:sheet:4').castingTime).toBeUndefined();
  });

  it('marks weapon attacks as attacks, melee ones apart from thrown and ranged', () => {
    const w = new Map([
      ['b/espada-longa', weapon({ properties: ['versátil'] })],
      ['b/machadinha', weapon({ properties: ['leve', 'arremesso'], normalRange: 6, longRange: 18 })],
      ['b/arco', weapon({ range: 'ranged', normalRange: 24, longRange: 96, properties: ['munição'] })],
    ]);
    const ref = (slug: string) => ({ bookId: 'b', slug });
    const out = characterActionsAll({ attacks: [
      { name: 'Espada longa', attackBonus: 5, damageRoll: '1d8+3', compendiumRef: ref('espada-longa') },
      { name: 'Machadinha', attackBonus: 5, damageRoll: '1d6+3', compendiumRef: ref('machadinha') },
      { name: 'Arco', attackBonus: 5, damageRoll: '1d8', compendiumRef: ref('arco') },
      { name: 'Funda', attackBonus: 3, damageRoll: '1d4', range: 30 },
      { name: 'Soco', attackBonus: 3, damageRoll: '1' },
    ] } as any, spells, w);
    const o = (id: string) => out.find((s) => s.option.id === id)!.option;
    expect(o('attack:0')).toMatchObject({ cost: 'attack', meleeWeapon: true });
    expect(o('attack:1')).toMatchObject({ cost: 'attack', meleeWeapon: true });
    expect(o('attack:1:thrown')).toMatchObject({ cost: 'attack' });
    expect(o('attack:1:thrown').meleeWeapon).toBeUndefined();
    expect(o('attack:2')).toMatchObject({ cost: 'attack' });
    expect(o('attack:2').meleeWeapon).toBeUndefined();
    expect(o('attack:3').meleeWeapon).toBeUndefined();
    expect(o('attack:4')).toMatchObject({ cost: 'attack', meleeWeapon: true });
  });

  it('gives monster options the cost of their list', () => {
    const out = npcActionsAll({
      actions: [
        { name: 'Cimitarra', description: 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.' },
        { name: 'Rugido', description: 'O monstro ruge alto.' },
      ],
      bonusActions: [{ name: 'Fuga Ágil', description: 'Usa Esconder.' }],
      reactions: [{ name: 'Aparar', description: 'Reduz o dano.' }],
    } as any);
    const cost = (id: string) => out.find((s) => s.option.id === id)!.option.cost;
    expect(cost('npc:actions:0')).toBe('attack');
    expect(cost('npc:actions:1')).toBe('action');
    expect(cost('npc:bonusActions:0')).toBe('bonus');
    expect(cost('npc:reactions:0')).toBe('reaction');
  });

  it('lists the five common actions for a character and for a monster', () => {
    for (const out of [characterActionsAll(caster, withSpells, weapons), npcActionsAll({ actions: [] } as any)]) {
      const common = out.filter((s) => s.option.group === 'common');
      expect(common.map((s) => [s.option.id, s.option.name])).toEqual([
        ['common:dash', 'Disparada'],
        ['common:disengage', 'Desengajar'],
        ['common:dodge', 'Esquivar'],
        ['common:help', 'Ajudar'],
        ['common:hide', 'Esconder'],
      ]);
      for (const s of common) expect(s.option).toMatchObject({ resolution: 'post', cost: 'action' });
    }
  });
});

describe('characterActions: what is in hand', () => {
  const ref = (slug: string) => ({ bookId: 'book-test', slug });
  const handSheet = (inventory: any[], attacks: any[]) => ({ inventory, attacks }) as any;
  const longsword = { name: 'Espada longa', attackBonus: 5, damageRoll: '1d8+3', damageType: 'cortante', itemId: 'sword', compendiumRef: ref('espada-longa'), additionalDamage: [{ label: 'Duas mãos', damageRoll: '1d10+3', damageType: 'cortante' }] };
  const dagger = { name: 'Adaga', attackBonus: 5, damageRoll: '1d4+3', damageType: 'perfurante', itemId: 'dagger' };
  const sword = (slot?: string) => ({ id: 'sword', name: 'Espada longa', ...(slot ? { slot, equipped: true } : {}) });

  it('lists the weapon in hand without grips, and not the one in the backpack', () => {
    const out = characterActions(handSheet([sword('main'), { id: 'dagger', name: 'Adaga' }], [longsword, dagger]), spells, weapons);
    const attacks = out.filter((s) => s.option.group === 'attack');
    expect(attacks.map((s) => s.option.name)).toEqual(['Espada longa']);
    expect(attacks[0].option.grips).toBeUndefined();
    expect(attacks[0].grip).toBe('one');
  });

  it('forces the two-handed grip on a versatile weapon held in both hands', () => {
    const out = characterActions(handSheet([sword('both')], [longsword]), spells, weapons);
    expect(out[0].option.grips).toBeUndefined();
    expect(out[0].grip).toBe('two');
    expect(out[0].versatileDamage).toEqual({ dice: '1d10+3', type: 'cortante' });
  });

  it('lists a row with no item, such as a hand-typed natural attack', () => {
    const out = characterActions(handSheet([sword('main')], [longsword, { name: 'Mordida', attackBonus: 4, damageRoll: '1d6' }]), spells, weapons);
    expect(out.filter((s) => s.option.group === 'attack').map((s) => s.option.name)).toEqual(['Espada longa', 'Mordida']);
  });

  it('lists nothing for a row whose item is in the backpack or gone', () => {
    const out = characterActions(handSheet([sword()], [longsword, { ...dagger, itemId: 'missing' }]), spells, weapons);
    // a missing item id names nothing in hand
    expect(out.filter((s) => s.option.group === 'attack')).toEqual([]);
  });

  it('carries the ammunition a ranged weapon fires on its spec', () => {
    const bow = new Map(weapons).set('book-test/arco-longo', weapon({ range: 'ranged', normalRange: 45, longRange: 180, ammunition: 'flechas-20' } as any));
    const gear = new Map([['book-test/flechas-20', 'Flechas (20)']]);
    const out = characterActions(
      handSheet([{ id: 'bow', name: 'Arco longo', slot: 'both', equipped: true }], [{ name: 'Arco longo', attackBonus: 4, damageRoll: '1d8+2', itemId: 'bow', compendiumRef: ref('arco-longo') }]),
      spells, bow, gear,
    );
    expect(out[0].ammunition).toEqual({ slug: 'flechas-20', label: 'flechas' });
    expect(out[0].option).not.toHaveProperty('ammunition');
  });
});
