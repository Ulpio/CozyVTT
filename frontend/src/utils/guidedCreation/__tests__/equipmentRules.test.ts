import { describe, expect, it } from 'vitest';
import type { ArmorData, BackgroundData, ClassData, EquipmentChoiceData, SpellData, WeaponData } from '../compendiumData';
import type { RulesEntry } from '../collectEffects';
import {
  anyOfKey,
  anyOfOptions,
  attacksFor,
  cantripAttacks,
  offeredOptions,
  proficienciesFor,
  resolveEquipment,
  type EquipmentItems,
  type WeaponEntry,
} from '../equipmentRules';
import { SUBCLASS_EFFECTS } from '../subclassRules';
import type { AbilityKey, Effect } from '../types';

// Invented placeholder entries: just the fields the rules read, no book text.
const weapon = (
  slug: string,
  category: WeaponData['category'],
  range: WeaponData['range'],
  dice: string,
  properties: string[] = [],
  extra: Partial<WeaponData> = {},
): RulesEntry<WeaponData> => ({
  slug,
  name: slug.replace(/-/g, ' '),
  data: { category, range, damage: { dice, type: 'corte' }, properties, cost: '1 po', weight: 1, ...extra },
});

const armor = (slug: string, category: ArmorData['category'], baseAc: number, weight = 5): RulesEntry<ArmorData> => ({
  slug,
  name: `A ${slug}`,
  data: { category, baseAc, addDex: category === 'light' || category === 'medium', stealthDisadvantage: false, cost: '1 po', weight },
});

const ITEMS: EquipmentItems = {
  weapons: [
    weapon('rapieira', 'martial', 'melee', '1d8', ['acuidade']),
    weapon('espada-longa', 'martial', 'melee', '1d8', ['versátil'], { versatile: '1d10' }),
    weapon('arco-longo', 'martial', 'ranged', '1d8', ['munição', 'duas mãos'], { normalRange: 45, longRange: 180 }),
    weapon('maca', 'simple', 'melee', '1d6'),
    weapon('martelo-de-guerra', 'martial', 'melee', '1d8', ['versátil'], { versatile: '1d10' }),
    weapon('adaga', 'simple', 'melee', '1d4', ['acuidade', 'leve', 'arremesso'], { normalRange: 6, longRange: 18 }),
    weapon('besta-leve', 'simple', 'ranged', '1d8', ['munição', 'duas mãos']),
    weapon('espada-grande', 'martial', 'melee', '2d6', ['pesada', 'duas mãos']),
    weapon('espada-curta', 'martial', 'melee', '1d6', ['acuidade', 'leve']),
    weapon('bordao', 'simple', 'melee', '1d6', ['versátil'], { versatile: '1d8' }),
  ],
  armor: [
    armor('brunea', 'medium', 14),
    armor('couro', 'light', 11),
    armor('cota-de-malha', 'heavy', 16, 27.5),
    armor('escudo', 'shield', 2, 3),
  ],
  gear: [{ slug: 'virotes-20', name: 'G virotes', data: { weight: 0.75 } }],
  packs: [{ slug: 'pacote-x', name: 'P x', data: {} }],
  tools: [{ slug: 'alaude', name: 'T alaude', data: { weight: 1 } }],
};

const ref = (type: 'weapon' | 'armor' | 'gear' | 'tool' | 'pack', slug: string, quantity = 1) => ({
  ref: { type, slug },
  quantity,
});

const cls = (startingEquipmentChoices: EquipmentChoiceData[], armorLines: string[] = []): ClassData => ({
  hitDie: 8,
  savingThrows: ['wis', 'cha'],
  proficiencies: { armor: armorLines, weapons: [], tools: [] },
  skills: { choose: 2, from: [] },
  startingEquipment: [],
  startingEquipmentChoices,
  subclassLevel: 1,
  features: [],
});

const CLERIC = cls(
  [
    { options: [{ items: [ref('weapon', 'maca')] }, { items: [ref('weapon', 'martelo-de-guerra')] }] },
    {
      options: [{ items: [ref('armor', 'brunea')] }, { items: [ref('armor', 'couro')] }, { items: [ref('armor', 'cota-de-malha')] }],
    },
    {
      options: [
        { items: [ref('weapon', 'besta-leve'), ref('gear', 'virotes-20')] },
        { items: [{ anyOf: 'simpleWeapon', quantity: 1 }] },
      ],
    },
    { options: [{ items: [ref('pack', 'pacote-x')] }] },
    { options: [{ items: [ref('armor', 'escudo')] }] },
  ],
  ['Armaduras leves', 'armaduras médias', 'escudos'],
);

