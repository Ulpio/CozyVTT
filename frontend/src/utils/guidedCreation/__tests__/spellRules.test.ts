import { describe, expect, it } from 'vitest';
import type { ClassData, SpellData, SubclassData } from '../compendiumData';
import {
  alwaysPreparedFor,
  availableSpells,
  castingAbilityAt3,
  expandedSpellsFor,
  spellcastingAt3,
  type SpellEntry,
} from '../spellRules';

// Invented placeholder entries: just the fields the rules read, no book text.
const FULL = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
];
const HALF = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
];
const PACT = [
  [1, 0, 0, 0, 0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 2, 0, 0, 0, 0, 0, 0, 0],
];

const cls = (spellcasting?: ClassData['spellcasting']): ClassData => ({
  hitDie: 8,
  savingThrows: ['wis', 'cha'],
  proficiencies: { armor: [], weapons: [], tools: [] },
  skills: { choose: 2, from: [] },
  startingEquipment: [],
  subclassLevel: 1,
  features: [],
  ...(spellcasting ? { spellcasting } : {}),
});

const CLERIC = cls({ ability: 'wis', slots: FULL, cantripsKnown: [3, 3, 3] });
const WIZARD = cls({ ability: 'int', slots: FULL, cantripsKnown: [3, 3, 3] });
const PALADIN = cls({ ability: 'cha', slots: HALF });
const RANGER = cls({ ability: 'wis', slots: HALF, spellsKnown: [0, 2, 3] });
const WARLOCK = cls({ ability: 'cha', slots: PACT, cantripsKnown: [2, 2, 2], spellsKnown: [2, 3, 4] });
const DRUID = cls({ ability: 'wis', slots: FULL, cantripsKnown: [2, 2, 2] });
const FIGHTER = cls();

const spell = (slug: string, level: number, school: string, classes: string[]): SpellEntry => ({
  slug,
  name: slug,
  data: {
    level,
    school,
    castingTime: 'x',
    range: 'x',
    components: { v: true, s: false, m: false },
    duration: 'x',
    concentration: false,
    ritual: false,
    classes,
  } as SpellData,
});

const SPELLS: SpellEntry[] = [
  spell('truque-a', 0, 'evocação', ['mago']),
  spell('magia-a1', 1, 'abjuração', ['mago']),
  spell('magia-a2', 1, 'ilusão', ['mago', 'bardo']),
  spell('magia-b1', 1, 'evocação', ['clerigo']),
  spell('magia-a3', 2, 'evocação', ['mago']),
  spell('magia-a4', 2, 'necromancia', ['mago']),
  spell('magia-a5', 3, 'evocação', ['mago']),
  spell('magia-b2', 3, 'evocação', ['clerigo']),
];

