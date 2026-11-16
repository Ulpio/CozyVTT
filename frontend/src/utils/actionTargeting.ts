// ============================================
// Which tokens an action can reach, for highlighting only. The server decides
// (backend/src/rules/actions/distance.ts, services/actionResolver.ts); this is
// the same measure so the ring agrees with what it will accept.
// ============================================

import type { Token } from '@/types';
import type { ActionReach } from '@/types/actions';

interface Footprint { x: number; y: number; width: number; height: number }
interface MapRules { feetPerSquare: number; diagonalRule: string }

/** A token's footprint in grid squares (tokens are stored in squares). */
const footprint = (t: Token): Footprint => ({
  x: t.position.x,
  y: t.position.y,
  width: t.size?.width ?? 1,
  height: t.size?.height ?? 1,
});

/** Squares from one footprint's nearest edge to the other's; 0 where they overlap on that axis. */
function axisSquares(aStart: number, aSize: number, bStart: number, bSize: number): number {
  const gap = Math.max(bStart - (aStart + aSize), aStart - (bStart + bSize));
  return gap >= 0 ? gap + 1 : 0;
}

/** Distance in feet between the nearest edges of two tokens, diagonals by the map's rule. */
export function tokenDistanceFeet(a: Token, b: Token, map: MapRules): number {
  const fa = footprint(a);
  const fb = footprint(b);
  const dx = axisSquares(fa.x, fa.width, fb.x, fb.width);
  const dy = axisSquares(fa.y, fa.height, fb.y, fb.height);
  const longer = Math.max(dx, dy);
  const shorter = Math.min(dx, dy);
  const squares = map.diagonalRule === 'alternating' ? longer + Math.floor(shorter / 2) : longer;
  return squares * map.feetPerSquare;
}

/**
 * The ids of the tokens within an action's reach of `actor`: touch is 5 ft,
 * long range counts as in reach, self reaches no one, an option with no known
 * reach leaves every other token in. The actor is never in the set.
 */
export function tokensInReach(actor: Token, tokens: Token[], reach: ActionReach | undefined, map: MapRules): Set<string> {
  const result = new Set<string>();
  if (reach?.kind === 'self') return result;
  const limit = !reach ? Infinity : reach.kind === 'feet' ? (reach.long ?? reach.normal) : 5;
  for (const token of tokens) {
    if (token.id === actor.id) continue;
    if (tokenDistanceFeet(actor, token, map) <= limit) result.add(token.id);
  }
  return result;
}

type ErrorKey = 'notYourToken' | 'invalidTarget' | 'outOfRange' | 'noSpellSlot' | 'cannotResolve' | 'alreadyUndone' | 'alreadyRolled' | 'gmOnly' | 'generic';

const ERROR_KEYS: Record<string, ErrorKey> = {
  'Not your token': 'notYourToken',
  'Invalid target': 'invalidTarget',
  'Out of range': 'outOfRange',
  'No spell slot of that level': 'noSpellSlot',
  'This action cannot be resolved': 'cannotResolve',
  'Already undone': 'alreadyUndone',
  'Already rolled': 'alreadyRolled',
  'GM only': 'gmOnly',
};

/** The i18n key for a server refusal; anything unknown gets the generic text. */
export function actionErrorKey(error: string | undefined): `actionBar.errors.${ErrorKey}` {
  const key: ErrorKey = (error && Object.prototype.hasOwnProperty.call(ERROR_KEYS, error) ? ERROR_KEYS[error] : undefined) ?? 'generic';
  return `actionBar.errors.${key}`;
}
