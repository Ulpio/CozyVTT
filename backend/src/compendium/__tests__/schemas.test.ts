/**
 * The compendium's entry schemas and the checks run before an import. Every
 * value here is invented for the test; no book text is quoted.
 */

import { validateEntries, validateMonsters } from '../schemas';
import type { RawEntry, RawMonster } from '../types';

const known = { classSlugs: new Set(['mago', 'clerigo']) };

function spell(overrides: Partial<Record<string, unknown>> = {}): RawEntry {
  return {
    type: 'spell',
    slug: 'raio-teste',
    name: 'Raio Teste',
    text: 'Um raio inventado.',
    data: {
      level: 1,
      school: 'evocação',
      castingTime: '1 ação',
      range: '18 metros',
      components: { v: true, s: true, m: false },
      duration: 'Instantânea',
      concentration: false,
      ritual: false,
      classes: ['mago'],
      mechanics: { attack: 'ranged', damage: [{ dice: '2d6', type: 'fogo' }] },
      ...overrides,
    },
  };
}

function monster(statBlock: Record<string, unknown> = {}, challengeRating = '1/4'): RawMonster {
  return {
    name: 'Criatura Teste',
    challengeRating,
    statBlock: {
      ac: 13,
      hp: 9,
      hpMax: 9,
      speed: '9 m',
      abilities: { str: 10, dex: 12, con: 10, int: 8, wis: 10, cha: 8 },
      challengeRating,
      ...statBlock,
    },
  };
}

it('accepts a valid level-1 spell with mechanics', () => {
  expect(validateEntries([spell()], known)).toEqual([]);
});

it('accepts mechanics on a level-3 spell with a save, an area and scaling', () => {
  const mechanics = {
    save: 'dex',
    damage: [{ dice: '8d6', type: 'fogo' }],
    halfOnSave: true,
    area: { shape: 'esfera', size: '6 m de raio' },
    scaling: { perSlot: '1d6' },
  };
  expect(validateEntries([spell({ level: 3, mechanics })], known)).toEqual([]);
});

it('accepts rays, autoHit, castOnly, targetsPerSlot, selfHeal and a line width', () => {
  const mechanics = {
    damage: [{ dice: '1d4+1', type: 'energia' }],
    rays: { count: 3, perSlot: 1, cantripLevels: false },
    autoHit: true,
    castOnly: 'invented reason',
    targetsPerSlot: 1,
    selfHeal: 'half-damage',
    area: { shape: 'linha', size: '30 m', width: '1,5 m' },
  };
  expect(validateEntries([spell({ level: 3, mechanics })], known)).toEqual([]);
});

it('rejects damage dice "1d"', () => {
  const issues = validateEntries([spell({ mechanics: { attack: 'ranged', damage: [{ dice: '1d', type: 'fogo' }] } })], known);
  expect(issues.map((i) => i.message).join(' ')).toMatch(/1d/);
});

it('rejects an unknown damage type', () => {
  const issues = validateEntries([spell({ mechanics: { attack: 'ranged', damage: [{ dice: '1d6', type: 'mágico' }] } })], known);
  expect(issues.map((i) => i.message).join(' ')).toMatch(/mágico/);
});

it('rejects armor with AC 40', () => {
  const armor: RawEntry = {
    type: 'armor',
    slug: 'couraca-teste',
    name: 'Couraça Teste',
    text: '',
    data: { category: 'heavy', baseAc: 40, addDex: false, stealthDisadvantage: true, cost: '10 po', weight: 10 },
  };
  expect(validateEntries([armor], known)).not.toEqual([]);
});

it('reports a spell naming an unknown class', () => {
  const issues = validateEntries([spell({ classes: ['astronauta'] })], known);
  expect(issues.map((i) => i.message).join(' ')).toMatch(/astronauta/);
});

it('reports two entries of one type with the same slug', () => {
  expect(validateEntries([spell(), spell()], known)).not.toEqual([]);
});

it('accepts a valid monster', () => {
  expect(validateMonsters([monster()])).toEqual([]);
});

it('rejects a monster with challenge rating "3/7"', () => {
  expect(validateMonsters([monster({}, '3/7')])).not.toEqual([]);
});

it('takes bludgeoning damage as the books name it, "concussão"', () => {
  const club = spell({ mechanics: { attack: 'melee', damage: [{ dice: '1d4', type: 'concussão' }] } });
  expect(validateEntries([club], known)).toEqual([]);
});

