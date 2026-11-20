/* eslint-disable @typescript-eslint/no-explicit-any -- socket acks, events and JSON sheets are read loosely */
/**
 * The P7 "done when" session (lighting ready to play), played end to end over
 * real sockets and a real database: a new map made in the app, the walls of a
 * small dungeon (a hall, a closed door, an east room), a campfire and a
 * brazier, "Escuro" on, a dwarf, a human and a halfling placed from sheets
 * with compendium races (skips when materiais/.compendio/data is absent), the
 * human taking a torch in hand and walking with it, and the GM opening the
 * door. Every event on every socket is recorded, and what each player is told
 * is asserted exactly, the ids of tokens they never see included. Requires
 * PostgreSQL at DATABASE_URL.
 *
 * The tests share one map and one table and are meant to run in order, each
 * starting from what the last left. The torch is put in the hand by calling
 * equipItem (the service the inventory socket event calls) directly, as the
 * human's player; the walk is the real token.move.end event on her socket.
 *
 * Pixels, top-down, 50 px squares on a 20 x 20 map:
 *   hall      x 50..800, y 50..450, the door on x = 800 between y 200 and 300
 *   east room x 800..950, y 50..450
 *   campfire  (150, 250) bright 3 / dim 5 squares, in the hall
 *   brazier   (875, 250) bright 2 / dim 4 squares, in the east room
 * Tokens (centre), the hall's dark ones all in the open, no wall between:
 *   dwarf (75, 225) 12 squares of sight, human (175, 275), both in the fire's light
 *   lurker (425, 75)                                        the hall's dark corner
 *   vigia7 (525, 275)  7 squares from the human, vigia9 (625, 275) 9 from her
 *   vigia11 (625, 225) 11 squares from the dwarf, vigia14 (775, 225) 14 from her
 *   ally (875, 275) lit by the brazier, ogre (925, 425) lit but walled off,
 *   both behind the door.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { equipItem } from '../../services/inventory';

jest.setTimeout(90000);

const DATA = resolve(__dirname, '../../../../materiais/.compendio/data/phb');
const rowsOf = (file: string): any[] => (existsSync(resolve(DATA, file)) ? JSON.parse(readFileSync(resolve(DATA, file), 'utf8')) : []);
const races = rowsOf('race.json').filter((e) => ['anao', 'humano', 'halfling'].includes(e.slug));
const torches = rowsOf('gear.json').filter((e) => e.slug === 'tocha');
const present = races.length === 3 && torches.length === 1;
if (!present) console.warn(`p7.integration: ${DATA} not found or incomplete (the compendium data is private); skipping the session.`);
const describeIf = present ? describe : describe.skip;

const BOOK = `p7-e2e-${randomUUID().slice(0, 8)}`;
const app = createTestApp();

let server: WsTestServer | undefined;
let gmId: string;
let anaId: string;
let beaId: string;
let campaignId: string | undefined;
let gmAgent: ReturnType<typeof request.agent>;
let anaAgent: ReturnType<typeof request.agent>;
let beaAgent: ReturnType<typeof request.agent>;
let gm: ClientSocket;
let ana: ClientSocket;
let bea: ClientSocket;
let mapId: string;

type Seen = { name: string; payload: any }[];
const seen: Record<'gm' | 'ana' | 'bea', Seen> = { gm: [], ana: [], bea: [] };
const recordAll = (socket: ClientSocket, into: Seen) => socket.onAny((name: string, payload: unknown) => into.push({ name, payload }));
/** A short quiet after the event waited for, so a stray extra one is caught by the exact counts. */
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const spacing = () => new Promise((r) => setTimeout(r, 1100)); // the per-second ceilings are per user
const emit = (socket: ClientSocket, event: string, payload: unknown) => socket.timeout(5000).emitWithAck(event, payload);
const named = (s: Seen, name: string) => s.filter((e) => e.name === name).map((e) => e.payload);
const clear = () => { seen.gm.length = seen.ana.length = seen.bea.length = 0; };

