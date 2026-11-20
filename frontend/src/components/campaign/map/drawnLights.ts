// ============================================
// The lights this client draws and sees by
//
// The map's own enabled lights plus every token's light, each counted once,
// for the lighting layer, the vision polygons and the visibility rule alike,
// so what is drawn lit is what the server judges lit (spirit-layer.ts
// mapLights).
//
// One source for the token lights, never two:
// - a player draws `tokenLights`, every token light on the map as lit ground
//   (the server's tokenLightsOf), their own tokens' included. Their own
//   tokens also arrive with `light` on them, which is not drawn again here.
// - the GM, sent every token as it is stored, draws the tokens' own lights
//   (effectiveLights), which follow a token the moment the GM moves it, and
//   not `tokenLights` too.
//
// Pure: no React.
// ============================================

import type { LightSource } from '@/types/walls';
import type { TokenLightSent } from '@/types';
import { effectiveLights, type LightCarrier } from '@/utils/tokenLights';

export interface DrawnLightsInput {
  isGM: boolean;
  /** The map's own lights, as the GM placed them; a disabled one lights nothing. */
  staticLights: readonly LightSource[];
  /** The tokens this client holds. Read for the GM only. */
  tokens: readonly LightCarrier[];
  /** Every token light as lit ground, as the map was sent. Read for a player only. */
  tokenLights: readonly TokenLightSent[] | undefined;
  gridSize: number;
  /** The map's height in grid squares (token y counts from the bottom row). */
  mapHeight: number;
}

/** The map's enabled lights followed by one light per token light, each once. */
export function drawnLights({ isGM, staticLights, tokens, tokenLights, gridSize, mapHeight }: DrawnLightsInput): LightSource[] {
  const enabled = staticLights.filter((l) => l.enabled);
  if (isGM) return effectiveLights(enabled, tokens, gridSize, mapHeight);
  const ground: LightSource[] = (tokenLights ?? []).map((l, i) => ({
    // Only for the vision cache's key: the list carries no token ids.
    id: `tokenLight:${i}`,
    x: l.x,
    y: l.y,
    brightRadius: l.brightRadius,
    dimRadius: l.dimRadius,
    color: l.color,
    enabled: true,
  }));
  return [...enabled, ...ground];
}
