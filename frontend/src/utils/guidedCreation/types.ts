import type { AbilityKey } from '@/utils/rules/fifthEdition';
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

export type ScoreMethod = 'pointBuy' | 'standardArray' | 'roll';

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
  | { type: 'skillChoice'; count: number; from?: SkillKey[] }
  | { type: 'expertiseChoice'; count: number }
  | { type: 'save'; ability: AbilityKey }
  | { type: 'armorProficiency'; armor: ArmorKind }
  | { type: 'weaponProficiency'; weapon: string }
  | { type: 'toolChoice'; count: number }
  | { type: 'language'; language: string }
  | { type: 'languageChoice'; count: number }
  | { type: 'hpPerLevel'; amount: number }
  | { type: 'unarmoredAC'; base: number; abilities: AbilityKey[] }
  | { type: 'acBonus'; amount: number; whenArmored: boolean }
  | { type: 'initiative'; amount: number }
  | { type: 'passivePerception'; amount: number }
  | { type: 'speed'; meters: number }
  | { type: 'jackOfAllTrades' }
  | { type: 'cantripChoice'; count: number; list: string; ability: AbilityKey }
  | { type: 'spellChoice'; count: number; level: number; list: string }
  | { type: 'alwaysPrepared'; slugs: string[] }
  | { type: 'option'; id: string; choose: number; options: OptionEffect[] }
  | { type: 'attackBonus'; attack: 'eldritchBlast' | 'unarmed' | 'all'; damage?: 'ability' }
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
  method: ScoreMethod;
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
