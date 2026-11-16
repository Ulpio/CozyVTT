/**
 * The dice arithmetic the resolver does on top of what the catalogue lists:
 * cantrips that grow with the character, spells cast at a higher circle,
 * and the bar's roll mode meeting the disadvantage of a long shot.
 */

import { parseDiceExpression } from '../../utils/dice-parser';
import type { RollMode } from '../../rules/actions/types';

/** Every dice term's count multiplied by `k`; flat numbers left alone. */
export function multiplyDice(expression: string, k: number): string {
  if (k === 1) return expression;
  return expression.replace(/(^|[^\dd])(\d+)?d(\d+)/gi, (_m, pre: string, count: string | undefined, sides: string) =>
    `${pre}${(count ? parseInt(count, 10) : 1) * k}d${sides}`);
}

/** `expression` added to itself `times` times, or null when it would not roll. */
export function repeatDice(expression: string | undefined, times: number): string | null {
  if (!expression || times <= 0) return null;
  const clean = expression.replace(/[−–]/g, '-').trim();
  try {
    parseDiceExpression(clean);
  } catch {
    return null;
  }
  return Array.from({ length: times }, () => clean).join('+');
}

/** How many times a cantrip's dice are rolled at this character level: 1, 2, 3 or 4 (levels 1, 5, 11, 17). */
export function cantripTier(level: number): number {
  if (level >= 17) return 4;
  if (level >= 11) return 3;
  if (level >= 5) return 2;
  return 1;
}

/** The bar's mode with the disadvantage of a long-range shot added: advantage and disadvantage cancel. */
export function withLongRange(mode: RollMode): RollMode {
  return mode === 'advantage' ? 'normal' : 'disadvantage';
}
