/**
 * What a player is told when her own move takes a token out of sight.
 *
 * After the leak fix, a `token:disappeared` is sent only for a token the
 * player had seen before the move. Here Ana sees a goblin, walks her own
 * token behind a wall, and is told once that the goblin is gone, and never
 * told anything about a token that was out of her sight all along.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { createTestUser } from '../../__tests__/helpers/db';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let gmId: string;
let anaId: string;
let campaignId: string;
let mapId: string;

const HERO = 'hero-own';
const GOBLIN = 'goblin-seen';
const GHOST = 'ghost-never-seen';

/**
 * Grid 50. A wall down x=500 splits the map; one across y=250 left of it.
 * The hero at (2, 10) sees the goblin at (6, 10) in the open. The ghost at
 * (3, 2) is behind the horizontal wall from her start and behind the
 * vertical one from her destination (14, 10): out of her sight throughout.
 */
const walls = [
  { id: randomUUID(), x1: 500, y1: 0, x2: 500, y2: 1000, type: 'wall' },
  { id: randomUUID(), x1: 0, y1: 250, x2: 500, y2: 250, type: 'wall' },
];
const token = (id: string, x: number, y: number, controlledBy: string | null) => ({
  id, characterId: null, name: id, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
  layer: 'token', visible: true, controlledBy, rotation: 0, conditions: [], metadata: {},
});

beforeAll(async () => {
  const [gm, ana] = await Promise.all(['gm', 'ana'].map((n) => createTestUser({ displayName: `Own ${n}` })));
  [gmId, anaId] = [gm.id, ana.id];
  campaignId = (await prisma.campaign.create({ data: { name: `Own move ${runId}`, ownerId: gmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: anaId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Own', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, annotations: [], lightingEnabled: true, globalIllumination: true, fogEnabled: false,
      wallSegments: toJson(walls), lights: toJson([]),
      tokens: toJson([token(HERO, 2, 10, anaId), token(GOBLIN, 6, 10, null), token(GHOST, 3, 18, null)]),
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, anaId] } } });
  await prisma.$disconnect();
});

function record(client: Socket): Array<[string, any]> {
  const seen: Array<[string, any]> = [];
  client.onAny((event: string, data: unknown) => seen.push([event, data]));
  return seen;
}

describe("a player's own move out of sight of a token she saw", () => {
  it('names that token as gone once, and says nothing of one she never saw', async () => {
    const ana = await server.connectAndAuth(await server.loginAs(anaId), campaignId);
    const seen = record(ana);

    const moved = waitForEvent<{ tokenId: string }>(ana, 'token.moved');
    ana.emit('token.move.end', { tokenId: HERO, mapId, x: 14, y: 10 });
    expect((await moved).tokenId).toBe(HERO);
    await new Promise((r) => setTimeout(r, 600));

    const gone = seen.filter(([e]) => e === 'token:disappeared').map(([, d]) => d);
    expect(gone).toEqual([{ tokenId: GOBLIN, mapId }]);
    const named = JSON.stringify(seen);
    expect(named).not.toContain(GHOST);

    ana.disconnect();
  });
});
