/**
 * A token's light (token.light.set), and the lit ground players are sent.
 *
 * The GM may light any token, a player only a token they control. The token's
 * light itself reaches the GM and its controllers; every other reader learns
 * of it only as `tokenLights`, a list of lit circles with no token id, so a
 * goblin's torch round a corner lights the floor a player can see without the
 * goblin ever being sent to them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createTestUser, TEST_PASSWORD } from '../../__tests__/helpers/db';

jest.setTimeout(30000);

const NOT_YOURS = 'Você não controla esse token.';
const BAD_LIGHT = 'Essa luz não é válida.';

const app = createTestApp();
const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let gmId: string;
let anaId: string;
let beaId: string;
let campaignId: string;
let anaAgent: ReturnType<typeof request.agent>;
let gm: Socket;
let ana: Socket;
let bea: Socket;

const TORCH = { brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'manual' as const };

/**
 * 20 x 20 squares of 50 px. A wall runs down x = 500 px from the top to
 * y = 600 px. Ana's hero stands west of it at (2, 10), centre (125, 475); the
 * goblin east of it at (11, 10), centre (575, 475), out of the hero's sight;
 * a chest at (10, 6), centre (525, 675), is in the hero's sight (the line
 * passes under the wall's end) but in the dark, and the goblin's torch would
 * light it. Bea's scout stands far off at (2, 1). An ogre sits east of the
 * wall at (18, 18), centre (925, 75), out of the hero's sight and beyond the
 * torch either way.
 */
const WALL = { id: randomUUID(), x1: 500, y1: 0, x2: 500, y2: 600, type: 'wall' };
const token = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id, characterId: null, name: id.split('-')[0], imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
  layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, ...extra,
});
let hero: string;
let goblin: string;
let chest: string;
let scout: string;
let ogre: string;
let mapId: string;

async function newMap(goblinExtra: Record<string, unknown> = {}): Promise<void> {
  hero = `hero-${randomUUID()}`;
  goblin = `goblin-${randomUUID()}`;
  chest = `chest-${randomUUID()}`;
  scout = `scout-${randomUUID()}`;
  ogre = `ogre-${randomUUID()}`;
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Dark', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, annotations: [], lightingEnabled: true, globalIllumination: false, fogEnabled: false,
      wallSegments: toJson([WALL]), lights: toJson([]),
      tokens: toJson([
        token(hero, 2, 10, { controlledBy: anaId }),
        token(goblin, 11, 10, goblinExtra),
        token(chest, 10, 6),
        token(scout, 2, 1, { controlledBy: beaId }),
        token(ogre, 18, 18),
      ]),
    },
  });
  mapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
}

const setLight = (socket: Socket, payload: unknown) => socket.timeout(5000).emitWithAck('token.light.set', payload);
const storedToken = async (id: string) => {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return (map.tokens as Array<Record<string, unknown>>).find((t) => t.id === id)!;
};

/** Every event `client` receives from now on, with its payload. */
function record(client: Socket): Array<[string, any]> {
  const seen: Array<[string, any]> = [];
  client.onAny((event: string, data: unknown) => seen.push([event, data]));
  return seen;
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 600));
const named = (seen: Array<[string, any]>, event: string) => seen.filter(([e]) => e === event).map(([, d]) => d);

beforeAll(async () => {
  const [g, a, b] = await Promise.all(['gm', 'ana', 'bea'].map((n) => createTestUser({ displayName: `Light ${n}` })));
  [gmId, anaId, beaId] = [g.id, a.id, b.id];
  campaignId = (await prisma.campaign.create({ data: { name: `Light ${runId}`, ownerId: gmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: anaId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: beaId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  anaAgent = request.agent(app);
  expect((await anaAgent.post('/api/auth/login').send({ email: a.email, password: TEST_PASSWORD })).status).toBe(200);
});

beforeEach(async () => {
  // The per-user ceilings, and the joins, start afresh.
  await new Promise((r) => setTimeout(r, 1100));
  gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  ana = await server.connectAndAuth(await server.loginAs(anaId), campaignId);
  bea = await server.connectAndAuth(await server.loginAs(beaId), campaignId);
  await new Promise((r) => setTimeout(r, 200));
});

afterEach(() => [gm, ana, bea].forEach((s) => s.disconnect()));

afterAll(async () => {
  await server?.close();
  await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, anaId, beaId] } } });
  await prisma.$disconnect();
});

