/**
 * The compendium's data files (described in the design,
 * docs/superpowers/specs/2026-11-14-p2-compendio-5e-design.md) hold these
 * shapes: `<dir>/data/<book>/<type>.json` is an array of RawEntry, and
 * `<dir>/data/mm/monster.json` an array of RawMonster.
 */

export const COMPENDIUM_TYPES = [
  'spell',
  'race',
  'subrace',
  'class',
  'subclass',
  'background',
  'feat',
  'weapon',
  'armor',
  'gear',
  'tool',
  'pack',
  'magicItem',
  'condition',
] as const;

export type CompendiumType = (typeof COMPENDIUM_TYPES)[number];

export function isCompendiumType(value: unknown): value is CompendiumType {
  return typeof value === 'string' && (COMPENDIUM_TYPES as readonly string[]).includes(value);
}

/** One entry as a data file holds it, before it reaches the database. */
export interface RawEntry {
  type: CompendiumType;
  slug: string;
  name: string;
  nameEn?: string;
  text: string;
  data: unknown;
}

/** One monster as the Monster Manual's data file holds it. */
export interface RawMonster {
  name: string;
  creatureType?: string;
  alignment?: string;
  challengeRating?: string;
  statBlock: unknown;
}

/** Something wrong with the data, and where. */
export interface Issue {
  where: string;
  message: string;
}
