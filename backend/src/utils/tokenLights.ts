// ============================================
// The lights a map is lit by: its own, and every token's
//
// A token may carry a light (a torch in hand, a lantern, a glowing monster)
// that moves with it. It lights exactly as a light the GM placed on the map
// would, so both are turned into one list here and every reader of lighting
// takes that list: the server decides which tokens to send by it, the client
// draws light and sight by it. A light only lights; it never sees on anyone's
// behalf (visibilityRule.ts keeps that split).
//
// Byte-identical in backend/src/utils and frontend/src/utils
// (visionParity.test.ts checks).
// ============================================

import type { LightSource } from '../types/walls';
import { tokenCentre } from './tokenCentre';

/**
 * A light a token carries. Radii in grid squares, like a map light's,
 * `0 <= brightRadius <= dimRadius <= 120`; colour `#rrggbb`. `source` says who
 * lit it: `'manual'` by hand (the inventory never changes it), `'item'` by an
 * item in hand, named by `itemId`. A token with no light has `light: null`.
 */
export type TokenLight = {
  brightRadius: number;
  dimRadius: number;
  color: string;
  source: 'manual' | 'item';
  itemId?: string;
};

/** The largest radius a token's light may have, in grid squares. */
export const TOKEN_LIGHT_MAX_RADIUS = 120;

const TOKEN_LIGHT_KEYS = new Set(['brightRadius', 'dimRadius', 'color', 'source', 'itemId']);

/** Whether a value is a token light as it may be stored: nothing more, nothing out of range. */
export function tokenLightValid(v: unknown): v is TokenLight {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const light = v as Record<string, unknown>;
  if (Object.keys(light).some((key) => !TOKEN_LIGHT_KEYS.has(key))) return false;
  const { brightRadius, dimRadius, color, source, itemId } = light;
  if (typeof brightRadius !== 'number' || !Number.isFinite(brightRadius)) return false;
  if (typeof dimRadius !== 'number' || !Number.isFinite(dimRadius)) return false;
  if (brightRadius < 0 || brightRadius > dimRadius || dimRadius > TOKEN_LIGHT_MAX_RADIUS) return false;
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return false;
  if (source !== 'manual' && source !== 'item') return false;
  if (itemId !== undefined && typeof itemId !== 'string') return false;
  return true;
}

/** The fields of a token this file reads; any token shape with them will do. */
export interface LightCarrier {
  id: string;
  position: { x: number; y: number };
  size?: { width: number; height: number } | null;
  layer?: string;
  visible?: boolean;
  light?: TokenLight | null;
}

/** Whether a stored token is one whose light counts: on the table, not hidden by the GM, not on the spirit plane. */
function carriesLight(token: unknown): token is LightCarrier & { light: TokenLight } {
  if (typeof token !== 'object' || token === null) return false;
  const t = token as Partial<LightCarrier>;
  if (typeof t.id !== 'string' || typeof t.position !== 'object' || t.position === null) return false;
  if (!Number.isFinite(t.position.x) || !Number.isFinite(t.position.y)) return false;
  // A token the GM keeps hidden is not on the table yet, and the spirit
  // plane is not the material one: neither lights anything.
  if (t.visible === false || t.layer === 'spirit') return false;
  return tokenLightValid(t.light);
}

/**
 * The map's own lights, unchanged and in order, followed by one enabled light
 * for each token that carries one, at the token's centre in map pixels (y
 * from the top, as map lights are) with id `token:<token id>`. `staticLights`
 * and `tokens` are taken as stored: anything not a list counts as none, and a
 * token whose stored light is not valid lights nothing. Always a new array.
 */
export function effectiveLights(
  staticLights: LightSource[] | unknown,
  tokens: readonly LightCarrier[] | unknown,
  gridSize: number,
  mapHeight: number
): LightSource[] {
  const lights: LightSource[] = Array.isArray(staticLights) ? [...(staticLights as LightSource[])] : [];
  if (!Array.isArray(tokens)) return lights;
  for (const token of tokens as unknown[]) {
    if (!carriesLight(token)) continue;
    const { x, y } = tokenCentre(token, gridSize, mapHeight);
    lights.push({
      id: `token:${token.id}`,
      x,
      y,
      brightRadius: token.light.brightRadius,
      dimRadius: token.light.dimRadius,
      color: token.light.color,
      enabled: true,
    });
  }
  return lights;
}
