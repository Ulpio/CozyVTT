// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * areaGeometry.ts
 * Where a spell's area falls on the grid, and which squares it covers.
 *
 * It exists once in each package (backend/src/utils and frontend/src/utils,
 * byte for byte): the server decides who an area catches, hidden tokens the
 * client never receives included, and the map previews the same shape.
 *
 * Placement reuses aoeGeometry.ts, so an area lands exactly where the manual
 * template tool draws it. A square is covered when its centre is inside the
 * area (the edge counts as inside); a token is caught when any of its squares is.
 *
 * Coordinates are map pixels with a top-left origin; grid lines fall on
 * multiples of `gridSize`.
 */

import {
  coneOutline,
  cubeRect,
  snapToSquareCentre,
  squareExitPoint,
  squaresFor,
  type ConeRule,
  type Pt,
} from './aoeGeometry';

export type AreaShape = 'sphere' | 'cylinder' | 'cube' | 'cone' | 'line';

export interface AreaSpec {
  shape: AreaShape;
  /** Radius for sphere/cylinder, side for cube, length for cone/line, in feet. */
  sizeFt: number;
  /** Line only, in feet; default 5. */
  widthFt?: number;
}

export interface GridRules {
  gridSize: number;
  feetPerSquare: number;
  coneRule: ConeRule;
}

export interface PxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PlacedArea =
  | { kind: 'circle'; centre: Pt; radius: number }
  | { kind: 'rect'; x: number; y: number; size: number }
  | { kind: 'polygon'; points: Pt[] };

/** Slack for floating-point error, so an edge that is exactly on the boundary stays in. */
const EPS = 1e-6;

/** Segments used to turn a quarter-circle cone's arc into a polygon. */
const SECTOR_SEGMENTS = 24;

/** A cone or line with its origin and aim already fixed. */
function aimedArea(spec: AreaSpec, origin: Pt, angle: number, grid: GridRules): PlacedArea {
  const lengthPx = squaresFor(spec.sizeFt, grid.feetPerSquare) * grid.gridSize;

  if (spec.shape === 'cone') {
    const outline = coneOutline(origin, angle, lengthPx, grid.coneRule);
    if (outline.kind === 'triangle') return { kind: 'polygon', points: [...outline.points] };
    const points: Pt[] = [outline.centre];
    for (let i = 0; i <= SECTOR_SEGMENTS; i++) {
      const a = outline.from + ((outline.to - outline.from) * i) / SECTOR_SEGMENTS;
      points.push({ x: outline.centre.x + Math.cos(a) * outline.radius, y: outline.centre.y + Math.sin(a) * outline.radius });
    }
    return { kind: 'polygon', points };
  }

  // line
  const hw = (squaresFor(spec.widthFt ?? 5, grid.feetPerSquare) * grid.gridSize) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const px = -sin * hw;
  const py = cos * hw;
  const far = { x: origin.x + cos * lengthPx, y: origin.y + sin * lengthPx };
  return {
    kind: 'polygon',
    points: [
      { x: origin.x + px, y: origin.y + py },
      { x: far.x + px, y: far.y + py },
      { x: far.x - px, y: far.y - py },
      { x: origin.x - px, y: origin.y - py },
    ],
  };
}

/**
 * An area placed at a point, the way drawAoEOverlay draws a non-exact anchor:
 * the anchor snaps to the centre of its square, a cube snaps to whole squares,
 * a cone or line emerges from where its aim leaves that square (pointing right
 * when there is no aim).
 */
export function placeAreaAtPoint(spec: AreaSpec, anchor: Pt, aim: Pt | undefined, grid: GridRules): PlacedArea {
  const gs = grid.gridSize;
  const pivot = { x: snapToSquareCentre(anchor.x, gs), y: snapToSquareCentre(anchor.y, gs) };
  const sizeSquares = squaresFor(spec.sizeFt, grid.feetPerSquare);

  switch (spec.shape) {
    case 'sphere':
    case 'cylinder':
      return { kind: 'circle', centre: pivot, radius: sizeSquares * gs };
    case 'cube':
      return { kind: 'rect', ...cubeRect(pivot, gs, sizeSquares) };
    default: {
      const angle = aim ? Math.atan2(aim.y - pivot.y, aim.x - pivot.x) : 0;
      return aimedArea(spec, squareExitPoint(pivot, gs, angle), angle, grid);
    }
  }
}

