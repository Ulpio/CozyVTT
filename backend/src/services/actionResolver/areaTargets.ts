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

import { placeActionArea, tokensCaught, type AreaMap, type AreaPlacement } from '../../utils/areaGeometry';
import type { ActionOption, ActionTargeting } from '../../rules/actions/catalogue';
import type { Token } from '../../websocket/shared';
import { OUT_OF_RANGE, refuse, type Refusal } from './common';

export type { AreaMap, AreaPlacement };

type AreaTargeting = Extract<ActionTargeting, { kind: 'area' }>;

/**
 * The tokens an area catches, in the map's order, or OUT_OF_RANGE. Where it
 * lands and whom it catches are utils/areaGeometry.ts's, the rule the map
 * previews it with.
 */
export function areaTargets(
  tokens: Token[],
  actor: Token,
  option: ActionOption & { targeting: AreaTargeting },
  placement: AreaPlacement,
  map: AreaMap,
): Token[] | Refusal {
  const { placed, inRange } = placeActionArea(actor, option.targeting, placement, map);
  if (!inRange) return refuse(OUT_OF_RANGE);
  return tokensCaught(tokens, actor, option.targeting, placed, map);
}
