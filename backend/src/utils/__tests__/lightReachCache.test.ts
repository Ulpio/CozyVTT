/**
 * What a light reaches is kept from one read of the map to the next.
 *
 * Every token move on a lit map reads the map again and works out each
 * player's sight from that read. The walls and lights are the same from one
 * move to the next, and each light's reach used to be raycast again every
 * time. It is kept now, by what the walls and the light are, so a changed
 * wall or a moved light is worked out afresh and never answered from before.
 */

import * as raycasting from '../raycasting';
import { filterTokensByLighting, tokensSentTo, LIGHT_REACH_POINTS_KEPT, type MapTokenSight } from '../spirit-layer';
import type { Token } from '../../websocket/shared';
import type { WallSegment, LightSource } from '../../types/walls';

const GRID = 100;
const SIZE = 20;

/** A token at grid (x, y), y counted from the bottom row. */
function token(id: string, x: number, y: number, controlledBy: string | null = null): Token {
  return {
    id, name: id, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 }, layer: 'token',
    visible: true, controlledBy, rotation: 0, conditions: [], metadata: {}, sightRadius: 0,
  } as unknown as Token;
}

// The player's token at the left, an NPC in the dark at the right, both on
// the row whose centre is 950 px down; nothing stands between them.
const tokens = [token('me', 2, 10, 'p1'), token('npc', 14, 10)];

function light(id: string, x: number): LightSource {
  return { id, x, y: 950, brightRadius: 2, dimRadius: 4, color: '#ffaa55', enabled: true } as LightSource;
}

/** A wall standing across the row at x, between the NPC and a light to its right. */
function wallAt(x: number, type: WallSegment['type'] = 'wall'): WallSegment {
  return { id: 'w1', x1: x, y1: 800, x2: x, y2: 1100, type };
}

/** Which tokens the player is sent from one read of the map: fresh arrays every time, as a read gives. */
function sent(walls: WallSegment[], lights: LightSource[]): string[] {
  const read = JSON.parse(JSON.stringify({ walls, lights })) as { walls: unknown; lights: unknown };
  return filterTokensByLighting(tokens, 'p1', read.walls, SIZE, SIZE, GRID, true, read.lights, false).map((t) => t.id).sort();
}

let reaches: jest.SpyInstance;
beforeEach(() => {
  reaches = jest.spyOn(raycasting, 'computeVisibility');
});
afterEach(() => {
  reaches.mockRestore();
});

/** How many lights' reach was raycast, as opposed to a token's sight, which has no radius. */
const lightsRaycast = () => reaches.mock.calls.filter((call) => (call[4] ?? 0) > 0).length;

describe('a light\'s reach across reads of the map', () => {
  it('is raycast once while the walls and the lights stay as they are', () => {
    const lights = [light('torch', 1750), light('lamp', 300)];
    const walls = [wallAt(1600), { id: 'w2', x1: 0, y1: 0, x2: 50, y2: 0, type: 'window' as const }];
    sent(walls, lights);
    const first = lightsRaycast();
    sent(walls, lights);
    sent(walls, lights);
    expect(lightsRaycast()).toBe(first);
  });

  it('is raycast again for the one light that moved', () => {
    const walls = [wallAt(1600)];
    sent(walls, [light('torch', 1750), light('lamp', 300)]);
    const before = lightsRaycast();
    sent(walls, [light('torch', 1760), light('lamp', 300)]);
    expect(lightsRaycast()).toBe(before + 1);
  });

  it('is raycast again for every light when a wall changes', () => {
    const lights = [light('torch', 1750), light('lamp', 300)];
    sent([wallAt(1600)], lights);
    const before = lightsRaycast();
    sent([wallAt(1600, 'door-open')], lights);
    expect(lightsRaycast()).toBe(before + 2);
  });

  it('never answers from before a change: what is seen follows the walls and the light', () => {
    // The torch lights the NPC; then a wall between them puts it in the
    // dark; the torch moved to the NPC's side of the wall lights it again;
    // back where it was, the wall opened as a door lets the light through,
    // and closed it does not.
    expect(sent([], [light('torch', 1750)])).toEqual(['me', 'npc']);
    expect(sent([wallAt(1600)], [light('torch', 1750)])).toEqual(['me']);
    expect(sent([wallAt(1600)], [light('torch', 1300)])).toEqual(['me', 'npc']);
    expect(sent([wallAt(1600, 'door-open')], [light('torch', 1750)])).toEqual(['me', 'npc']);
    expect(sent([wallAt(1600, 'door-closed')], [light('torch', 1750)])).toEqual(['me']);
    expect(sent([], [light('torch', 1750)])).toEqual(['me', 'npc']);
  });

  it('follows the light\'s radius and the map\'s size', () => {
    const walls = [wallAt(1600)];
    sent(walls, [light('torch', 1300)]);
    const before = lightsRaycast();
    sent(walls, [{ ...light('torch', 1300), dimRadius: 5 }]);
    expect(lightsRaycast()).toBe(before + 1);
    const read = JSON.parse(JSON.stringify({ walls, lights: [light('torch', 1300)] })) as { walls: unknown; lights: unknown };
    filterTokensByLighting(tokens, 'p1', read.walls, SIZE + 1, SIZE, GRID, true, read.lights, false);
    expect(lightsRaycast()).toBe(before + 2);
  });
});

