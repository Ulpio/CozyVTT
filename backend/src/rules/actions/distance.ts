import { footprintDistanceFeet } from '../../utils/areaGeometry';
import type { Footprint } from './types';

/**
 * Distance in feet between the nearest edges of two tokens. Diagonals follow
 * the map: 'alternating' counts 1, 2, 1, 2 squares; anything else counts one.
 * The rule lives in utils/areaGeometry.ts, shared with the client's rings.
 */
export function tokenDistanceFeet(
  a: Footprint,
  b: Footprint,
  map: { feetPerSquare: number; diagonalRule: string },
): number {
  return footprintDistanceFeet(a, b, map);
}