const ids: Record<string, string> = {};
const tokens: Record<string, any> = {};
const NAMES: Record<string, string> = {
  dwarf: 'Anã', human: 'Humana', halfling: 'Pé-Peludo', lurker: 'Espreitador', ogre: 'Ogro',
  vigia7: 'Vigia-7', vigia9: 'Vigia-9', vigia11: 'Vigia-11', vigia14: 'Vigia-14',
};
/** What a player's log must not hold for a token they never saw: its id, its name and its character's id. */
const leaks = (who: 'ana' | 'bea', key: string) => {
  const log = JSON.stringify(seen[who]);
  expect([key, log.includes(tokens[key].id), log.includes(NAMES[key]), tokens[key].characterId ? log.includes(tokens[key].characterId) : false]).toEqual([key, false, false, false]);
};
const ref = (slug: string) => ({ bookId: BOOK, slug });
const sheet = (race: string, inventory: unknown[] = []) => ({
  characterName: 'Hero', class: 'Guerreiro', level: 1, race: 'Raça', proficiencyBonus: 2, armorClass: 10, inventory,
  origin: { race: ref(race) },
  stats: Object.fromEntries(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map((a) => [a, { score: 10, modifier: 0 }])),
});
const wall = (x1: number, y1: number, x2: number, y2: number, type = 'wall') => ({ id: randomUUID(), x1, y1, x2, y2, type });
const DOOR = wall(800, 200, 800, 300, 'door-closed');
const WALLS = [
  wall(50, 50, 800, 50), wall(50, 450, 800, 450), wall(50, 50, 50, 450),
  wall(800, 50, 800, 200), DOOR, wall(800, 300, 800, 450),
  wall(800, 50, 950, 50), wall(800, 450, 950, 450), wall(950, 50, 950, 450),
];
const FIRE = { id: randomUUID(), x: 150, y: 250, brightRadius: 3, dimRadius: 5, color: '#ff9944', enabled: true };
const BRAZIER = { id: randomUUID(), x: 875, y: 250, brightRadius: 2, dimRadius: 4, color: '#ff7733', enabled: true };

/** A token's grid cell: x from the left, y from the BOTTOM (so the row `i` from the top is 19 - i). */
const place = async (key: string, x: number, y: number, extra: Record<string, unknown>) => {
  const res = await gmAgent.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({
    name: NAMES[key], imageUrl: '', position: { x, y }, size: { width: 1, height: 1 }, layer: 'token', ...extra,
  });
  expect(res.status).toBe(201);
  tokens[key] = res.body.token;
  return res.body.token as any;
};
const tokenIdsFor = async (agent: typeof anaAgent) => {
  const res = await agent.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
  expect(res.status).toBe(200);
  return { tokens: res.body.map.tokens.map((t: any) => t.id).sort() as string[], lights: res.body.map.tokenLights as any[] };
};
const idsOf = (...keys: string[]) => keys.map((k) => tokens[k].id).sort();
const appeared = (s: Seen) => named(s, 'token:appeared').map((d) => d.token.id).sort();
const disappeared = (s: Seen) => named(s, 'token:disappeared').map((d) => d.tokenId).sort();

beforeAll(async () => {
  if (!present) return;
  const stamp = randomUUID().slice(0, 8);
  const users = await Promise.all(['gm', 'ana', 'bea'].map((n) => createTestUser({ email: `p7-${n}-${stamp}@test.cozyvtt.local`, displayName: `P7 ${n}` })));
  [gmId, anaId, beaId] = users.map((u) => u.id);
  campaignId = (await createTestCampaign(gmId, { name: `P7 ${stamp}`, gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: anaId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: beaId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P7 e2e book', gameSystem: 'FIFTH_EDITION' } });
  await prisma.compendiumEntry.createMany({
    data: [...races, ...torches].map((e) => ({ bookId: BOOK, type: e.type, slug: e.slug, name: e.name, search: String(e.name).toLowerCase(), text: '', data: e.data as object })),
    skipDuplicates: true,
  });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  const make = async (key: string, userId: string, name: string, data: unknown) => {
    ids[key] = (await prisma.character.create({ data: { userId, campaignId: campaignId!, gameSystem: 'FIFTH_EDITION', name, data: data as object } })).id;
  };
  await make('dwarf', anaId, 'Anã', sheet('anao'));
  await make('human', beaId, 'Humana', sheet('humano', [{ id: 'torch', name: 'Tocha', quantity: 1, compendiumRef: ref('tocha') }]));
  await make('halfling', gmId, 'Pé-Peludo', sheet('halfling'));
  const login = async (user: { email: string }) => {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
    return agent;
  };
  [gmAgent, anaAgent, beaAgent] = [await login(users[0]), await login(users[1]), await login(users[2])];
  server = await createWsTestServer();
  await spacing();
  gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  ana = await server.connectAndAuth(await server.loginAs(anaId), campaignId);
  bea = await server.connectAndAuth(await server.loginAs(beaId), campaignId);
  recordAll(gm, seen.gm);
  recordAll(ana, seen.ana);
  recordAll(bea, seen.bea);
  await settle(300);
});

afterAll(async () => {
  [gm, ana, bea].forEach((s) => s?.disconnect());
  await server?.close();
  if (campaignId) {
    await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentMapId: null } });
    await prisma.map.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
  }
  await prisma.compendiumBook.deleteMany({ where: { id: BOOK } });
  await cleanupUsers([gmId, anaId, beaId].filter(Boolean));
  await prisma.$disconnect();
});

