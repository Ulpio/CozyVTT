export type RollMode = 'normal' | 'advantage' | 'disadvantage';

/** Returns a whole number from 1 to `sides`. */
export type Rng = (sides: number) => number;

/** A token's place on the grid, in squares. */
export interface Footprint {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ParsedRange =
  | { kind: 'self' }
  | { kind: 'touch' }
  | { kind: 'feet'; normal: number; long?: number };
