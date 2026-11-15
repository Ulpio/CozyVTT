import { ABILITY_KEYS, type AbilityKey } from '@/utils/rules/fifthEdition';
import type { AbilityScoreMethod } from '@/types';
import type { Effect } from './types';

export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];
export const ABILITY_CAP = 20;

export function pointBuySpent(scores: Record<AbilityKey, number>): number {
  let sum = 0;
  for (const k of ABILITY_KEYS) {
    const cost = POINT_BUY_COST[scores[k]];
    if (cost === undefined) return NaN; // outside 8..15: not priceable
    sum += cost;
  }
  return sum;
}

function sameMultiset(a: number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.every((v, i) => v === y[i]);
}

/**
 * Error keys (empty when valid); the UI maps them to copy. `roll` is the six
 * totals of the server roll: pass `dto.rolls.map((r) => r.total)`.
 */
export function validateBaseScores(
  method: AbilityScoreMethod,
  scores: Record<AbilityKey, number>,
  roll?: number[],
): string[] {
  const values = ABILITY_KEYS.map((k) => scores[k]);
  if (method === 'POINT_BUY') {
    if (values.some((v) => !Number.isInteger(v) || v < POINT_BUY_MIN || v > POINT_BUY_MAX)) {
      return ['outOfRange'];
    }
    return pointBuySpent(scores) > POINT_BUY_BUDGET ? ['overBudget'] : [];
  }
  if (method === 'STANDARD_ARRAY') {
    return sameMultiset(values, STANDARD_ARRAY) ? [] : ['notStandardArray'];
  }
  if (method === 'ROLL') return roll && sameMultiset(values, roll) ? [] : ['notRolled'];
  const unreachable: never = method;
  throw new Error(`Unknown score method: ${String(unreachable)}`);
}

/** Error keys for the picks of abilityChoice effects, in effect order. */
export function validateAbilityPicks(effects: Effect[], picks: AbilityKey[]): string[] {
  const errors: string[] = [];
  let i = 0;
  for (const e of effects) {
    if (e.type !== 'abilityChoice') continue;
    const mine = picks.slice(i, i + e.count);
    i += e.count;
    if (mine.length !== e.count) errors.push('missingPick');
    if (mine.some((a) => e.exclude?.includes(a))) errors.push('excludedAbility');
  }
  if (picks.length > i) errors.push('tooManyPicks');
  const used = picks.slice(0, i); // +1 twice to one ability is never allowed
  if (new Set(used).size !== used.length) errors.push('duplicatePick');
  return errors;
}

/**
 * Base scores plus fixed `ability` effects plus the abilityChoice picks (consumed
 * in effect order, `count` picks each; excluded picks are ignored), capped at 20.
 */
export function finalScores(
  base: Record<AbilityKey, number>,
  effects: Effect[],
  picks: AbilityKey[] = [],
): Record<AbilityKey, number> {
  const out = { ...base };
  let i = 0;
  for (const e of effects) {
    if (e.type === 'ability') out[e.ability] += e.amount;
    else if (e.type === 'abilityChoice') {
      for (const a of picks.slice(i, i + e.count)) {
        if (!e.exclude?.includes(a)) out[a] += e.amount;
      }
      i += e.count;
    }
  }
  for (const k of ABILITY_KEYS) out[k] = Math.min(ABILITY_CAP, out[k]);
  return out;
}