/**
 * Where the ray from a footprint's centre towards `aim` leaves the footprint:
 * squareExitPoint generalised to a W×H rectangle (the same for 1×1).
 */
function rectExitPoint(rect: PxRect, angle: number): Pt {
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const t = Math.min(rect.width / 2 / Math.abs(cos), rect.height / 2 / Math.abs(sin));
  if (!Number.isFinite(t)) return centre;
  return { x: centre.x + cos * t, y: centre.y + sin * t };
}

/**
 * A cone or line cast by a creature: it emerges from the point where the aim
 * leaves the caster's footprint, so a large creature's cone starts at its edge
 * and never covers its own squares. Other shapes are placed at the aim point.
 */
export function placeAreaFromCaster(spec: AreaSpec, caster: PxRect, aim: Pt, grid: GridRules): PlacedArea {
  if (spec.shape !== 'cone' && spec.shape !== 'line') return placeAreaAtPoint(spec, aim, undefined, grid);
  const cx = caster.x + caster.width / 2;
  const cy = caster.y + caster.height / 2;
  const angle = Math.atan2(aim.y - cy, aim.x - cx);
  return aimedArea(spec, rectExitPoint(caster, angle), angle, grid);
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    // On an edge counts as inside.
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (
      len > 0 &&
      Math.abs(cross) <= EPS * len &&
      p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS &&
      p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS
    ) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether the centre of a grid square is inside the area (the boundary counts as inside). */
export function squareInArea(area: PlacedArea, col: number, row: number, gridSize: number): boolean {
  const p = { x: (col + 0.5) * gridSize, y: (row + 0.5) * gridSize };
  switch (area.kind) {
    case 'circle':
      return Math.hypot(p.x - area.centre.x, p.y - area.centre.y) <= area.radius + EPS;
    case 'rect':
      return p.x >= area.x - EPS && p.x <= area.x + area.size + EPS && p.y >= area.y - EPS && p.y <= area.y + area.size + EPS;
    case 'polygon':
      return pointInPolygon(p, area.points);
  }
}

/** Whether any grid square the rectangle covers is in the area. */
export function rectInArea(area: PlacedArea, rect: PxRect, gridSize: number): boolean {
  const c0 = Math.floor(rect.x / gridSize + EPS);
  const r0 = Math.floor(rect.y / gridSize + EPS);
  const c1 = Math.ceil((rect.x + rect.width) / gridSize - EPS) - 1;
  const r1 = Math.ceil((rect.y + rect.height) / gridSize - EPS) - 1;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) if (squareInArea(area, c, r, gridSize)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// An action's area on a map of tokens: where it lands from its caster, whether
// it is in range, and whom it catches. The server refuses and resolves by
// these (services/actionResolver/areaTargets.ts) over every token; the map's
// preview highlights by them over the tokens its viewer is sent.
// ---------------------------------------------------------------------------

/** A token as an area reads it. Token rows count from the bottom of the map. */
export interface AreaToken {
  id: string;
  position: { x: number; y: number };
  size?: { width: number; height: number } | null;
  layer?: string | null;
  type?: string | null;
  characterId?: string | null;
  statBlock?: unknown;
}

/** The map an action's area is measured on: `height` in squares. */
export interface AreaMap {
  gridSize: number;
  height: number;
  feetPerSquare: number;
  diagonalRule: string;
}

/** How an action's area is aimed: an option's area targeting. */
export interface ActionArea {
  area: AreaSpec;
  origin: 'self' | 'point';
  rangeFeet?: number;
}

/** Where an area is aimed, in map pixels. */
export interface AreaPlacement {
  anchor: Pt;
  aim?: Pt;
}

/** 5e's cone: as wide at its end as it is long. */
export const ACTION_CONE_RULE: ConeRule = 'width-equals-distance';

/** A token's box in map pixels, y counted from the top. */
export function tokenPxRect(t: AreaToken, map: Pick<AreaMap, 'gridSize' | 'height'>): PxRect {
  const width = t.size?.width ?? 1;
  const height = t.size?.height ?? 1;
  return { x: t.position.x * map.gridSize, y: (map.height - t.position.y - height) * map.gridSize, width: width * map.gridSize, height: height * map.gridSize };
}

/** Squares from one footprint's nearest edge to the other's; 0 where they overlap on that axis. */
function axisSquares(aStart: number, aSize: number, bStart: number, bSize: number): number {
  const gap = Math.max(bStart - (aStart + aSize), aStart - (bStart + bSize));
  return gap >= 0 ? gap + 1 : 0;
}

/** Feet from a token to the square a map point falls in, measured as a reach is (rules/actions/distance.ts). */
function feetToPoint(actor: AreaToken, p: Pt, map: AreaMap): number {
  const col = Math.floor(p.x / map.gridSize);
  const row = map.height - 1 - Math.floor(p.y / map.gridSize);
  const dx = axisSquares(actor.position.x, actor.size?.width ?? 1, col, 1);
  const dy = axisSquares(actor.position.y, actor.size?.height ?? 1, row, 1);
  const longer = Math.max(dx, dy);
  const shorter = Math.min(dx, dy);
  const squares = map.diagonalRule === 'alternating' ? longer + Math.floor(shorter / 2) : longer;
  return squares * map.feetPerSquare;
}

/**
 * Where an action's area lands, and whether that is in range. A point area is
 * centred where it is aimed, within its range of the caster. One that leaves
 * the caster: a cone or line turns towards the aim (the anchor when there is
 * no aim); a sphere or cylinder is centred on the caster; a cube is placed
 * where it is aimed, within its own side of the caster. An area out of range
 * is still placed, for the map to draw it in the refusal colour.
 */
export function placeActionArea(actor: AreaToken, targeting: ActionArea, placement: AreaPlacement, map: AreaMap): { placed: PlacedArea; inRange: boolean } {
  const grid: GridRules = { gridSize: map.gridSize, feetPerSquare: map.feetPerSquare, coneRule: ACTION_CONE_RULE };
  const { area } = targeting;
  if (targeting.origin === 'point') {
    const inRange = targeting.rangeFeet === undefined || feetToPoint(actor, placement.anchor, map) <= targeting.rangeFeet;
    return { placed: placeAreaAtPoint(area, placement.anchor, placement.aim, grid), inRange };
  }
  const caster = tokenPxRect(actor, map);
  if (area.shape === 'cone' || area.shape === 'line') {
    return { placed: placeAreaFromCaster(area, caster, placement.aim ?? placement.anchor, grid), inRange: true };
  }
  if (area.shape === 'cube') {
    return { placed: placeAreaAtPoint(area, placement.anchor, undefined, grid), inRange: feetToPoint(actor, placement.anchor, map) <= area.sizeFt };
  }
  return { placed: placeAreaAtPoint(area, { x: caster.x + caster.width / 2, y: caster.y + caster.height / 2 }, undefined, grid), inRange: true };
}

/** A creature an area can catch: not an object token, and with a sheet or a stat block. */
export function isAreaCreature(t: AreaToken): boolean {
  return t.type !== 'object' && (!!t.characterId || (!!t.statBlock && typeof t.statBlock === 'object'));
}

/**
 * The tokens a placed area catches, in the order given: every creature on the
 * caster's plane any of whose squares the area covers, allies, hidden tokens
 * and the caster inside its own sphere, cube or cylinder included. A cone or
 * line leaves the caster's edge, so it never catches the caster.
 */
export function tokensCaught<T extends AreaToken>(
  tokens: readonly (T | null | undefined)[],
  actor: AreaToken,
  targeting: ActionArea,
  placed: PlacedArea,
  map: Pick<AreaMap, 'gridSize' | 'height'>,
  isCreature: (t: T) => boolean = isAreaCreature,
): T[] {
  const leavesCaster = targeting.area.shape === 'cone' || targeting.area.shape === 'line';
  const plane = actor.layer ?? 'token';
  return tokens.filter((t): t is T =>
    !!t &&
    (t.layer ?? 'token') === plane &&
    isCreature(t) &&
    !(leavesCaster && t.id === actor.id) &&
    rectInArea(placed, tokenPxRect(t, map), map.gridSize));
}
