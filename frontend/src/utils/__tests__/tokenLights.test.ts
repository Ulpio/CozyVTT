import { describe, it, expect } from 'vitest';
import { effectiveLights, tokenLightValid, type TokenLight } from '../tokenLights';
import type { LightSource } from '@/types/walls';

const GRID = 100;
const MAP_HEIGHT = 20;

const torch: TokenLight = { brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'item', itemId: 'item-1' };

const staticLights: LightSource[] = [
  { id: 'fire', x: 150, y: 250, brightRadius: 2, dimRadius: 4, color: '#ff8800', enabled: true },
  { id: 'off', x: 950, y: 950, brightRadius: 1, dimRadius: 2, color: '#ffffff', enabled: false },
];

function carrier(id: string, x: number, y: number, light: TokenLight | null, size = { width: 1, height: 1 }) {
  return { id, position: { x, y }, size, layer: 'token', visible: true, light };
}

describe('effectiveLights', () => {
  it('keeps the map lights and adds one enabled light at the centre of each token carrying one', () => {
    const lights = effectiveLights(staticLights, [carrier('ogre', 3, 4, torch, { width: 2, height: 2 })], GRID, MAP_HEIGHT);
    expect(lights).toHaveLength(3);
    expect(lights[0]).toEqual(staticLights[0]);
    expect(lights[1]).toEqual(staticLights[1]);
    // Grid y counts from the bottom row; a 2x2 token at (3, 4) covers rows 4-5,
    // so its centre is 5 squares from the bottom, 15 from the top.
    expect(lights[2]).toEqual({
      id: 'token:ogre', x: 400, y: 1500, brightRadius: 4, dimRadius: 8, color: '#ffcc66', enabled: true,
    });
  });

  it('adds nothing for a token with no light', () => {
    const lights = effectiveLights(staticLights, [carrier('a', 1, 1, null), { id: 'b', position: { x: 2, y: 2 } }], GRID, MAP_HEIGHT);
    expect(lights).toEqual(staticLights);
  });

  it('returns a new array and leaves the map lights alone', () => {
    const before = JSON.stringify(staticLights);
    const lights = effectiveLights(staticLights, [carrier('a', 1, 1, torch)], GRID, MAP_HEIGHT);
    expect(lights).not.toBe(staticLights);
    expect(JSON.stringify(staticLights)).toBe(before);
  });

  it('counts no light from a token the GM has hidden or one on the spirit plane', () => {
    const hidden = { ...carrier('h', 1, 1, torch), visible: false };
    const spirit = { ...carrier('s', 2, 2, torch), layer: 'spirit' };
    expect(effectiveLights([], [hidden, spirit], GRID, MAP_HEIGHT)).toEqual([]);
  });

  it('skips a stored light that is not valid, and reads anything not a list as none', () => {
    const bad = { ...carrier('x', 1, 1, null), light: { brightRadius: 9, dimRadius: 2, color: '#ffcc66', source: 'manual' } };
    expect(effectiveLights(null, [bad], GRID, MAP_HEIGHT)).toEqual([]);
    expect(effectiveLights(undefined, 'nonsense', GRID, MAP_HEIGHT)).toEqual([]);
    expect(effectiveLights({}, [null, 3, carrier('t', 0, 0, torch)], GRID, MAP_HEIGHT)).toHaveLength(1);
  });
});

describe('tokenLightValid', () => {
  it('accepts a manual light and an item light', () => {
    expect(tokenLightValid({ brightRadius: 0, dimRadius: 0, color: '#000000', source: 'manual' })).toBe(true);
    expect(tokenLightValid(torch)).toBe(true);
    expect(tokenLightValid({ brightRadius: 120, dimRadius: 120, color: '#ABCDEF', source: 'manual' })).toBe(true);
  });

  it('rejects bright beyond dim, negative radii and radii over 120', () => {
    expect(tokenLightValid({ brightRadius: 9, dimRadius: 8, color: '#ffcc66', source: 'manual' })).toBe(false);
    expect(tokenLightValid({ brightRadius: -1, dimRadius: 8, color: '#ffcc66', source: 'manual' })).toBe(false);
    expect(tokenLightValid({ brightRadius: 4, dimRadius: 121, color: '#ffcc66', source: 'manual' })).toBe(false);
    expect(tokenLightValid({ brightRadius: Number.NaN, dimRadius: 8, color: '#ffcc66', source: 'manual' })).toBe(false);
    expect(tokenLightValid({ brightRadius: 4, dimRadius: Infinity, color: '#ffcc66', source: 'manual' })).toBe(false);
  });

  it('rejects a bad colour, a bad source, a bad item id and anything not a light', () => {
    expect(tokenLightValid({ brightRadius: 4, dimRadius: 8, color: 'red', source: 'manual' })).toBe(false);
    expect(tokenLightValid({ brightRadius: 4, dimRadius: 8, color: '#fc6', source: 'manual' })).toBe(false);
    expect(tokenLightValid({ brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'spell' })).toBe(false);
    expect(tokenLightValid({ brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'item', itemId: 7 })).toBe(false);
    expect(tokenLightValid({ brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'manual', extra: 1 })).toBe(false);
    expect(tokenLightValid({ brightRadius: '4', dimRadius: 8, color: '#ffcc66', source: 'manual' })).toBe(false);
    expect(tokenLightValid(null)).toBe(false);
    expect(tokenLightValid([])).toBe(false);
    expect(tokenLightValid('torch')).toBe(false);
  });
});