describe('a token\'s light within one read of the map', () => {
  // A drag or a fan-out asks again with the same read's wall and light
  // arrays while a torch-carrying token stands somewhere else each time:
  // what the lights reach must follow the token, not the arrays.
  const torch = { brightRadius: 2, dimRadius: 4, color: '#ffcc66', source: 'manual' as const };
  const read = JSON.parse(JSON.stringify({ walls: [wallAt(1600)], lights: [] })) as { walls: unknown; lights: unknown };
  const sentWithCarrierAt = (x: number) => {
    const carrier = { ...token('bearer', x, 12), light: torch } as unknown as Token;
    const map = {
      tokens: [...tokens, carrier], lightingEnabled: true, wallSegments: read.walls, width: SIZE, height: SIZE,
      gridSize: GRID, lights: read.lights, globalIllumination: false,
    } as unknown as MapTokenSight;
    return tokensSentTo(map, 'PLAYER', false, 'p1').map((t) => t.id).filter((id) => id !== 'bearer').sort();
  };

  it('lights what the token stands by, and stops when it walks away or behind a wall', () => {
    // The bearer two rows above the NPC: the NPC (x 14) is in its light.
    expect(sentWithCarrierAt(14)).toEqual(['me', 'npc']);
    // Far to the left: the NPC is in the dark again.
    expect(sentWithCarrierAt(5)).toEqual(['me']);
    // Right of the wall at x 1600: the wall shades the NPC from it.
    expect(sentWithCarrierAt(17)).toEqual(['me']);
    expect(sentWithCarrierAt(14)).toEqual(['me', 'npc']);
  });

  it('keeps what a map with no token lights reaches, read after read', () => {
    const lights = [light('torch', 1750)];
    const walls = [wallAt(1600)];
    const once = JSON.parse(JSON.stringify({ walls, lights })) as { walls: unknown; lights: unknown };
    const map = {
      tokens, lightingEnabled: true, wallSegments: once.walls, width: SIZE, height: SIZE, gridSize: GRID,
      lights: once.lights, globalIllumination: false,
    } as unknown as MapTokenSight;
    tokensSentTo(map, 'PLAYER', false, 'p1');
    const before = reaches.mock.calls.length;
    for (let i = 0; i < 5; i++) tokensSentTo(map, 'PLAYER', false, 'p1');
    // Only each ask's own line of sight is raycast: no light is worked out again.
    expect(reaches.mock.calls.length - before).toBe(5);
  });
});

describe('what is kept of the lights\' reach', () => {
  // A light at an x listed in `sizes` reaches a polygon of that many points,
  // all at the light: it lights nothing, and only its size matters here.
  const realVisibility = jest.requireActual<typeof raycasting>('../raycasting').computeVisibility;
  let sizes: Map<number, number>;
  beforeEach(() => {
    sizes = new Map();
    reaches.mockImplementation((viewer, walls, width, height, radius) => {
      const points = sizes.get(viewer.x);
      if (radius && points !== undefined) return { points: new Array(points).fill({ x: viewer.x, y: viewer.y }) };
      return realVisibility(viewer, walls, width, height, radius);
    });
  });

  /** How often the light at x had its reach raycast. */
  const raycastAt = (x: number) => reaches.mock.calls.filter((call) => call[0].x === x && (call[4] ?? 0) > 0).length;

  it('lets the oldest go once the points kept pass the bound', () => {
    const half = LIGHT_REACH_POINTS_KEPT / 2;
    sizes.set(501, half).set(502, half).set(503, half);
    sent([], [light('a', 501)]);
    sent([], [light('b', 502)]);
    sent([], [light('a', 501)]);
    expect(raycastAt(501)).toBe(1);
    // The third pushes the points kept past the bound, so the oldest used,
    // the second, is let go and the first stays.
    sent([], [light('c', 503)]);
    sent([], [light('a', 501)]);
    sent([], [light('c', 503)]);
    expect(raycastAt(501)).toBe(1);
    expect(raycastAt(503)).toBe(1);
    sent([], [light('b', 502)]);
    expect(raycastAt(502)).toBe(2);
  });

  it('never keeps one reach of more points than the bound', () => {
    sizes.set(601, 1000).set(602, LIGHT_REACH_POINTS_KEPT + 1);
    sent([], [light('small', 601)]);
    sent([], [light('huge', 602)]);
    sent([], [light('huge', 602)]);
    expect(raycastAt(602)).toBe(2);
    // and keeping nothing of it lets nothing else go.
    sent([], [light('small', 601)]);
    expect(raycastAt(601)).toBe(1);
  });
});
