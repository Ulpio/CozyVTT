import type { AbilityKey } from '@/utils/rules/fifthEdition';
import type { AbilityScoreMethod } from '@/types';
import { FIFTH_EDITION_SKILLS } from '@/utils/rules/fifthEdition';

export type { AbilityKey };

/** The camelCase skill keys the class data uses ('animalHandling', ...). */
export type SkillKey =
  | 'acrobatics'
  | 'animalHandling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleightOfHand'
  | 'stealth'
  | 'survival';

export const SKILL_KEYS: readonly SkillKey[] = FIFTH_EDITION_SKILLS.map((s) => s.key as SkillKey);


export type ArmorKind = 'light' | 'medium' | 'heavy' | 'shield';

/** A prerequisite of an option or feat; all of an entry's must hold. */
export type Requirement =
  /** This option id was picked under `optionPicks[id]`. */
  | { kind: 'option'; id: string; pick: string }
  /** The character knows this cantrip. */
  | { kind: 'cantrip'; slug: string }
  /** Proficiency with this armor kind. */
  | { kind: 'armor'; armor: ArmorKind }
  /** A final score (before the feat) of at least `min` in any of `abilities`. */
  | { kind: 'score'; abilities: AbilityKey[]; min: number }
  /** Can cast at least one spell from the class or subclass at 3rd level. */
  | { kind: 'spellcasting' };

export interface OptionEffect {
  id: string;
  name: string;
  effects: Effect[];
  requires?: Requirement[];
}

/** Tool groups a tool choice can be limited to (slugs in toolRules.ts). */
export type ToolCategory = 'artisanTool' | 'instrument' | 'gamingSet';

/** One mechanical consequence of a race, class, subclass or background pick. */
export type Effect =
  | { type: 'ability'; ability: AbilityKey; amount: number }
  | { type: 'abilityChoice'; count: number; amount: number; exclude?: AbilityKey[] }
  | { type: 'skill'; skill: SkillKey }
  /**
   * `orTool`: each pick may be a tool instead (Skilled). `expertise`: the skills
   * this choice ends up with also get expertise (Knowledge Domain).
   */
  | { type: 'skillChoice'; count: number; from?: SkillKey[]; orTool?: true; expertise?: true }
  /** Expertise in a skill, fixed or from a skillChoice with `expertise`. */
  | { type: 'expertise'; skill: SkillKey }
  /** `tool`: a tool slug a pick may take instead of a skill (rogue: thieves' tools). */
  | { type: 'expertiseChoice'; count: number; tool?: string }
  | { type: 'save'; ability: AbilityKey }
  | { type: 'armorProficiency'; armor: ArmorKind }
  /** Medium armor adds DEX up to `max` instead of 2 (Medium Armor Master). */
  | { type: 'mediumArmorMaxDex'; max: number }
  /** `weapon`: 'simple', 'martial', 'improvised', 'pactWeapon' or a weapon slug. */
  | { type: 'weaponProficiency'; weapon: string }
  /** Weapons of the player's choice (slugs), each a weaponProficiency. */
  | { type: 'weaponChoice'; count: number }
  /** A fixed tool proficiency (tool slug). */
  | { type: 'tool'; tool: string }
  | { type: 'toolChoice'; count: number; category?: ToolCategory }
  | { type: 'language'; language: string }
  | { type: 'languageChoice'; count: number }
  | { type: 'hpPerLevel'; amount: number }
  | { type: 'unarmoredAC'; base: number; abilities: AbilityKey[]; noShield?: true }
  | { type: 'acBonus'; amount: number; whenArmored: boolean }
  | { type: 'initiative'; amount: number }
  | { type: 'passivePerception'; amount: number }
  /** `noArmor`: only while wearing no armor and carrying no shield (Unarmored Movement). */
  | { type: 'speed'; meters: number; noArmor?: true }
  | { type: 'jackOfAllTrades' }
  /** `list`: a class slug, or 'any' for every class list (Pact of the Tome). */
  | { type: 'cantripChoice'; count: number; list: string; ability: AbilityKey }
  | { type: 'spellChoice'; count: number; level: number; list: string }
  | { type: 'alwaysPrepared'; slugs: string[] }
  | { type: 'option'; id: string; choose: number; options: OptionEffect[] }
  /**
   * Attacks of a kind get: `damage: 'ability'` adds the casting modifier to the
   * damage (Agonizing Blast); `toHit`/`damageBonus` flat bonuses (Archery, Dueling);
   * `die` replaces the damage die and `ability` may replace STR when better
   * (Martial Arts, Tavern Brawler). `monkWeapon`: shortswords and simple melee
   * weapons without two-handed or heavy (Martial Arts).
   */
  | {
      type: 'attackBonus';
      attack: 'eldritchBlast' | 'unarmed' | 'monkWeapon' | 'ranged' | 'oneHandedMelee' | 'all';
      damage?: 'ability';
      toHit?: number;
      damageBonus?: number;
      die?: string;
      ability?: AbilityKey;
    }
  // Added in Task 6 (the brief's race rules need them):
  | { type: 'featChoice'; count: number }
  | { type: 'resistance'; damageType: string }
  /** Heavy armor's Strength requirement does not reduce speed (dwarves). */
  | { type: 'ignoreArmorStrength' };

export interface CreationDetails {
  name: string;
  alignment?: string;
  appearance?: Record<string, string>;
  personality?: { traits?: string; ideals?: string; bonds?: string; flaws?: string };
  backstory?: string;
}

/** Everything the wizard picks. */
export interface CreationChoices {
  raceSlug: string;
  subraceSlug?: string;
  classSlug: string;
  subclassSlug: string;
  backgroundSlug: string;
  method: AbilityScoreMethod;
  baseScores: Record<AbilityKey, number>;
  abilityRollId?: string;
  racialChoices: Record<string, unknown>;
  skillPicks: SkillKey[];
  /** Skill keys, or the tool slug an expertiseChoice allows. */
  expertisePicks: string[];
  languagePicks: string[];
  toolPicks: string[];
  optionPicks: Record<string, string[]>;
  /** Option index per equipment choice. */
  equipmentPicks: number[];
  anyOfPicks: Record<string, string>;
  cantripSlugs: string[];
  spellSlugs: string[];
  details: CreationDetails;
}
