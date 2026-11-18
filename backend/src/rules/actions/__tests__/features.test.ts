/**
 * Class features as data: which an actor has at its level, the pools their
 * uses come from, and how they show on the action bar. Every class, subclass
 * and feature here is invented for the test; no book text is used.
 */

const findMany = jest.fn();
jest.mock('../../../config/database', () => ({ prisma: { compendiumEntry: { findMany: (...args: unknown[]) => findMany(...args) } } }));
jest.mock('../../../compendium/campaignBooks', () => ({ enabledBookIds: async () => ['livro-teste'] }));

import {
  actorFeatures,
  attacksPerAction,
  classEntryFor,
  critMin,
  resourcePools,
  withFeatures,
  type CompendiumClass,
  type CompendiumSubclass,
} from '../features';
import { characterActions, type CompendiumWeapon } from '../catalogue';
import { catalogueFor } from '../../../services/actionResolver/catalogueFor';
import type { FifthEditionCharacterData } from '../../../validators/game-systems/fifthEdition.schema';
import type { Token } from '../../../websocket/shared';

const BOOK = 'livro-teste';
const stat = (score: number) => ({ score, modifier: Math.floor((score - 10) / 2) });

function sheet(over: Partial<FifthEditionCharacterData> = {}): FifthEditionCharacterData {
  return {
    characterName: 'Teste',
    class: 'Bárbaro',
    level: 3,
    race: 'Humano',
    proficiencyBonus: 2,
    stats: { strength: stat(16), dexterity: stat(14), constitution: stat(14), intelligence: stat(10), wisdom: stat(10), charisma: stat(12) },
    ...over,
  } as FifthEditionCharacterData;
}

const barbarian: CompendiumClass = {
  bookId: BOOK,
  slug: 'barbaro',
  name: 'Bárbaro',
  data: {
    features: [
      {
        name: 'Ira Inventada',
        description: 'Inventada.',
        level: 1,
        mechanics: {
          action: { key: 'furia', kind: 'state', cost: 'bonus', resources: [{ key: 'furia', max: { '1': 2, '3': 3 }, recovers: 'long' }], spends: { key: 'furia' }, damageBonus: { '1': 2 } },
        },
      },
      { name: 'Só Texto', description: 'Inventada.', level: 2 },
      { name: 'Golpe Duplo', description: 'Inventada.', level: 5, mechanics: { action: { key: 'golpe-duplo', kind: 'passive', passive: { extraAttacks: 1 } } } },
      { name: 'Decidida na Mesa', description: 'Inventada.', level: 1, mechanics: { action: { key: 'mesa', kind: 'none', reason: 'Inventada.' } } },
      { name: 'Livre', description: 'Inventada.', level: 1, mechanics: { uses: 'antigo campo livre' } },
    ],
  },
};

const subclass: CompendiumSubclass = {
  bookId: BOOK,
  slug: 'caminho-teste',
  name: 'Caminho Teste',
  data: {
    parent: 'barbaro',
    features: [
      { name: 'Olho Afiado', description: 'Inventada.', level: 3, mechanics: { action: { key: 'olho', kind: 'passive', passive: { critMin: 19 } } } },
      { name: 'Grito', description: 'Inventada.', level: 6, mechanics: { action: { key: 'grito', kind: 'use', cost: 'action' } } },
    ],
  },
};

const rogue: CompendiumClass = {
  bookId: BOOK,
  slug: 'ladino',
  name: 'Ladino',
  data: {
    features: [
      {
        name: 'Golpe Furtivo Inventado',
        description: 'Inventada.',
        level: 1,
        mechanics: { action: { key: 'furtivo', kind: 'addDamage', oncePerTurn: true, filter: { finesseOrRanged: true }, dice: { '1': '1d6', '3': '2d6' } } },
      },
    ],
  },
};

const RAGE_ID = `feature:${BOOK}/barbaro/furia`;