describe('a goblin carrying a torch round a corner (Review Focus 1)', () => {
  it('never sends the player the goblin, but sends the lit ground and what it shows', async () => {
    await newMap();
    // In the dark the chest is not the player's to see.
    const before = await anaAgent.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
    expect(before.status).toBe(200);
    expect(before.body.map.tokens.map((t: { id: string }) => t.id)).toEqual([hero]);
    expect(before.body.map.tokenLights).toEqual([]);

    const seen = record(ana);
    const toGm = waitForEvent<any>(gm, 'token.light.updated');
    expect(await setLight(gm, { mapId, tokenId: goblin, light: TORCH })).toEqual({ ok: true });
    expect(await toGm).toEqual({ mapId, tokenId: goblin, light: TORCH });
    await settled();

    // One lit circle, at the goblin's centre, naming no token.
    const lit = named(seen, 'map.tokenLights');
    expect(lit).toEqual([{ mapId, tokenLights: [{ x: 575, y: 475, brightRadius: 4, dimRadius: 8, color: '#ffcc66' }] }]);
    // The chest the torch lights is sent; the goblin never is, nor its light.
    expect(named(seen, 'token:appeared').map((d) => d.token.id)).toEqual([chest]);
    expect(JSON.stringify(seen)).not.toContain(goblin);
    expect(named(seen, 'token.light.updated')).toEqual([]);

    // And the map fetch agrees.
    const after = await anaAgent.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
    expect(after.body.map.tokens.map((t: { id: string }) => t.id).sort()).toEqual([chest, hero].sort());
    expect(after.body.map.tokenLights).toEqual([{ x: 575, y: 475, brightRadius: 4, dimRadius: 8, color: '#ffcc66' }]);
    expect(JSON.stringify(after.body.map)).not.toContain(goblin);

    // The torch put out: the lit ground goes, and the chest with it.
    const dark = record(ana);
    expect(await setLight(gm, { mapId, tokenId: goblin, light: null })).toEqual({ ok: true });
    await settled();
    expect(named(dark, 'map.tokenLights')).toEqual([{ mapId, tokenLights: [] }]);
    expect(named(dark, 'token:disappeared').map((d) => d.tokenId)).toEqual([chest]);
    expect((await storedToken(goblin)).light).toBeNull();
  });

  it('counts no light from a goblin the GM keeps hidden', async () => {
    await newMap({ visible: false });
    const seen = record(ana);
    expect(await setLight(gm, { mapId, tokenId: goblin, light: TORCH })).toEqual({ ok: true });
    await settled();
    // The lit ground did not change, so the players are told nothing at all.
    expect(seen.filter(([e]) => e !== 'presence.update')).toEqual([]);
    expect((await storedToken(goblin)).light).toEqual(TORCH);
  });

  it('sends the lit ground again where the carrier is dropped', async () => {
    await newMap({ light: TORCH });
    const seen = record(ana);
    const moved = waitForEvent(gm, 'token.moved');
    gm.emit('token.move.end', { tokenId: goblin, mapId, x: 12, y: 10 });
    await moved;
    await settled();
    expect(named(seen, 'map.tokenLights')).toEqual([{ mapId, tokenLights: [{ x: 625, y: 475, brightRadius: 4, dimRadius: 8, color: '#ffcc66' }] }]);
    // Neither the goblin nor the ogre, which the player never saw, is named
    // to them in any event: not as a token, nor by id as gone.
    expect(JSON.stringify(seen)).not.toContain(goblin);
    expect(JSON.stringify(seen)).not.toContain(ogre);
    expect(JSON.stringify(seen)).not.toContain('"goblin"');
  });

  it('takes away what the carrier no longer lights, naming only that', async () => {
    await newMap({ light: TORCH });
    const seen = record(ana);
    const moved = waitForEvent(gm, 'token.moved');
    // Carried off north, the torch no longer reaches the chest.
    gm.emit('token.move.end', { tokenId: goblin, mapId, x: 12, y: 19 });
    await moved;
    await settled();
    expect(named(seen, 'token:disappeared').map((d) => d.tokenId)).toEqual([chest]);
    expect(named(seen, 'token:appeared')).toEqual([]);
    expect(JSON.stringify(seen)).not.toContain(goblin);
    expect(JSON.stringify(seen)).not.toContain(ogre);
  });

  it('sends the lit ground in order of place, not of the tokens', async () => {
    await newMap({ light: TORCH });
    const seen = record(ana);
    expect(await setLight(gm, { mapId, tokenId: chest, light: { ...TORCH, brightRadius: 1, dimRadius: 2 } })).toEqual({ ok: true });
    await settled();
    // The chest (x 525) comes before the goblin (x 575), though stored after it.
    expect(named(seen, 'map.tokenLights')[0].tokenLights.map((l: { x: number }) => l.x)).toEqual([525, 575]);
  });
});

