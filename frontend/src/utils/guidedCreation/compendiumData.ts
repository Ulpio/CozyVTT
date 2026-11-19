/**
 * What the compendium entries' `data` holds, as the guided creation reads it.
 * These mirror the backend schemas (backend/src/compendium/schemas.ts); types
 * only, no logic. `CompendiumEntry.data` is `unknown` until a caller narrows
 * it to one of these by the entry's `type`.
 */

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface Named {
  name: string;
  description: string;
}

export interface DamageData {
  dice: string;
  type: string;
}

/** The compendium items an equipment line can point at. */
export type EquipmentItemType = 'weapon' | 'armor' | 'gear' | 'tool' | 'pack';

/** "Any item of this kind", for a line the player fills in at creation. */
export type EquipmentAnyOf =
  | 'simpleWeapon'
  | 'martialWeapon'
  | 'simpleMeleeWeapon'
  | 'martialMeleeWeapon'
  | 'instrument'
  | 'artisanTool'
  | 'gamingSet';

/** One thing a character starts with; exactly one of `ref` and `anyOf` is set. */
export interface EquipmentItemData {
  ref?: { type: EquipmentItemType; slug: string };
  anyOf?: EquipmentAnyOf;
  quantity: number;
}

export interface EquipmentBundleData {
  items: EquipmentItemData[];
  gp?: number;
}

/** One "(a) ... or (b) ..." choice; a single option is fixed equipment. */
export interface EquipmentChoiceData {
  options: EquipmentBundleData[];
}

/** Spell slugs by spell level, '1' to '5'. */
export type SpellsBySpellLevel = Partial<Record<'1' | '2' | '3' | '4' | '5', string[]>>;

export interface FeatureData extends Named {
  level: number;
  /** Free-form, except the subclass spell lists below. */
  mechanics?: {
    spellsBySpellLevel?: SpellsBySpellLevel;
    /** Circle of the Land: by terrain slug. */
    spellsByTerrain?: Record<string, SpellsBySpellLevel>;
    [key: string]: unknown;
  };
}

export interface ClassData {
  hitDie: 6 | 8 | 10 | 12;
  savingThrows: AbilityKey[];
  proficiencies: { armor: string[]; weapons: string[]; tools: string[] };
  skills: { choose: number; from: string[] };
  startingEquipment: string[];
  startingEquipmentChoices?: EquipmentChoiceData[];
  spellcasting?: {
    ability: AbilityKey;
    /** slots[characterLevel - 1][spellLevel - 1] */
    slots?: number[][];
    cantripsKnown?: number[];
    spellsKnown?: number[];
  };
  subclassLevel: number;
  features: FeatureData[];
}

export interface SubclassData {
  /** The slug of the class. */
  parent: string;
  features: FeatureData[];
}

interface RaceFields {
  abilityIncreases?: Partial<Record<AbilityKey, number>>;
  size?: string;
  speed?: number;
  languages?: string[];
  proficiencies?: string[];
  darkvision?: number;
  traits: Named[];
}

export interface RaceData extends RaceFields {
  size: string;
  speed: number;
}

export interface SubraceData extends RaceFields {
  /** The slug of the race. */
  parent: string;
}

export interface BackgroundData {
  proficiencies: { skills: string[]; tools: string[] };
  languages?: number | string[];
  equipment: string[];
  startingEquipmentChoices?: EquipmentChoiceData[];
  /** The book's tables, one entry per row. */
  personality?: { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] };
  feature: Named;
}

export interface SpellData {
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: { v: boolean; s: boolean; m: boolean; material?: string };
  duration: string;
  concentration: boolean;
  ritual: boolean;
  /** Class slugs. */
  classes: string[];
  higherLevels?: string;
  mechanics?: {
    attack?: 'melee' | 'ranged';
    save?: AbilityKey;
    damage: DamageData[];
    healing?: string;
    halfOnSave?: boolean;
    targets?: number;
    area?: { shape: string; size: string };
    scaling?: { perSlot?: string; cantrip?: boolean };
  };
}

export interface WeaponData {
  category: 'simple' | 'martial';
  range: 'melee' | 'ranged';
  damage: DamageData;
  properties: string[];
  versatile?: string;
  normalRange?: number;
  longRange?: number;
  cost: string;
  weight: number;
  /** Slug of the gear item this weapon shoots. */
  ammunition?: string;
}

export interface ArmorData {
  category: 'light' | 'medium' | 'heavy' | 'shield';
  baseAc: number;
  addDex: boolean;
  maxDex?: number;
  strength?: number;
  stealthDisadvantage: boolean;
  cost: string;
  weight: number;
}

export interface FeatData {
  prerequisite?: string;
  effects?: {
    abilityIncrease?: Partial<Record<AbilityKey, number>>;
    proficiencies?: string[];
  };
}

/** One thing a pack holds: a compendium item, or a name only. */
export type PackItemData =
  | { ref: { type: Exclude<EquipmentItemType, 'pack'>; slug: string }; quantity: number }
  | { name: string; quantity: number };

export interface PackData {
  cost?: string;
  contents?: string[];
  weight?: number;
  /** What the pack opens into; a pack without it stays one item. */
  items?: PackItemData[];
}
