import { rollDice, type RollResult } from '../../utils/dice-parser';
import type { Rng, RollMode } from './types';

export interface AttackRoll {
  d20s: number[];
  natural: number;
  total: number;
}

const defaultRng: Rng = (sides) => Math.floor(Math.random() * sides) + 1;

/** d20 + bonus; advantage and disadvantage roll two d20 and keep the higher or lower. */
export function rollAttack(bonus: number, mode: RollMode, rng: Rng = defaultRng): AttackRoll {
  const d20s = [rng(20)];
  if (mode !== 'normal') d20s.push(rng(20));
  const natural = mode === 'disadvantage' ? Math.min(...d20s) : Math.max(...d20s);
  return { d20s, natural, total: natural + bonus };
}

/**
 * A natural roll at or above `critMin` (20, or 19 for a Champion) always hits
 * and crits; a natural 1 always misses; otherwise total >= AC.
 */
export function attackHits(roll: AttackRoll, ac: number, critMin = 20): { hit: boolean; critical: boolean } {
  if (roll.natural >= critMin) return { hit: true, critical: true };
  if (roll.natural === 1) return { hit: false, critical: false };
  return { hit: roll.total >= ac, critical: false };
}

/** Chance (0..1) that one attack hits, nat 1 and the critical range (from `critMin`) included. */
export function hitChance(bonus: number, ac: number, mode: RollMode, critMin = 20): number {
  let faces = 0;
  for (let n = 1; n <= 20; n++) {
    if (n >= critMin || (n !== 1 && n + bonus >= ac)) faces += 1;
  }
  const p = faces / 20;
  if (mode === 'advantage') return 1 - (1 - p) * (1 - p);
  if (mode === 'disadvantage') return p * p;
  return p;
}

/** Doubles the count of every dice term, leaving flat numbers alone. */
function doubleDice(expression: string): string {
  return expression.replace(/(^|[^\dd])(\d+)?d(\d+)/gi, (_m, pre: string, count: string | undefined, sides: string) =>
    `${pre}${(count ? parseInt(count, 10) : 1) * 2}d${sides}`);
}

/** Rolls damage; a critical rolls each dice term twice over, flat modifiers once. */
export function rollDamage(expression: string, critical: boolean, rng?: Rng): { total: number; breakdown: RollResult } {
  const breakdown = rollDice(critical ? doubleDice(expression) : expression, rng);
  return { total: breakdown.total, breakdown };
}