describeIf('the P7 done-when session, in order', () => {
  it('1. a new map starts ready for lighting, and the GM draws the dungeon, a campfire and a brazier', async () => {
    const made = await gmAgent.post(`/api/campaigns/${campaignId}/maps`).send({ name: 'Masmorra', imageUrl: `/api/assets/maps/${randomUUID()}`, width: 20, height: 20, gridSize: 50 });
    expect(made.status).toBe(201);
    mapId = made.body.map.id;
    // Ready to play at once: walls and lights work, fog and memory are on, and all in sight is lit.
    expect(made.body.map).toMatchObject({ lightingEnabled: true, fogEnabled: true, globalIllumination: true, explorationEnabled: true });
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });

    clear();
    await spacing();
    for (const segment of WALLS) expect(await emit(gm, 'wall:add', { mapId, segment })).toEqual({ ok: true });
    expect(await emit(gm, 'light:add', { mapId, light: FIRE })).toEqual({ ok: true });
    expect(await emit(gm, 'light:add', { mapId, light: BRAZIER })).toEqual({ ok: true });
    await settle();

    const stored = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
    expect((stored.wallSegments as any[]).map((w) => w.id).sort()).toEqual(WALLS.map((w) => w.id).sort());
    expect((stored.lights as any[]).map((l) => l.id).sort()).toEqual([FIRE.id, BRAZIER.id].sort());
    // Every member is told of every wall and light as it is drawn, and one door is there, closed.
    for (const who of ['gm', 'ana', 'bea'] as const) {
      expect(named(seen[who], 'wall:added')).toHaveLength(WALLS.length);
      expect(named(seen[who], 'light:added')).toHaveLength(2);
    }
    expect(named(seen.ana, 'wall:added').filter((d) => d.segment.type === 'door-closed').map((d) => d.segment.id)).toEqual([DOOR.id]);
  });

  it('2. "Escuro" on: every member is told, and nothing is placed yet to be seen', async () => {
    clear();
    const told = [gm, ana, bea].map((s) => waitForEvent(s, 'map:settings:updated'));
    const res = await gmAgent.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ globalIllumination: false });
    expect(res.status).toBe(200);
    expect(res.body.map).toMatchObject({ globalIllumination: false, lightingEnabled: true });
    await Promise.all(told);
    await settle();
    expect((await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).globalIllumination).toBe(false);
    for (const who of ['gm', 'ana', 'bea'] as const) {
      expect(named(seen[who], 'map:settings:updated')).toEqual([{ mapId, lightingEnabled: true, fogEnabled: true, globalIllumination: false, explorationEnabled: true }]);
    }
    expect(named(seen.ana, 'map.tokenLights')).toEqual([]);
    expect(named(seen.ana, 'token:appeared')).toEqual([]);
    expect((await tokenIdsFor(anaAgent)).tokens).toEqual([]);
    expect((await tokenIdsFor(beaAgent)).tokens).toEqual([]);
  });

  it('3. the dwarf is placed with 12 squares of sight alone, the human with 0; the GM touches nothing', async () => {
    clear();
    const dwarf = await place('dwarf', 1, 15, { characterId: ids.dwarf, type: 'player', controlledBy: anaId });
    const human = await place('human', 3, 14, { characterId: ids.human, type: 'player', controlledBy: beaId });
    const halfling = await place('halfling', 17, 14, { characterId: ids.halfling, type: 'npc' });
    await place('lurker', 8, 18, { type: 'npc' });
    await place('vigia7', 10, 14, { type: 'npc' });
    await place('vigia9', 12, 14, { type: 'npc' });
    await place('vigia11', 12, 15, { type: 'npc' });
    await place('vigia14', 15, 15, { type: 'npc' });
    await place('ogre', 18, 11, { type: 'npc' });
    expect(dwarf.sightRadius).toBe(12);
    expect(human.sightRadius).toBe(0);
    expect(halfling.sightRadius).toBe(0);
    expect(human.light ?? null).toBeNull();
    await settle();
    const stored = (await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).tokens as any[];
    expect(stored.find((t) => t.id === dwarf.id).sightRadius).toBe(12);
    expect(stored.find((t) => t.id === dwarf.id).sightRadiusManual).toBeFalsy();
    expect(stored.find((t) => t.id === human.id).sightRadius).toBe(0);
  });

  it('4. in the dark the dwarf sees 11 squares and not 14, and the human only the lit room', async () => {
    // The dwarf: herself, the lit human, and the dark ones in the open within
    // her 600 px (the lurker 7.6 squares off, the vigias 7 to 11 squares off
    // along the hall); not the one 14 squares away, nor anything behind the door.
    const forAna = await tokenIdsFor(anaAgent);
    expect(forAna.tokens).toEqual(idsOf('dwarf', 'human', 'lurker', 'vigia7', 'vigia9', 'vigia11'));
    // The human: herself and the dwarf, standing in the campfire's light. None of the dark ones.
    const forBea = await tokenIdsFor(beaAgent);
    expect(forBea.tokens).toEqual(idsOf('dwarf', 'human'));
    // No token carries a light yet, so no lit ground is sent.
    expect(forAna.lights).toEqual([]);
    expect(forBea.lights).toEqual([]);
    // Nothing she never saw was named to either player, by id, name or character.
    for (const key of ['ogre', 'halfling', 'vigia14']) leaks('ana', key);
    for (const key of ['ogre', 'halfling', 'lurker', 'vigia7', 'vigia9', 'vigia11', 'vigia14']) leaks('bea', key);
    // The GM is sent everything.
    const all = (await gmAgent.get(`/api/campaigns/${campaignId}/maps/${mapId}`)).body.map.tokens.map((t: any) => t.id).sort();
    expect(all).toEqual(idsOf(...Object.keys(NAMES)));
  });

  it('5. the human puts the torch in her hand: her token lights 4/8 from the item and her sight grows, but only 8 squares', async () => {
    clear();
    const told = [gm, ana, bea].map((s) => waitForEvent(s, 'map.tokenLights'));
    const out = await equipItem(campaignId!, { role: 'PLAYER', userId: beaId }, ids.human, 'torch', 'main');
    expect(out.ok).toBe(true);
    await Promise.all(told);
    await settle();

    const light = { brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'item', itemId: 'torch' };
    const stored = (await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).tokens as any[];
    expect(stored.find((t) => t.id === tokens.human.id).light).toEqual(light);
    // The ground the torch lights: one circle at her centre (175, 275), no token id.
    const ground = { mapId, tokenLights: [{ x: 175, y: 275, brightRadius: 4, dimRadius: 8, color: '#ffcc66' }] };
    for (const who of ['gm', 'ana', 'bea'] as const) expect(named(seen[who], 'map.tokenLights')).toEqual([ground]);
    // Her token's light to the GM and to her alone.
    expect(named(seen.gm, 'token.light.updated')).toEqual([{ mapId, tokenId: tokens.human.id, light }]);
    expect(named(seen.bea, 'token.light.updated')).toEqual([{ mapId, tokenId: tokens.human.id, light }]);
    expect(named(seen.ana, 'token.light.updated')).toEqual([]);
    // Her sight grows by what is inside the torch's 8 squares (400 px): the
    // lurker (320 px) and vigia7 (350 px). vigia9, 450 px off, stays in the dark.
    expect(appeared(seen.bea)).toEqual(idsOf('lurker', 'vigia7'));
    expect(disappeared(seen.bea)).toEqual([]);
    expect(appeared(seen.ana)).toEqual([]);
    expect(disappeared(seen.ana)).toEqual([]);
    expect((await tokenIdsFor(beaAgent)).tokens).toEqual(idsOf('dwarf', 'human', 'lurker', 'vigia7'));
    expect((await tokenIdsFor(anaAgent)).tokens).toEqual(idsOf('dwarf', 'human', 'lurker', 'vigia7', 'vigia9', 'vigia11'));
    // The light itself is not a thing the dwarf's player is told of.
    expect(JSON.stringify(seen.ana)).not.toContain('"itemId"');
    for (const key of ['ogre', 'halfling', 'vigia14']) leaks('ana', key);
    for (const key of ['ogre', 'halfling', 'vigia9', 'vigia11', 'vigia14']) leaks('bea', key);
  });

  it('6. the light walks with her: dropped 6 squares on, the lit ground follows and her sight with it', async () => {
    clear();
    await spacing();
    const moved = waitForEvent(bea, 'token.moved');
    bea.emit('token.move.end', { tokenId: tokens.human.id, mapId, x: 9, y: 14 });
    await moved;
    await settle(800);

    // Her centre is now (475, 275); the light is the same, and the ground is
    // one circle there, to the GM and both players, naming no token.
    const stored = (await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).tokens as any[];
    expect(stored.find((t) => t.id === tokens.human.id)).toMatchObject({ position: { x: 9, y: 14 }, light: { brightRadius: 4, dimRadius: 8, source: 'item' } });
    const ground = { mapId, tokenLights: [{ x: 475, y: 275, brightRadius: 4, dimRadius: 8, color: '#ffcc66' }] };
    for (const who of ['gm', 'ana', 'bea'] as const) expect(named(seen[who], 'map.tokenLights')).toEqual([ground]);
    // Her own move re-sends all she sees (the page keeps one of each): her own token as it moved, and
    // the hall, all of it now within her 400 px, so vigia9, vigia11 and vigia14 are new to her. Nothing
    // is named as gone, and the ogre and the ally, never hers to see, are not named at all.
    expect(appeared(seen.bea)).toEqual(idsOf('dwarf', 'human', 'lurker', 'vigia7', 'vigia9', 'vigia11', 'vigia14'));
    expect(disappeared(seen.bea)).toEqual([]);
    expect((await tokenIdsFor(beaAgent)).tokens).toEqual(idsOf('dwarf', 'human', 'lurker', 'vigia7', 'vigia9', 'vigia11', 'vigia14'));
    // Her torch now lights vigia14 for the dwarf's player too, who could not make it out at 14 squares.
    expect(appeared(seen.ana)).toEqual(idsOf('human', 'vigia14'));
    expect(disappeared(seen.ana)).toEqual([]);
    expect((await tokenIdsFor(anaAgent)).tokens).toEqual(idsOf('dwarf', 'human', 'lurker', 'vigia7', 'vigia9', 'vigia11', 'vigia14'));
    for (const key of ['ogre', 'halfling']) { leaks('ana', key); leaks('bea', key); }
  });

  it('7. behind the closed door no token reaches either player until the GM opens it', async () => {
    // Nothing the players have been sent names what is behind the door, and
    // the map they would fetch holds none of it.
    for (const key of ['ogre', 'halfling']) { leaks('ana', key); leaks('bea', key); }
    for (const agent of [anaAgent, beaAgent]) {
      const { tokens: shown } = await tokenIdsFor(agent);
      expect(shown).not.toContain(tokens.ogre.id);
      expect(shown).not.toContain(tokens.halfling.id);
    }

    clear();
    await spacing();
    const told = [ana, bea].map((s) => waitForEvent(s, 'map.changed'));
    gm.emit('wall:update', { mapId, segment: { ...DOOR, type: 'door-open' } });
    await Promise.all(told);
    await settle(600);

    // Each player is told the door opened, and sent the map as they now see
    // it: the ally in the brazier's light, through the door, to both; never
    // the ogre, lit as it is, for the wall's corner keeps it from their eyes.
    const hall = idsOf('dwarf', 'human', 'halfling', 'lurker', 'vigia7', 'vigia9', 'vigia11', 'vigia14');
    for (const who of ['ana', 'bea'] as const) {
      expect(named(seen[who], 'wall:updated').map((d) => [d.segment.id, d.segment.type])).toEqual([[DOOR.id, 'door-open']]);
      const changed = named(seen[who], 'map.changed');
      expect(changed).toHaveLength(1);
      expect(changed[0].mapId).toBe(mapId);
      expect(changed[0].mapData.tokens.map((t: any) => t.id).sort()).toEqual(hall);
      leaks(who, 'ogre');
    }
    expect((await tokenIdsFor(anaAgent)).tokens).toEqual(hall);
    expect((await tokenIdsFor(beaAgent)).tokens).toEqual(hall);
    expect(named(seen.gm, 'map.changed')).toEqual([]);

    // Closed again, they lose it again, and the ogre is never named.
    clear();
    await spacing();
    const again = [ana, bea].map((s) => waitForEvent(s, 'map.changed'));
    gm.emit('wall:update', { mapId, segment: { ...DOOR, type: 'door-closed' } });
    await Promise.all(again);
    await settle(600);
    for (const who of ['ana', 'bea'] as const) {
      const changed = named(seen[who], 'map.changed');
      expect(changed).toHaveLength(1);
      expect(changed[0].mapData.tokens.map((t: any) => t.id).sort()).toEqual(idsOf('dwarf', 'human', 'lurker', 'vigia7', 'vigia9', 'vigia11', 'vigia14'));
      leaks(who, 'ogre');
      leaks(who, 'halfling');
    }
  });
});
