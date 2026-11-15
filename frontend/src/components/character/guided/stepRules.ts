// ============================================
// What the guided creation steps share: their props, and the checks that
// decide whether a step is done.
// ============================================

import type { AbilityRollDto, AbilityScoreMethod, Campaign } from '@/types';
import { ABILITY_KEYS } from '@/utils/rules/fifthEdition';
import {
  POINT_BUY_MIN,
  STANDARD_ARRAY,
  validateBaseScores,
} from '@/utils/guidedCreation/abilities';
import type { CreationData } from '@/utils/guidedCreation/buildSheet';
import { abilityPickErrors } from '@/utils/guidedCreation/collectEffects';
import { OPTIONAL_SUBRACE_RACES } from '@/utils/guidedCreation/raceRules';
import type { AbilityKey, CreationChoices } from '@/utils/guidedCreation/types';
import type { AbilityRollState } from './useAbilityRoll';

export interface StepProps {
  data: CreationData;
  choices: CreationChoices;
  update: (patch: Partial<CreationChoices>) => void;
  campaign?: Campaign;
  roll: AbilityRollState;
}

/** What a step's completeness is judged from. */
export interface StepCheck {
  data: CreationData;
  choices: CreationChoices;
  campaign?: Campaign;
  roll: AbilityRollDto | null;
  /** The server has answered whether a roll is saved. */
  rollKnown: boolean;
}

export const ALL_METHODS: AbilityScoreMethod[] = ['POINT_BUY', 'STANDARD_ARRAY', 'ROLL'];

/**
 * The methods the player may use: the campaign's (all three outside one). Once
 * a roll exists, only Roll: the roll is never set aside for another method
 * (ledger ruling), and it stays offered after the campaign dropped Roll, since
 * it was made while the campaign allowed it.
 */
export function availableMethods(campaign: Campaign | undefined, roll: AbilityRollDto | null): AbilityScoreMethod[] {
  if (roll) return ['ROLL'];
  const allowed = campaign ? campaign.abilityScoreMethods : ALL_METHODS;
  return ALL_METHODS.filter((m) => allowed.includes(m));
}

export function subracesOf(data: CreationData, raceSlug: string) {
  return data.subraces.filter((s) => s.data.parent === raceSlug);
}

export function subclassesOf(data: CreationData, classSlug: string) {
  return data.subclasses.filter((s) => s.data.parent === classSlug);
}

export function raceComplete({ data, choices }: StepCheck): boolean {
  if (!data.races.some((r) => r.slug === choices.raceSlug)) return false;
  const subraces = subracesOf(data, choices.raceSlug);
  return (
    !subraces.length ||
    OPTIONAL_SUBRACE_RACES.includes(choices.raceSlug) ||
    subraces.some((s) => s.slug === choices.subraceSlug)
  );
}

export function abilitiesComplete({ data, choices, campaign, roll, rollKnown }: StepCheck): boolean {
  // Until the server says whether a roll is saved, no method can be trusted.
  if (!rollKnown) return false;
  if (!availableMethods(campaign, roll).includes(choices.method)) return false;
  if (roll && choices.abilityRollId !== roll.id) return false;
  const totals = roll?.rolls.map((r) => r.total);
  if (validateBaseScores(choices.method, choices.baseScores, totals).length) return false;
  // The race's +1s; a half-feat's are picked with the feat, in the class choices step.
  return abilityPickErrors(choices, data, false).length === 0;
}

/** The scores a method starts from: all 8 for point buy, the array or the roll in ability order. */
export function defaultScores(method: AbilityScoreMethod, rollTotals?: number[]): Record<AbilityKey, number> {
  const values =
    method === 'STANDARD_ARRAY' ? STANDARD_ARRAY : method === 'ROLL' && rollTotals?.length === 6 ? rollTotals : undefined;
  return Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, values ? values[i] : POINT_BUY_MIN])) as Record<AbilityKey, number>;
}

export const rollTotals = (roll: AbilityRollDto | null | undefined) => roll?.rolls.map((r) => r.total);