describe('curated starting data', () => {
  const klass = (extra: Record<string, unknown> = {}): RawEntry => ({
    type: 'class',
    slug: 'classe-teste',
    name: 'Classe Teste',
    text: 'Inventada.',
    data: {
      hitDie: 8,
      savingThrows: ['str', 'con'],
      proficiencies: { armor: [], weapons: [], tools: [] },
      skills: { choose: 2, from: ['athletics'] },
      startingEquipment: ['x'],
      subclassLevel: 3,
      features: [],
      ...extra,
    },
  });
  const background = (extra: Record<string, unknown> = {}): RawEntry => ({
    type: 'background',
    slug: 'antecedente-teste',
    name: 'Antecedente Teste',
    text: 'Inventado.',
    data: {
      proficiencies: { skills: [], tools: [] },
      equipment: [],
      feature: { name: 'Característica', description: 'Inventada.' },
      ...extra,
    },
  });
  const subclass = (mechanics: unknown): RawEntry => ({
    type: 'subclass',
    slug: 'subclasse-teste',
    name: 'Subclasse Teste',
    text: 'Inventada.',
    data: { parent: 'classe-teste', features: [{ level: 1, name: 'A', description: 'B', mechanics }] },
  });
  const choices = [
    {
      options: [
        { items: [{ ref: { type: 'weapon', slug: 'machado-grande' }, quantity: 1 }] },
        { items: [{ anyOf: 'martialMeleeWeapon', quantity: 1 }, { ref: { type: 'gear', slug: 'tocha' }, quantity: 2 }], gp: 5 },
      ],
    },
  ];

  it('accepts a class with structured starting equipment choices', () => {
    expect(validateEntries([klass({ startingEquipmentChoices: choices })], known)).toEqual([]);
  });

  it('rejects an equipment item with neither ref nor anyOf', () => {
    const bad = [{ options: [{ items: [{ quantity: 1 }] }] }];
    expect(validateEntries([klass({ startingEquipmentChoices: bad })], known)).not.toEqual([]);
  });

  it('rejects an equipment item with both ref and anyOf', () => {
    const bad = [{ options: [{ items: [{ ref: { type: 'gear', slug: 'x' }, anyOf: 'instrument', quantity: 1 }] }] }];
    expect(validateEntries([klass({ startingEquipmentChoices: bad })], known)).not.toEqual([]);
  });

  it('accepts a background with choices and personality', () => {
    const personality = { traits: ['a'], ideals: ['b'], bonds: ['c'], flaws: ['d'] };
    expect(validateEntries([background({ startingEquipmentChoices: choices, personality })], known)).toEqual([]);
  });

  it('rejects a personality table holding a non-string', () => {
    const personality = { traits: ['a', 3], ideals: [], bonds: [], flaws: [] };
    expect(validateEntries([background({ personality })], known)).not.toEqual([]);
  });

  it('accepts spellsBySpellLevel keyed 1 to 5', () => {
    expect(validateEntries([subclass({ spellsBySpellLevel: { '1': ['a'], '5': ['b'] } })], known)).toEqual([]);
  });

  it('rejects spellsBySpellLevel with key 7', () => {
    expect(validateEntries([subclass({ spellsBySpellLevel: { '7': ['a'] } })], known)).not.toEqual([]);
  });

  it('checks spellsByTerrain the same way, per terrain', () => {
    expect(validateEntries([subclass({ spellsByTerrain: { floresta: { '2': ['a'] } } })], known)).toEqual([]);
    expect(validateEntries([subclass({ spellsByTerrain: { floresta: { '7': ['a'] } } })], known)).not.toEqual([]);
  });

  describe('a feature action', () => {
    it('accepts a state with a pool it declares and spends', () => {
      const action = { key: 'furia', kind: 'state', cost: 'bonus', resources: [{ key: 'furia', max: { '1': 2, '3': 3 }, recovers: 'long' }], spends: { key: 'furia' }, damageBonus: { '1': 2 }, stateName: 'Em fúria' };
      expect(validateEntries([subclass({ action })], known)).toEqual([]);
    });

    it('accepts every shape a pool maximum can take', () => {
      const resources = [
        { key: 'a', max: 2, recovers: 'short' },
        { key: 'b', max: 'classLevel', recovers: 'long' },
        { key: 'c', max: 'proficiency', recovers: { '1': 'long', '5': 'short' } },
        { key: 'd', max: { ability: 'cha', min: 1 }, recovers: 'long' },
        { key: 'e', max: { perLevel: 5 }, recovers: 'long' },
      ];
      expect(validateEntries([subclass({ action: { key: 'x', kind: 'use', resources } })], known)).toEqual([]);
    });

    it('rejects kind none without a reason, and accepts it with one', () => {
      expect(validateEntries([subclass({ action: { key: 'x', kind: 'none' } })], known)).not.toEqual([]);
      expect(validateEntries([subclass({ action: { key: 'x', kind: 'none', reason: 'Decidida na mesa.' } })], known)).toEqual([]);
    });

    it('rejects an unknown kind', () => {
      const issues = validateEntries([subclass({ action: { key: 'x', kind: 'voar' } })], known);
      expect(issues.map((i) => i.message).join(' ')).toMatch(/mechanics\.action\.kind/);
    });

    it('rejects a key that is not a slug and an unknown cost', () => {
      expect(validateEntries([subclass({ action: { key: 'Não Slug', kind: 'use' } })], known)).not.toEqual([]);
      expect(validateEntries([subclass({ action: { key: 'x', kind: 'use', cost: 'turno' } })], known)).not.toEqual([]);
    });

    it('leaves the other free-form mechanics keys alone', () => {
      expect(validateEntries([subclass({ uses: 'qualquer coisa', recharge: 'curto', extraDice: 3 })], known)).toEqual([]);
      expect(validateEntries([subclass({ uses: 2, action: { key: 'x', kind: 'passive', passive: { extraAttacks: 1 } } })], known)).toEqual([]);
    });
  });
});

