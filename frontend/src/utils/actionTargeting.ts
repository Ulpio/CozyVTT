// ============================================
// Which tokens an action can reach, for highlighting only. The server decides
// (backend/src/rules/actions/distance.ts, services/actionResolver.ts); this is
// the same measure so the ring agrees with what it will accept.
// ============================================

import type { Token } from '@/types';
import type { ActionAreaPlacement, ActionOption, ActionReach } from '@/types/actions';
import { isAreaCreature, placeActionArea, tokensCaught, type AreaMap, type PlacedArea } from './areaGeometry';

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
 * reach leaves every other token in. The actor is in the set only for a
 * heal, which it may cast on itself.
 */
export function tokensInReach(
  actor: Token,
  tokens: Token[],
  reach: ActionReach | undefined,
  map: MapRules,
  resolution?: ActionOption['resolution'],
): Set<string> {
  const result = new Set<string>();
  if (reach?.kind === 'self') return result;
  if (resolution === 'heal') result.add(actor.id);
  const limit = !reach ? Infinity : reach.kind === 'feet' ? (reach.long ?? reach.normal) : 5;
  for (const token of tokens) {
    if (token.id === actor.id) continue;
    if (tokenDistanceFeet(actor, token, map) <= limit) result.add(token.id);
  }
  return result;
}


/**
 * Where an area action's template lands for this aim, whether that is in
 * range, and whom it catches of the tokens this viewer has; null for an
 * option with no area. Placement and the catch are utils/areaGeometry.ts's,
 * the file the server decides with, so the preview lights what the server
 * will catch (it cannot light a token the viewer is not sent). A player is
 * not sent stat blocks: for them every token that is not an object counts as
 * a creature (`knowsStatBlocks: false`).
 */
export function actionAreaPreview(
  tokens: Token[],
  actor: Token,
  option: ActionOption,
  placement: ActionAreaPlacement,
  map: AreaMap,
  viewer: { knowsStatBlocks: boolean } = { knowsStatBlocks: true },
): { placed: PlacedArea; inRange: boolean; caught: Token[] } | null {
  const targeting = option.targeting;
  if (targeting?.kind !== 'area') return null;
  const { placed, inRange } = placeActionArea(actor, targeting, placement, map);
  const isCreature = viewer.knowsStatBlocks ? isAreaCreature : (t: Token) => t.type !== 'object';
  return { placed, inRange, caught: inRange ? tokensCaught(tokens, actor, targeting, placed, map, isCreature) : [] };
}

/** The tokens the preview lights for this aim: none out of range or for an option with no area. */
export function tokensInArea(
  tokens: Token[],
  actor: Token,
  option: ActionOption,
  placement: ActionAreaPlacement,
  map: AreaMap,
  viewer?: { knowsStatBlocks: boolean },
): Token[] {
  return actionAreaPreview(tokens, actor, option, placement, map, viewer)?.caught ?? [];
}


/** An area centred on its caster (a sphere or cylinder that leaves the caster): it needs no aim. */
export function centredOnCaster(option: ActionOption): boolean {
  const t = option.targeting;
  return t?.kind === 'area' && t.origin === 'self' && (t.area.shape === 'sphere' || t.area.shape === 'cylinder');
}

/**
 * A pointer's map point as an area is aimed at it: the centre of the quarter
 * square it is in. The preview follows the pointer in these steps, and the
 * point sent is the one the preview was drawn for, so what the map lit is
 * what the server catches.
 */
export function snapAreaAim(p: { x: number; y: number }, gridSize: number): { x: number; y: number } {
  const step = gridSize / 4;
  return { x: (Math.floor(p.x / step) + 0.5) * step, y: (Math.floor(p.y / step) + 0.5) * step };
}

/** Refusals the bar gives before asking the server (actionStore.confirmPending). */
export const PICK_EVERY_RAY = 'Pick a target for every ray';
export const PICK_A_TARGET = 'Pick at least one target';
export const AIM_THE_AREA = 'Aim the area first';

type ErrorKey = 'notYourToken' | 'invalidTarget' | 'outOfRange' | 'noSpellSlot' | 'cannotResolve' | 'alreadyUndone' | 'alreadyRolled' | 'gmOnly' | 'rechargeSpent' | 'pickEveryRay' | 'pickATarget' | 'aimTheArea' | 'generic';

const ERROR_KEYS: Record<string, ErrorKey> = {
  'Not your token': 'notYourToken',
  'Invalid target': 'invalidTarget',
  'Out of range': 'outOfRange',
  'No spell slot of that level': 'noSpellSlot',
  'This action cannot be resolved': 'cannotResolve',
  'Already undone': 'alreadyUndone',
  'Already rolled': 'alreadyRolled',
  'GM only': 'gmOnly',
  'This action is spent until it recharges': 'rechargeSpent',
  [PICK_EVERY_RAY]: 'pickEveryRay',
  [PICK_A_TARGET]: 'pickATarget',
  [AIM_THE_AREA]: 'aimTheArea',
};

/** The i18n key for a server refusal; anything unknown gets the generic text. */
export function actionErrorKey(error: string | undefined): `actionBar.errors.${ErrorKey}` {
  const key: ErrorKey = (error && Object.prototype.hasOwnProperty.call(ERROR_KEYS, error) ? ERROR_KEYS[error] : undefined) ?? 'generic';
  return `actionBar.errors.${key}`;
}

/** A map as an action's area is measured on it; a map saved before its scale was kept is 5 ft a square, diagonals counted as one. */
export function areaMapOf(map: { gridSize: number; height: number; feetPerSquare?: number | null; diagonalRule?: string | null }): AreaMap {
  return { gridSize: map.gridSize, height: map.height, feetPerSquare: map.feetPerSquare ?? 5, diagonalRule: map.diagonalRule ?? 'flat' };
}
