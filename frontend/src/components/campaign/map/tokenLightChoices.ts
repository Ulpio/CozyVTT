// ============================================
// The lights the token menu's Luz submenu offers: none, four ordinary
// lights, and a custom one. Radii in grid squares, like a TokenLight's.
// ============================================

import type { TokenLight } from '@/utils/tokenLights';

/** The colour of a flame. */
export const FLAME_COLOR = '#ffcc66';

export const LIGHT_PRESETS = [
  { id: 'candle', brightRadius: 1, dimRadius: 2 },
  { id: 'torch', brightRadius: 4, dimRadius: 8 },
  { id: 'lamp', brightRadius: 3, dimRadius: 6 },
  { id: 'lantern', brightRadius: 6, dimRadius: 12 },
] as const;

export type LightPresetId = (typeof LIGHT_PRESETS)[number]['id'];

/** A preset as the light it sets: by hand, so the inventory never changes it. */
export function presetLight(preset: (typeof LIGHT_PRESETS)[number]): TokenLight {
  return { brightRadius: preset.brightRadius, dimRadius: preset.dimRadius, color: FLAME_COLOR, source: 'manual' };
}

/** The preset a light is (by radii and colour), or null for a custom light. */
export function presetOf(light: TokenLight): LightPresetId | null {
  const found = LIGHT_PRESETS.find(
    (p) => p.brightRadius === light.brightRadius && p.dimRadius === light.dimRadius && light.color.toLowerCase() === FLAME_COLOR,
  );
  return found ? found.id : null;
}

/** A light put out by hand: no radius, and manual, so the inventory never relights it. */
export const LIGHT_OUT: TokenLight = { brightRadius: 0, dimRadius: 0, color: FLAME_COLOR, source: 'manual' };

/** Whether a light is the one put out by hand. */
export function isLightOut(light: TokenLight): boolean {
  return light.dimRadius === 0;
}