const BACKGROUND: BackgroundData = {
  proficiencies: { skills: [], tools: [] },
  equipment: [],
  startingEquipmentChoices: [{ options: [{ gp: 15, items: [ref('weapon', 'adaga'), ref('tool', 'alaude')] }] }],
  feature: { name: 'x', description: 'x' },
};

const FIGHTER = cls(
  [
    { options: [{ items: [ref('armor', 'cota-de-malha')] }, { items: [ref('armor', 'couro'), ref('weapon', 'arco-longo')] }] },
    {
      options: [
        { items: [{ anyOf: 'martialWeapon', quantity: 1 }, ref('armor', 'escudo')] },
        { items: [{ anyOf: 'martialWeapon', quantity: 2 }] },
      ],
    },
  ],
  ['Todas as armaduras', 'escudos'],
);

const CLERIC_PROFS = proficienciesFor('clerigo', CLERIC, [], [], ITEMS.weapons);
const FIGHTER_PROFS = proficienciesFor('guerreiro', FIGHTER, [], [], ITEMS.weapons);

describe('offeredOptions', () => {
  it('a cleric without heavy armor is not offered chain mail, nor a warhammer without martial weapons', () => {
    const profs = proficienciesFor('clerigo', CLERIC, [], [], ITEMS.weapons);
    const offered = offeredOptions(CLERIC, BACKGROUND, profs, ITEMS);
    expect(offered[0]).toEqual([0]);
    expect(offered[1]).toEqual([0, 1]);
    expect(offered[2]).toEqual([0, 1]);
    expect(offered[5]).toEqual([0]);
  });

  it('a Life domain cleric is offered chain mail', () => {
    const profs = proficienciesFor('clerigo', CLERIC, SUBCLASS_EFFECTS['dominio-da-vida'], [], ITEMS.weapons);
    expect(offeredOptions(CLERIC, BACKGROUND, profs, ITEMS)[1]).toEqual([0, 1, 2]);
  });

  it('a War domain cleric is offered the warhammer', () => {
    const profs = proficienciesFor('clerigo', CLERIC, SUBCLASS_EFFECTS['dominio-da-guerra'], [], ITEMS.weapons);
    expect(offeredOptions(CLERIC, BACKGROUND, profs, ITEMS)[0]).toEqual([0, 1]);
  });
});

describe('proficienciesFor', () => {
  it('reads class armor lines, class weapons, effects and race weapon lines', () => {
    const p = proficienciesFor('mago', cls([]), [{ type: 'armorProficiency', armor: 'light' }], ['espada longa', 'arco longo'], ITEMS.weapons);
    expect(p.armor).toEqual(['light']);
    expect(p.weapons).toEqual(expect.arrayContaining(['adaga', 'bordao', 'besta-leve', 'espada-longa', 'arco-longo']));
    expect(p.weapons).not.toContain('simple');
    expect(proficienciesFor('guerreiro', FIGHTER, [], [], ITEMS.weapons).weapons).toEqual(
      expect.arrayContaining(['simple', 'martial']),
    );
  });
});

describe('anyOfOptions', () => {
  it('lists the items of the kind', () => {
    expect(anyOfOptions('simpleWeapon', ITEMS).map((w) => w.slug)).toEqual(['maca', 'adaga', 'besta-leve', 'bordao']);
    expect(anyOfOptions('simpleMeleeWeapon', ITEMS).map((w) => w.slug)).toEqual(['maca', 'adaga', 'bordao']);
    expect(anyOfOptions('instrument', ITEMS).map((w) => w.slug)).toEqual(['alaude']);
  });

  it('with proficiencies, weapons are filtered unless none would remain', () => {
    const wizard = proficienciesFor('mago', cls([]), [], [], ITEMS.weapons);
    expect(anyOfOptions('simpleWeapon', ITEMS, wizard).map((w) => w.slug)).toEqual(['adaga', 'besta-leve', 'bordao']);
    expect(anyOfOptions('martialWeapon', ITEMS, wizard).map((w) => w.slug)).toContain('rapieira');
    expect(anyOfOptions('instrument', ITEMS, wizard).map((w) => w.slug)).toEqual(['alaude']);
  });
});

