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
