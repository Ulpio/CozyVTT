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

export interface OptionEffect {
  id: string;
  name: string;
  effects: Effect[];
}

/** One mechanical consequence of a race, class, subclass or background pick. */
export type Effect =
  | { type: 'ability'; ability: AbilityKey; amount: number }
  | { type: 'abilityChoice'; count: number; amount: number; exclude?: AbilityKey[] }
  | { type: 'skill'; skill: SkillKey }
  /** `orTool`: each pick may be a tool instead (Skilled). */
  | { type: 'skillChoice'; count: number; from?: SkillKey[]; orTool?: true }
  | { type: 'expertiseChoice'; count: number; from?: SkillKey[] }
  | { type: 'save'; ability: AbilityKey }
  | { type: 'armorProficiency'; armor: ArmorKind }
  /** `weapon`: 'simple', 'martial', 'improvised', 'pactWeapon' or a weapon slug. */
  | { type: 'weaponProficiency'; weapon: string }
  | { type: 'toolChoice'; count: number }
  | { type: 'language'; language: string }
  | { type: 'languageChoice'; count: number }
  | { type: 'hpPerLevel'; amount: number }
  | { type: 'unarmoredAC'; base: number; abilities: AbilityKey[]; noShield?: true }
  | { type: 'acBonus'; amount: number; whenArmored: boolean }
  | { type: 'initiative'; amount: number }
  | { type: 'passivePerception'; amount: number }
  | { type: 'speed'; meters: number }
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
   * (Martial Arts, Tavern Brawler).
   */
  | {
      type: 'attackBonus';
      attack: 'eldritchBlast' | 'unarmed' | 'ranged' | 'oneHandedMelee' | 'all';
      damage?: 'ability';
      toHit?: number;
      damageBonus?: number;
      die?: string;
      ability?: AbilityKey;
    }
  // Added in Task 6 (the brief's race rules need them):
  | { type: 'featChoice'; count: number }
  | { type: 'resistance'; damageType: string };

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
  expertisePicks: SkillKey[];
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