describe('spellcastingAt3', () => {
  it('cleric with WIS 16: 3 cantrips, 6 prepared, slots [4,2]', () => {
    const s = spellcastingAt3('clerigo', 'dominio-da-vida', CLERIC, 3);
    expect(s).toMatchObject({ ability: 'wis', cantrips: 3, prepared: 6, maxLevel: 2, list: 'clerigo' });
    expect(s?.slots).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(s?.known).toBeUndefined();
    expect(s?.spellbook).toBeUndefined();
  });

  it('wizard with INT 16: 10 in the spellbook, 6 prepared', () => {
    const s = spellcastingAt3('mago', 'escola-de-evocacao', WIZARD, 3);
    expect(s).toMatchObject({ ability: 'int', cantrips: 3, spellbook: 10, prepared: 6, maxLevel: 2 });
  });

  it('druid prepares mod + level', () => {
    expect(spellcastingAt3('druida', '', DRUID, 2)).toMatchObject({ cantrips: 2, prepared: 5 });
  });

  it('paladin with CHA 14: 3 prepared, slots [3]', () => {
    const s = spellcastingAt3('paladino', 'juramento-de-devocao', PALADIN, 2);
    expect(s).toMatchObject({ ability: 'cha', cantrips: 0, prepared: 3, maxLevel: 1 });
    expect(s?.slots).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('prepares at least one spell', () => {
    expect(spellcastingAt3('paladino', '', PALADIN, -2)?.prepared).toBe(1);
    expect(spellcastingAt3('clerigo', '', CLERIC, -4)?.prepared).toBe(1);
  });

  it('warlock: 4 known, 2 cantrips, two 2nd-level pact slots', () => {
    const s = spellcastingAt3('bruxo', 'o-corruptor', WARLOCK, 3);
    expect(s).toMatchObject({ ability: 'cha', cantrips: 2, known: 4, maxLevel: 2, pact: { slots: 2, level: 2 } });
    expect(s?.prepared).toBeUndefined();
    expect(s?.slots).toEqual([0, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('ranger: 3 known, slots [3], no cantrips', () => {
    const s = spellcastingAt3('patrulheiro', 'conclave-do-cacador', RANGER, 2);
    expect(s).toMatchObject({ cantrips: 0, known: 3, maxLevel: 1 });
    expect(s?.slots).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Eldritch Knight: INT, 2 cantrips, 3 known, slots [2], abjuration/evocation with one free pick', () => {
    const s = spellcastingAt3('guerreiro', 'cavaleiro-arcano', FIGHTER, 1);
    expect(s).toMatchObject({
      ability: 'int',
      cantrips: 2,
      known: 3,
      maxLevel: 1,
      list: 'mago',
      schools: ['abjuração', 'evocação'],
      freeSchoolPicks: 1,
    });
    expect(s?.slots).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(s?.fixedCantrips).toBeUndefined();
  });

  it('Arcane Trickster: 3 cantrips with Mage Hand fixed, enchantment/illusion', () => {
    const s = spellcastingAt3('ladino', 'trapaceiro-arcano', FIGHTER, 1);
    expect(s).toMatchObject({
      cantrips: 3,
      known: 3,
      fixedCantrips: ['maos-magicas'],
      schools: ['encantamento', 'ilusão'],
      freeSchoolPicks: 1,
    });
  });

  it('non-casters get null', () => {
    expect(spellcastingAt3('guerreiro', 'campeao', FIGHTER, 3)).toBeNull();
    expect(spellcastingAt3('ladino', 'ladrao', FIGHTER, 3)).toBeNull();
  });

  it('castingAbilityAt3 names the ability the modifier comes from', () => {
    expect(castingAbilityAt3('clerigo', '', CLERIC)).toBe('wis');
    expect(castingAbilityAt3('guerreiro', 'cavaleiro-arcano', FIGHTER)).toBe('int');
    expect(castingAbilityAt3('guerreiro', 'campeao', FIGHTER)).toBeNull();
  });
});

describe('availableSpells', () => {
  it('lists cantrips and spells of the class up to maxLevel, never a 3rd-level spell at 3rd level', () => {
    const slugs = availableSpells(SPELLS, 'mago', 2).map((s) => s.slug);
    expect(slugs).toEqual(['truque-a', 'magia-a1', 'magia-a2', 'magia-a3', 'magia-a4']);
    expect(availableSpells(SPELLS, 'clerigo', 2).map((s) => s.slug)).toEqual(['magia-b1']);
  });

  it('maxLevel 0 lists only cantrips; "any" takes every list', () => {
    expect(availableSpells(SPELLS, 'any', 0).map((s) => s.slug)).toEqual(['truque-a']);
    expect(availableSpells(SPELLS, 'any', 1).map((s) => s.slug)).toContain('magia-b1');
  });

  it('restricts leveled spells to the schools, not cantrips', () => {
    const slugs = availableSpells(SPELLS, 'mago', 1, ['abjuração', 'evocação']).map((s) => s.slug);
    expect(slugs).toEqual(['truque-a', 'magia-a1']);
  });

  it('adds extra slugs (a patron expanded list) up to maxLevel', () => {
    const slugs = availableSpells(SPELLS, 'bardo', 2, undefined, ['magia-b1', 'magia-b2']).map((s) => s.slug);
    expect(slugs).toEqual(['magia-a2', 'magia-b1']);
  });
});

const sub = (parent: string, mechanics: NonNullable<SubclassData['features'][number]['mechanics']>, level = 1): SubclassData => ({
  parent,
  features: [{ name: 'x', description: 'x', level, mechanics }],
});

describe('alwaysPreparedFor', () => {
  const LIFE = sub('clerigo', {
    spellsBySpellLevel: { '1': ['l1a', 'l1b'], '2': ['l2a', 'l2b'], '3': ['l3a', 'l3b'], '5': ['l5a'] },
  });

  it('Life domain at 3rd level: its 1st- and 2nd-level domain spells', () => {
    expect(alwaysPreparedFor(LIFE, {}, 2)).toEqual(['l1a', 'l1b', 'l2a', 'l2b']);
  });

  it('a paladin oath at 3rd level: only 1st-level spells', () => {
    const oath = sub('paladino', { spellsBySpellLevel: { '1': ['o1'], '2': ['o2'] } }, 3);
    expect(alwaysPreparedFor(oath, {}, 1)).toEqual(['o1']);
  });

  it('Circle of the Land: the picked terrain', () => {
    const land = sub('druida', { spellsByTerrain: { costa: { '2': ['c2a', 'c2b'], '3': ['c3'] }, artico: { '2': ['a2'] } } }, 3);
    expect(alwaysPreparedFor(land, { landTerrain: ['costa'] }, 2)).toEqual(['c2a', 'c2b']);
    expect(alwaysPreparedFor(land, {}, 2)).toEqual([]);
  });

  it('features above 3rd level do not count', () => {
    expect(alwaysPreparedFor(sub('clerigo', { spellsBySpellLevel: { '1': ['x'] } }, 6), {}, 2)).toEqual([]);
  });

  it('a warlock patron list is not always prepared, it expands the choices', () => {
    const patron = sub('bruxo', { spellsBySpellLevel: { '1': ['p1'], '2': ['p2'], '3': ['p3'] } });
    expect(alwaysPreparedFor(patron, {}, 2)).toEqual([]);
    expect(expandedSpellsFor(patron, 2)).toEqual(['p1', 'p2']);
    expect(expandedSpellsFor(LIFE, 2)).toEqual([]);
  });
});
