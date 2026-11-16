/**
 * Who an area catches, measured on the server: the client never receives a
 * hidden token, so it cannot know who is inside. The client sends where the
 * area is aimed; the area is placed on the grid by the same rule the map
 * previews it with (utils/areaGeometry.ts), and every token any of whose
 * squares it covers is caught, with no exceptions: allies, hidden tokens, and
 * the caster inside its own sphere, cube or cylinder. A cone or line leaves
 * the caster's edge, so it never catches the caster.
 *
 * Caught are the tokens on the caster's own plane (token or spirit layer)
 * that are creatures: not an object token, and with a sheet or a stat block.
 * The resolver drops, after this, a token whose sheet is not one of the
 * campaign's characters and that has no stat block.
 */

import { placeAreaAtPoint, placeAreaFromCaster, rectInArea, type GridRules, type PlacedArea, type PxRect } from '../../utils/areaGeometry';
import type { Pt } from '../../utils/aoeGeometry';
import type { ActionOption, ActionTargeting } from '../../rules/actions/catalogue';
import { tokenDistanceFeet } from '../../rules/actions/distance';
import type { Token } from '../../websocket/shared';
import { OUT_OF_RANGE, footprint, refuse, type Refusal } from './common';

/** The map as an area is measured on it. `height` is in squares; token rows count from the bottom. */
export interface AreaMap {
  gridSize: number;
  height: number;
  feetPerSquare: number;
  diagonalRule: string;
}

export interface AreaPlacement {
  anchor: Pt;
  aim?: Pt;
}

type AreaTargeting = Extract<ActionTargeting, { kind: 'area' }>;

/** 5e's cone: as wide at its end as it is long. */
const CONE_RULE = 'width-equals-distance' as const;

/** A token's box in map pixels, y counted from the top (token rows count from the bottom). */
export function tokenRect(t: Token, map: Pick<AreaMap, 'gridSize' | 'height'>): PxRect {
  const width = t.size?.width ?? 1;
  const height = t.size?.height ?? 1;
  return { x: t.position.x * map.gridSize, y: (map.height - t.position.y - height) * map.gridSize, width: width * map.gridSize, height: height * map.gridSize };
}

/** Feet from the token to the square a map point falls in, as P5a measures a reach. */
function feetToPoint(actor: Token, p: Pt, map: AreaMap): number {
  const col = Math.floor(p.x / map.gridSize);
  const row = map.height - 1 - Math.floor(p.y / map.gridSize);
  return tokenDistanceFeet(footprint(actor), { x: col, y: row, width: 1, height: 1 }, map);
}

/**
 * Where the area lands, or OUT_OF_RANGE. A point area is centred where it is
 * aimed, within its range of the caster. One that leaves the caster: a cone
 * or line turns towards the aim (the anchor when no aim is sent); a sphere or
 * cylinder is centred on the caster; a cube is placed where it is aimed,
 * within its own side of the caster.
 */
export function placeActionArea(actor: Token, targeting: AreaTargeting, placement: AreaPlacement, map: AreaMap): PlacedArea | Refusal {
  const grid: GridRules = { gridSize: map.gridSize, feetPerSquare: map.feetPerSquare, coneRule: CONE_RULE };
  const { area } = targeting;
  if (targeting.origin === 'point') {
    if (targeting.rangeFeet !== undefined && feetToPoint(actor, placement.anchor, map) > targeting.rangeFeet) return refuse(OUT_OF_RANGE);
    return placeAreaAtPoint(area, placement.anchor, placement.aim, grid);
  }
  const caster = tokenRect(actor, map);
  if (area.shape === 'cone' || area.shape === 'line') return placeAreaFromCaster(area, caster, placement.aim ?? placement.anchor, grid);
  if (area.shape === 'cube') {
    if (feetToPoint(actor, placement.anchor, map) > area.sizeFt) return refuse(OUT_OF_RANGE);
    return placeAreaAtPoint(area, placement.anchor, undefined, grid);
  }
  return placeAreaAtPoint(area, { x: caster.x + caster.width / 2, y: caster.y + caster.height / 2 }, undefined, grid);
}

/** The tokens an area catches, in the map's order, or OUT_OF_RANGE. */
export function areaTargets(
  tokens: Token[],
  actor: Token,
  option: ActionOption & { targeting: AreaTargeting },
  placement: AreaPlacement,
  map: AreaMap,
): Token[] | Refusal {
  const placed = placeActionArea(actor, option.targeting, placement, map);
  if ('ok' in placed) return placed;
  const shape = option.targeting.area.shape;
  const leavesCaster = shape === 'cone' || shape === 'line';
  const plane = actor.layer ?? 'token';
  return tokens.filter((t) =>
    !!t &&
    (t.layer ?? 'token') === plane &&
    t.type !== 'object' &&
    (!!t.characterId || (!!t.statBlock && typeof t.statBlock === 'object')) &&
    !(leavesCaster && t.id === actor.id) &&
    rectInArea(placed, tokenRect(t, map), map.gridSize));
}