describe('resolveEquipment', () => {
  it('collects the picked options of the class and the background', () => {
    const out = resolveEquipment(CLERIC, BACKGROUND, [0, 0, 1, 0, 0, 0], { [anyOfKey(2, 0, 0)]: 'adaga' }, ITEMS, CLERIC_PROFS);
    expect(out.armor?.slug).toBe('brunea');
    expect(out.shield).toBe(true);
    expect(out.gp).toBe(15);
    expect(out.weapons.map((w) => [w.slug, w.quantity])).toEqual([
      ['maca', 1],
      ['adaga', 2],
    ]);
    expect(out.inventory).toEqual([
      { type: 'weapon', slug: 'maca', name: 'maca', quantity: 1, weight: 1 },
      { type: 'armor', slug: 'brunea', name: 'A brunea', quantity: 1, weight: 5 },
      { type: 'weapon', slug: 'adaga', name: 'adaga', quantity: 2, weight: 1 },
      { type: 'pack', slug: 'pacote-x', name: 'P x', quantity: 1 },
      { type: 'armor', slug: 'escudo', name: 'A escudo', quantity: 1, weight: 3 },
      { type: 'tool', slug: 'alaude', name: 'T alaude', quantity: 1, weight: 1 },
    ]);
  });

  it('fills each unit of an anyOf line and ignores picks of the wrong kind', () => {
    const out = resolveEquipment(
      FIGHTER,
      undefined,
      [0, 1],
      { [anyOfKey(1, 0, 0)]: 'rapieira', [anyOfKey(1, 0, 1)]: 'maca' },
      ITEMS,
      FIGHTER_PROFS,
    );
    expect(out.armor?.slug).toBe('cota-de-malha');
    expect(out.shield).toBe(false);
    expect(out.weapons.map((w) => w.slug)).toEqual(['rapieira']);
  });

  it('a choice with several options and no pick gives nothing', () => {
    const out = resolveEquipment(FIGHTER, undefined, [], {}, ITEMS, FIGHTER_PROFS);
    expect(out.inventory).toEqual([]);
  });

  it('a pick that is not offered falls back to the first offered option', () => {
    // Chain mail (option 2) is not offered to a cleric without heavy armor.
    const out = resolveEquipment(CLERIC, BACKGROUND, [0, 2, 0, 0, 0, 0], {}, ITEMS, CLERIC_PROFS);
    expect(out.armor?.slug).toBe('brunea');
    const life = proficienciesFor('clerigo', CLERIC, SUBCLASS_EFFECTS['dominio-da-vida'], [], ITEMS.weapons);
    expect(resolveEquipment(CLERIC, BACKGROUND, [0, 2, 0, 0, 0, 0], {}, ITEMS, life).armor?.slug).toBe('cota-de-malha');
  });

  it('an anyOf weapon pick the character is not proficient with is dropped when another fits', () => {
    const wizardClass = cls([{ options: [{ items: [{ anyOf: 'simpleWeapon', quantity: 1 }] }] }]);
    const wizard = proficienciesFor('mago', wizardClass, [], [], ITEMS.weapons);
    const out = resolveEquipment(wizardClass, undefined, [], { [anyOfKey(0, 0, 0)]: 'maca' }, ITEMS, wizard);
    expect(out.weapons).toEqual([]);
    const ok = resolveEquipment(wizardClass, undefined, [], { [anyOfKey(0, 0, 0)]: 'bordao' }, ITEMS, wizard);
    expect(ok.weapons.map((w) => w.slug)).toEqual(['bordao']);
  });
});

const scores = (s: Partial<Record<AbilityKey, number>>): Record<AbilityKey, number> => ({
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  ...s,
});
const entry = (slug: string): WeaponEntry => {
  const w = ITEMS.weapons!.find((x) => x.slug === slug)!;
  return { ...w, quantity: 1 };
};