describe('references to other entries', () => {
  const withRef = (slug: string): RawEntry => ({
    type: 'class',
    slug: 'classe-ref',
    name: 'Classe Ref',
    text: 'Inventada.',
    data: {
      hitDie: 8,
      savingThrows: ['str', 'con'],
      proficiencies: { armor: [], weapons: [], tools: [] },
      skills: { choose: 0, from: [] },
      startingEquipment: [],
      subclassLevel: 3,
      features: [],
      startingEquipmentChoices: [{ options: [{ items: [{ ref: { type: 'weapon', slug }, quantity: 1 }] }] }],
    },
  });

  it('names an equipment ref that does not resolve', () => {
    const slugs = new Set(['weapon:adaga']);
    expect(validateEntries([withRef('adaga')], { ...known, slugs })).toEqual([]);
    const issues = validateEntries([withRef('adagaa')], { ...known, slugs });
    expect(issues.map((i) => i.message).join(' ')).toMatch(/adagaa/);
  });

  it('names a subclass spell that does not resolve', () => {
    const entry: RawEntry = {
      type: 'subclass',
      slug: 'sub-ref',
      name: 'Sub Ref',
      text: 'Inventada.',
      data: { parent: 'x', features: [{ level: 1, name: 'A', description: 'B', mechanics: { spellsBySpellLevel: { '1': ['sono', 'nao-existe'] } } }] },
    };
    const issues = validateEntries([entry], { ...known, slugs: new Set(['spell:sono']) });
    expect(issues.map((i) => i.message).join(' ')).toMatch(/nao-existe/);
    expect(issues).toHaveLength(1);
  });
});

it('accepts a flat whole-number healing amount and per-slot step (Heal)', () => {
  const mechanics = { healing: '70', targets: 1, scaling: { perSlot: '10' } };
  expect(validateEntries([spell({ level: 6, mechanics })], known)).toEqual([]);
});

it('still rejects a flat number as damage dice', () => {
  const issues = validateEntries([spell({ mechanics: { attack: 'ranged', damage: [{ dice: '70', type: 'fogo' }] } })], known);
  expect(issues).not.toEqual([]);
});

describe('pack contents and weapon ammunition', () => {
  const pack = (items: unknown): RawEntry => ({
    type: 'pack',
    slug: 'pacote-teste',
    name: 'Pacote Teste',
    text: '',
    data: { cost: '5 po', contents: ['mochila'], items },
  });
  const bow = (extra: Record<string, unknown> = {}): RawEntry => ({
    type: 'weapon',
    slug: 'arco-teste',
    name: 'Arco Teste',
    text: '',
    data: {
      category: 'simple',
      range: 'ranged',
      damage: { dice: '1d6', type: 'perfurante' },
      properties: ['munição'],
      cost: '25 po',
      weight: 1,
      ...extra,
    },
  });

  it('accepts a pack whose items are references or free names', () => {
    const items = [{ ref: { type: 'gear', slug: 'x' }, quantity: 10 }, { name: 'Saco com esferas', quantity: 1 }];
    expect(validateEntries([pack(items)], known)).toEqual([]);
  });

  it('rejects an item with a quantity below 1', () => {
    expect(validateEntries([pack([{ name: 'Coisa', quantity: 0 }])], known)).not.toEqual([]);
  });

  it('accepts a weapon with an ammunition slug', () => {
    expect(validateEntries([bow({ ammunition: 'flechas-20' })], known)).toEqual([]);
  });
});
