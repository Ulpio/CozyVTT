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

it('rejects mechanics on a level-3 spell', () => {
  expect(validateEntries([spell({ level: 3 })], known)).not.toEqual([]);
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