describe('who may light a token (Review Focus 4)', () => {
  it("refuses a player another player's token or the GM's monster, and changes nothing", async () => {
    await newMap();
    const watching = [record(gm), record(ana), record(bea)];
    expect(await setLight(ana, { mapId, tokenId: scout, light: TORCH })).toEqual({ ok: false, error: NOT_YOURS });
    expect(await setLight(ana, { mapId, tokenId: goblin, light: TORCH })).toEqual({ ok: false, error: NOT_YOURS });
    // A token that is not there is answered the same way, so ids tell a player nothing.
    expect(await setLight(ana, { mapId, tokenId: 'nobody', light: TORCH })).toEqual({ ok: false, error: NOT_YOURS });
    // Refused before the light is looked at.
    expect(await setLight(ana, { mapId, tokenId: goblin, light: 'x' })).toEqual({ ok: false, error: NOT_YOURS });
    await settled();
    expect((await storedToken(scout)).light).toBeUndefined();
    expect((await storedToken(goblin)).light).toBeUndefined();
    for (const seen of watching) {
      expect(seen.filter(([e]) => ['map.tokenLights', 'token.light.updated', 'token:appeared'].includes(e))).toEqual([]);
    }
  });

  it("lets a player light their own token: the GM and they get the token's light, others only the lit ground", async () => {
    await newMap();
    const [toGm, toAna, toBea] = [record(gm), record(ana), record(bea)];
    // Whatever the client says of its source, a light set by hand is manual.
    expect(await setLight(ana, { mapId, tokenId: hero, light: { ...TORCH, source: 'item', itemId: 'torch-1' } })).toEqual({ ok: true });
    await settled();
    expect((await storedToken(hero)).light).toEqual(TORCH);
    expect(named(toGm, 'token.light.updated')).toEqual([{ mapId, tokenId: hero, light: TORCH }]);
    expect(named(toAna, 'token.light.updated')).toEqual([{ mapId, tokenId: hero, light: TORCH }]);
    expect(named(toBea, 'token.light.updated')).toEqual([]);
    const ground = { mapId, tokenLights: [{ x: 125, y: 475, brightRadius: 4, dimRadius: 8, color: '#ffcc66' }] };
    expect(named(toBea, 'map.tokenLights')).toEqual([ground]);
    expect(named(toAna, 'map.tokenLights')).toEqual([ground]);
    // Bea's scout now sees the lit hero, and is sent it, but not its light.
    const appeared = named(toBea, 'token:appeared');
    expect(appeared.map((d) => d.token.id)).toEqual([hero]);
    expect(appeared[0].token).not.toHaveProperty('light');
  });

  it('refuses a light that is not valid, and a payload that is not one', async () => {
    await newMap();
    for (const light of [
      { ...TORCH, brightRadius: 9 },
      { ...TORCH, dimRadius: 121, brightRadius: 1 },
      { ...TORCH, color: 'orange' },
      { ...TORCH, glow: true },
      [TORCH],
      'torch',
      undefined,
    ]) {
      expect(await setLight(ana, { mapId, tokenId: hero, light })).toEqual({ ok: false, error: BAD_LIGHT });
      expect(await setLight(gm, { mapId, tokenId: goblin, light })).toEqual({ ok: false, error: BAD_LIGHT });
    }
    expect(await setLight(ana, null)).toEqual({ ok: false, error: NOT_YOURS });
    expect(await setLight(ana, 'x')).toEqual({ ok: false, error: NOT_YOURS });
    expect((await setLight(gm, null) as any).ok).toBe(false);
    expect((await storedToken(hero)).light).toBeUndefined();
    expect((await storedToken(goblin)).light).toBeUndefined();
    await expectNoEvent(bea, 'map.tokenLights');
  });
});