describe('actorFeatures', () => {
  it('lists the features with an action up to the sheet level, with their ids', () => {
    const features = actorFeatures(sheet({ level: 3 }), barbarian, subclass);
    expect(features.map((f) => f.id)).toEqual([RAGE_ID, `feature:${BOOK}/barbaro/mesa`, `feature:${BOOK}/caminho-teste/olho`]);
    expect(features[0]).toMatchObject({ name: 'Ira Inventada', level: 1, action: { kind: 'state', cost: 'bonus' } });
  });

  it('gives nothing without a class entry', () => {
    expect(actorFeatures(sheet(), null, null)).toEqual([]);
  });

  it('skips an action the schema would refuse', () => {
    const odd: CompendiumClass = { ...barbarian, data: { features: [{ name: 'X', description: '', level: 1, mechanics: { action: { key: 'x', kind: 'voar' } } }] } };
    expect(actorFeatures(sheet(), odd, null)).toEqual([]);
  });
});

describe('resourcePools', () => {
  it('reads the maximum for the level and what the sheet has spent', () => {
    expect(resourcePools(actorFeatures(sheet({ level: 3 }), barbarian, null), sheet({ level: 3 }))).toEqual({ furia: { max: 3, spent: 0, recovers: 'long' } });
    const spent = sheet({ level: 3, featureUses: { furia: 1 } });
    expect(resourcePools(actorFeatures(spent, barbarian, null), spent).furia).toEqual({ max: 3, spent: 1, recovers: 'long' });
  });

  it('works out each kind of maximum', () => {
    const resources = [
      { key: 'a', max: 'classLevel', recovers: 'long' },
      { key: 'b', max: 'proficiency', recovers: { '1': 'long', '5': 'short' } },
      { key: 'c', max: { ability: 'cha', min: 1 }, recovers: 'long' },
      { key: 'd', max: { ability: 'int', min: 1 }, recovers: 'long' },
      { key: 'e', max: { perLevel: 5 }, recovers: 'long' },
    ];
    const klass: CompendiumClass = { bookId: BOOK, slug: 'k', name: 'K', data: { features: [{ name: 'P', description: '', level: 1, mechanics: { action: { key: 'p', kind: 'use', resources } } }] } };
    const s = sheet({ level: 6, proficiencyBonus: 3, stats: { ...sheet().stats, charisma: stat(16), intelligence: stat(8) }, featureUses: { e: 40 } });
    expect(resourcePools(actorFeatures(s, klass, null), s)).toEqual({
      a: { max: 6, spent: 0, recovers: 'long' },
      b: { max: 3, spent: 0, recovers: 'short' },
      c: { max: 3, spent: 0, recovers: 'long' },
      d: { max: 1, spent: 0, recovers: 'long' },
      e: { max: 30, spent: 30, recovers: 'long' },
    });
  });
});

describe('attacksPerAction and critMin', () => {
  it('adds a passive extra attack from its level on', () => {
    expect(attacksPerAction(actorFeatures(sheet({ level: 5 }), barbarian, null))).toBe(2);
    expect(attacksPerAction(actorFeatures(sheet({ level: 4 }), barbarian, null))).toBe(1);
  });

  it('is 20 unless a passive lowers it', () => {
    expect(critMin(actorFeatures(sheet({ level: 3 }), barbarian, null))).toBe(20);
    expect(critMin(actorFeatures(sheet({ level: 3 }), barbarian, subclass))).toBe(19);
  });
});

