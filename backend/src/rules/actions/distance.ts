import type { Footprint } from './types';

/** Squares from one footprint's nearest edge to the other's; 0 where they overlap on that axis. */
function axisSquares(aStart: number, aSize: number, bStart: number, bSize: number): number {
  const gap = Math.max(bStart - (aStart + aSize), aStart - (bStart + bSize));
  return gap >= 0 ? gap + 1 : 0;
}

/**
 * Distance in feet between the nearest edges of two tokens. Diagonals follow
 * the map: 'alternating' counts 1, 2, 1, 2 squares; anything else counts one.
 */
export function tokenDistanceFeet(
  a: Footprint,
  b: Footprint,
  map: { feetPerSquare: number; diagonalRule: string },
): number {
  const dx = axisSquares(a.x, a.width, b.x, b.width);
  const dy = axisSquares(a.y, a.height, b.y, b.height);
  const longer = Math.max(dx, dy);
  const shorter = Math.min(dx, dy);
  const squares = map.diagonalRule === 'alternating' ? longer + Math.floor(shorter / 2) : longer;
  return squares * map.feetPerSquare;
}