describe('attacksFor', () => {
  it('rapier with DEX 16, STR 10, proficient: +5, 1d8+3', () => {
    const [a] = attacksFor([entry('rapieira')], scores({ dex: 16 }), ['martial'], []);
    expect(a).toMatchObject({ name: 'rapieira', slug: 'rapieira', attackBonus: 5, damageRoll: '1d8+3', damageType: 'corte' });
  });

  it('without proficiency there is no proficiency bonus', () => {
    const [a] = attacksFor([entry('rapieira')], scores({ dex: 16 }), ['simple'], []);
    expect(a.attackBonus).toBe(3);
  });

  it('longbow with Archery at DEX 16: +7', () => {
    const archery: Effect = { type: 'attackBonus', attack: 'ranged', toHit: 2 };
    const [a] = attacksFor([entry('arco-longo')], scores({ dex: 16 }), ['martial'], [archery]);
    expect(a).toMatchObject({ attackBonus: 7, damageRoll: '1d8+3', range: 45 });
  });

  it('Dueling adds 2 to one-handed melee damage, not two-handed', () => {
    const dueling: Effect = { type: 'attackBonus', attack: 'oneHandedMelee', damageBonus: 2 };
    const [sword, great] = attacksFor([entry('espada-longa'), entry('espada-grande')], scores({ str: 16 }), ['martial'], [dueling]);
    expect(sword).toMatchObject({ attackBonus: 5, damageRoll: '1d8+5', versatileDamageRoll: '1d10+3' });
    expect(great).toMatchObject({ attackBonus: 5, damageRoll: '2d6+3' });
  });

  it('a negative modifier is subtracted; zero adds nothing', () => {
    const [mace] = attacksFor([entry('maca')], scores({ str: 8 }), ['simple'], []);
    expect(mace).toMatchObject({ attackBonus: 1, damageRoll: '1d6-1' });
    const [mace10] = attacksFor([entry('maca')], scores({}), ['simple'], []);
    expect(mace10.damageRoll).toBe('1d6');
  });

  it("the monk's martial arts: DEX for monk weapons and an unarmed strike with 1d4", () => {
    const monk: Effect[] = [
      { type: 'attackBonus', attack: 'unarmed', die: '1d4', ability: 'dex' },
      { type: 'attackBonus', attack: 'monkWeapon', ability: 'dex' },
    ];
    const [bordao, unarmed] = attacksFor([entry('bordao')], scores({ dex: 16 }), ['simple'], monk);
    expect(bordao).toMatchObject({ attackBonus: 5, damageRoll: '1d6+3' });
    expect(unarmed).toMatchObject({ source: 'unarmed', attackBonus: 5, damageRoll: '1d4+3' });
  });

  it('a ranged finesse weapon (darts) uses the better of STR and DEX', () => {
    const dart: WeaponEntry = { ...weapon('dardo', 'simple', 'ranged', '1d4', ['acuidade', 'arremesso']), quantity: 10 };
    expect(attacksFor([dart], scores({ str: 16, dex: 12 }), ['simple'], [])[0]).toMatchObject({ attackBonus: 5, damageRoll: '1d4+3' });
    expect(attacksFor([dart], scores({ str: 8, dex: 14 }), ['simple'], [])[0]).toMatchObject({ attackBonus: 4, damageRoll: '1d4+2' });
  });

  it('no unarmed attack without an unarmed effect', () => {
    expect(attacksFor([], scores({}), [], [])).toEqual([]);
  });
});

describe('cantripAttacks', () => {
  const blast: RulesEntry<SpellData> = {
    slug: 'rajada-mistica',
    name: 'S rajada',
    data: {
      level: 0,
      school: 'evocação',
      castingTime: 'x',
      range: 'x',
      components: { v: true, s: true, m: false },
      duration: 'x',
      concentration: false,
      ritual: false,
      classes: ['bruxo'],
      mechanics: { attack: 'ranged', damage: [{ dice: '1d10', type: 'energia' }] },
    },
  };
  const light = { ...blast, slug: 'luz', name: 'S luz', data: { ...blast.data, mechanics: undefined } };

  it('Eldritch Blast at CHA 16: +5, 1d10; with Agonizing Blast 1d10+3', () => {
    expect(cantripAttacks([{ spell: blast, ability: 'cha' }], scores({ cha: 16 }), [])).toEqual([
      expect.objectContaining({ source: 'cantrip', slug: 'rajada-mistica', attackBonus: 5, damageRoll: '1d10', damageType: 'energia' }),
    ]);
    const agonizing: Effect = { type: 'attackBonus', attack: 'eldritchBlast', damage: 'ability' };
    const [a] = cantripAttacks([{ spell: blast, ability: 'cha' }], scores({ cha: 16 }), [agonizing]);
    expect(a.damageRoll).toBe('1d10+3');
  });

  it('cantrips without an attack roll are not attacks', () => {
    expect(cantripAttacks([{ spell: light, ability: 'cha' }], scores({}), [])).toEqual([]);
  });
});