describe('withFeatures', () => {
  const options = (s: FifthEditionCharacterData, klass: CompendiumClass | null, sub: CompendiumSubclass | null = null) =>
    withFeatures(characterActions(s, new Map(), new Map()), actorFeatures(s, klass, sub), s).map((x) => x.option);

  it('gives a state feature an option with its uses at level 3', () => {
    const rage = options(sheet({ level: 3 }), barbarian).find((o) => o.id === RAGE_ID);
    expect(rage).toEqual({ id: RAGE_ID, name: 'Ira Inventada', group: 'feature', resolution: 'feature', cost: 'bonus', uses: { left: 3, max: 3 } });
  });

  it('counts what the sheet has spent, and the level-1 maximum', () => {
    expect(options(sheet({ level: 3, featureUses: { furia: 1 } }), barbarian).find((o) => o.id === RAGE_ID)?.uses).toEqual({ left: 2, max: 3 });
    expect(options(sheet({ level: 1 }), barbarian).find((o) => o.id === RAGE_ID)?.uses).toEqual({ left: 2, max: 2 });
  });

  it('marks a running state as active', () => {
    expect(options(sheet({ activeStates: [RAGE_ID] }), barbarian).find((o) => o.id === RAGE_ID)?.active).toBe(true);
  });

  it('gives passive and none features no option, and a feature with no cost costs none', () => {
    const s = sheet({ level: 6 });
    const features = options(s, barbarian, subclass).filter((o) => o.group === 'feature');
    expect(features.map((o) => o.id)).toEqual([RAGE_ID, `feature:${BOOK}/caminho-teste/grito`]);
    const noCost: CompendiumClass = { ...barbarian, data: { features: [{ name: 'U', description: '', level: 1, mechanics: { action: { key: 'u', kind: 'use' } } }] } };
    expect(options(s, noCost).find((o) => o.group === 'feature')?.cost).toBe('none');
  });

  it('gives no feature options to a sheet with no class entry', () => {
    expect(options(sheet(), null).filter((o) => o.group === 'feature')).toEqual([]);
  });

  describe('riders', () => {
    const weapons = new Map<string, CompendiumWeapon>([
      [`${BOOK}/rapieira`, { slug: 'rapieira', name: 'Rapieira', data: { range: 'melee', properties: ['acuidade'] } }],
      [`${BOOK}/arco-curto`, { slug: 'arco-curto', name: 'Arco Curto', data: { range: 'ranged', properties: ['munição', 'duas mãos'], normalRange: 24, longRange: 96 } }],
      [`${BOOK}/machado-grande`, { slug: 'machado-grande', name: 'Machado Grande', data: { range: 'melee', properties: ['pesada', 'duas mãos'] } }],
    ]);
    const attacks = [
      { name: 'Rapieira', attackBonus: 5, damageRoll: '1d8+3', damageType: 'perfurante', compendiumRef: { bookId: BOOK, slug: 'rapieira' } },
      { name: 'Arco Curto', attackBonus: 5, damageRoll: '1d6+3', damageType: 'perfurante', compendiumRef: { bookId: BOOK, slug: 'arco-curto' } },
      { name: 'Machado Grande', attackBonus: 5, damageRoll: '1d12+3', damageType: 'cortante', compendiumRef: { bookId: BOOK, slug: 'machado-grande' } },
    ];
    const ridersOf = (s: FifthEditionCharacterData, klass: CompendiumClass) => {
      const out = withFeatures(characterActions(s, new Map(), weapons), actorFeatures(s, klass, null), s);
      return Object.fromEntries(out.filter((x) => x.option.group === 'attack').map((x) => [x.option.name, x.option.riders?.map((r) => r.featureId) ?? []]));
    };

    it('puts a finesse-or-ranged rider on a rapier and a shortbow, not on a greataxe', () => {
      const id = `feature:${BOOK}/ladino/furtivo`;
      expect(ridersOf(sheet({ class: 'Ladino', attacks }), rogue)).toEqual({ Rapieira: [id], 'Arco Curto': [id], 'Machado Grande': [] });
      const s = sheet({ class: 'Ladino', attacks });
      const out = withFeatures(characterActions(s, new Map(), weapons), actorFeatures(s, rogue, null), s);
      expect(out.find((x) => x.option.name === 'Rapieira')?.option.riders).toEqual([{ featureId: id, name: 'Golpe Furtivo Inventado' }]);
      expect(out.some((x) => x.option.id === id)).toBe(false);
    });

    it('reads strength as STR for a heavy weapon, the higher of STR and DEX for finesse, never for a ranged one', () => {
      const smite: CompendiumClass = {
        bookId: BOOK,
        slug: 'k',
        name: 'K',
        data: {
          features: [{
            name: 'Força Bruta',
            description: '',
            level: 1,
            mechanics: { action: { key: 'bruta', kind: 'addDamage', filter: { strength: true }, spends: { key: 'b' }, resources: [{ key: 'b', max: 2, recovers: 'short' }], slot: { base: '2d8', perSlot: '1d8', maxDice: 5 } } },
          }],
        },
      };
      const id = `feature:${BOOK}/k/bruta`;
      const strong = sheet({ attacks, featureUses: { b: 1 } });
      expect(ridersOf(strong, smite)).toEqual({ Rapieira: [id], 'Arco Curto': [], 'Machado Grande': [id] });
      const out = withFeatures(characterActions(strong, new Map(), weapons), actorFeatures(strong, smite, null), strong);
      expect(out.find((x) => x.option.name === 'Machado Grande')?.option.riders).toEqual([{ featureId: id, name: 'Força Bruta', uses: { left: 1, max: 2 }, slot: true }]);
      const nimble = sheet({ attacks, stats: { ...sheet().stats, strength: stat(10), dexterity: stat(18) } });
      expect(ridersOf(nimble, smite)).toEqual({ Rapieira: [], 'Arco Curto': [], 'Machado Grande': [id] });
    });

    it('reads melee and ranged filters from the attack', () => {
      const both: CompendiumClass = {
        bookId: BOOK,
        slug: 'k',
        name: 'K',
        data: {
          features: [
            { name: 'Perto', description: '', level: 1, mechanics: { action: { key: 'perto', kind: 'addDamage', filter: { melee: true } } } },
            { name: 'Longe', description: '', level: 1, mechanics: { action: { key: 'longe', kind: 'addDamage', filter: { ranged: true } } } },
          ],
        },
      };
      const near = `feature:${BOOK}/k/perto`;
      const far = `feature:${BOOK}/k/longe`;
      expect(ridersOf(sheet({ attacks }), both)).toEqual({ Rapieira: [near], 'Arco Curto': [far], 'Machado Grande': [near] });
    });
  });
});

