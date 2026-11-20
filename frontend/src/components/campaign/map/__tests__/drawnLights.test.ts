/**
 * The lights the client draws and sees by: the map's own and the tokens'.
 *
 * Each token light must be counted once. A player is sent every token light
 * on the map as lit ground (`tokenLights`), their own tokens' included, and
 * also their own tokens with `light` on them: drawing both lit a player's
 * torch twice. So a player draws the map's lights and `tokenLights`, and
 * nothing from the tokens; the GM, who is sent every token as it is stored,
 * draws the map's lights and the tokens' own lights, and not `tokenLights`.
 */

import { describe, it, expect } from 'vitest';
import { drawnLights } from '../drawnLights';
import { computeVisionState } from '../vision';
import type { Viewport } from '../layers/types';
import type { Token, TokenLightSent } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import type { LightSource } from '@/types/walls';
import type { TokenLight } from '@/utils/tokenLights';
import { isPointVisible } from '@/utils/raycasting';

const viewport: Viewport = { zoom: 1, panOffset: { x: 0, y: 0 }, gridSize: 50, mapWidth: 10, mapHeight: 10 };
const torch: TokenLight = { brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'item', itemId: 'i1' };

function token(id: string, x: number, y: number, light: TokenLight | null = null): Token {
  return {
    id, characterId: null, name: id, imageUrl: '',
    position: { x, y }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, controlledBy: 'me',
    rotation: 0, conditions: [], metadata: {},
    type: TokenType.PLAYER, disposition: null, hp: null, showHpBar: false,
    notes: '', initiative: null, sightRadius: 0, light,
  } as Token;
}

const lamp: LightSource = { id: 'l1', x: 25, y: 25, brightRadius: 1, dimRadius: 2, color: '#ffffff', enabled: true };
const snuffed: LightSource = { id: 'l2', x: 75, y: 75, brightRadius: 1, dimRadius: 2, color: '#ffffff', enabled: false };
// The hero at (2, 2) carries a torch: centre (125, 375) on a 10-row map.
const hero = token('hero', 2, 2, torch);
const heroGround: TokenLightSent = { x: 125, y: 375, brightRadius: 4, dimRadius: 8, color: '#ffcc66' };
// A goblin round a corner, not sent to the player, whose torch is.
const goblinGround: TokenLightSent = { x: 425, y: 75, brightRadius: 4, dimRadius: 8, color: '#ffcc66' };

describe('drawnLights', () => {
  it('gives a player the map\'s enabled lights and every token light as lit ground, each once', () => {
    const lights = drawnLights({
      isGM: false, staticLights: [lamp, snuffed], tokens: [hero], tokenLights: [heroGround, goblinGround],
      gridSize: 50, mapHeight: 10,
    });
    expect(lights.map(({ x, y, dimRadius }) => [x, y, dimRadius])).toEqual([[25, 25, 2], [125, 375, 8], [425, 75, 8]]);
    expect(lights.every((l) => l.enabled)).toBe(true);
    expect(new Set(lights.map((l) => l.id)).size).toBe(lights.length);
  });

  it('never draws a player\'s own token light from the token itself', () => {
    const lights = drawnLights({ isGM: false, staticLights: [], tokens: [hero], tokenLights: [], gridSize: 50, mapHeight: 10 });
    expect(lights).toEqual([]);
  });

  it('gives the GM the map\'s lights and the tokens\' own lights, not the lit ground as well', () => {
    const lights = drawnLights({
      isGM: true, staticLights: [lamp, snuffed], tokens: [hero], tokenLights: [heroGround, goblinGround],
      gridSize: 50, mapHeight: 10,
    });
    expect(lights.map(({ id, x, y }) => [id, x, y])).toEqual([['l1', 25, 25], ['token:hero', 125, 375]]);
  });

  it('takes a map sent with no tokenLights as having none', () => {
    expect(drawnLights({ isGM: false, staticLights: [lamp], tokens: [], tokenLights: undefined, gridSize: 50, mapHeight: 10 }))
      .toEqual([lamp]);
  });

  it('lights the ground around a tokenLights entry in the client\'s vision', () => {
    const lights = drawnLights({ isGM: false, staticLights: [], tokens: [], tokenLights: [goblinGround], gridSize: 50, mapHeight: 10 });
    const vision = computeVisionState([token('viewer', 0, 0)], lights, [], viewport);
    expect(vision.lightVision).toHaveLength(1);
    const reach = vision.lightVision[0].poly;
    expect(reach.points.length).toBeGreaterThanOrEqual(3);
    // Inside the dim radius (8 squares = 400 px) and outside it.
    expect(isPointVisible({ x: 425, y: 275 }, reach)).toBe(true);
    expect(isPointVisible({ x: 25, y: 475 }, reach)).toBe(false);
  });
});