describe('classEntryFor', () => {
  const classes = [barbarian, rogue];

  it('takes the class the origin points at', () => {
    expect(classEntryFor(sheet({ class: 'Qualquer', origin: { class: { bookId: BOOK, slug: 'ladino' } } }), classes)).toBe(rogue);
  });

  it('finds the class of an old sheet with no origin by its name, ignoring accents and case', () => {
    expect(classEntryFor(sheet({ class: 'Ladino' }), classes)).toBe(rogue);
    expect(classEntryFor(sheet({ class: ' barbaro ' }), classes)).toBe(barbarian);
  });

  it('finds nothing for a homebrew class', () => {
    expect(classEntryFor(sheet({ class: 'Caçador de Sombras' }), classes)).toBeNull();
  });
});

describe('catalogueFor', () => {
  const token = { id: 't1' } as Token;
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockImplementation(async ({ where }: { where: { type?: unknown } }) => {
      const type = where.type;
      if (type === 'class' || (typeof type === 'object' && (type as { in?: string[] }).in?.includes('class'))) {
        return [barbarian, rogue].map((c) => ({ ...c, type: 'class', text: '', data: c.data }));
      }
      if (type === 'subclass') return [{ ...subclass, type: 'subclass', text: '', data: subclass.data }];
      return [];
    });
  });

  it('lists the features of an old sheet whose class is found by name', async () => {
    const specs = await catalogueFor('c1', token, sheet({ class: 'Bárbaro', level: 3 }));
    expect(specs.find((s) => s.option.id === RAGE_ID)?.option.uses).toEqual({ left: 3, max: 3 });
  });

  it('adds the subclass the origin points at', async () => {
    const s = sheet({ level: 6, origin: { class: { bookId: BOOK, slug: 'barbaro' }, subclass: { bookId: BOOK, slug: 'caminho-teste' } } });
    const specs = await catalogueFor('c1', token, s);
    expect(specs.some((x) => x.option.id === `feature:${BOOK}/caminho-teste/grito`)).toBe(true);
  });

  it('gives a homebrew class no feature options, without throwing', async () => {
    const specs = await catalogueFor('c1', token, sheet({ class: 'Caçador de Sombras' }));
    expect(specs.filter((s) => s.option.group === 'feature')).toEqual([]);
    expect(specs.length).toBeGreaterThan(0);
  });
});
