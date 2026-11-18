/**
 * Counting the metres the combatant whose turn it is walks. A walk adds to
 * `movedFeet`; going over the turn's budget whispers the GM once, and never
 * blocks. Nobody else's walking counts. Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { clearState, getState, setState, freshSpend, type CombatantEntry } from '../initiativeState';

jest.setTimeout(30000);

const app = createTestApp();

const token = (over: Record<string, unknown>): any => ({
  imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, ...over,
});

let server: WsTestServer;
let gmId: string, gmEmail: string, p1Id: string, p2Id: string;
let campaignId: string, mapId: string, fighterCharId: string;
let gmCookie: string, p1Cookie: string, p2Cookie: string;
const open: ClientSocket[] = [];

const freshTokens = () => [
  token({ id: 'fighter', name: 'Guerreira', position: { x: 10, y: 10 }, characterId: fighterCharId, controlledBy: p1Id, type: 'player' }),
  token({ id: 'cleric', name: 'Clerigo', position: { x: 10, y: 20 }, controlledBy: p2Id, type: 'player' }),
];

const entry = (tokenId: string, name: string): CombatantEntry => ({
  tokenId, mapId, name, imageUrl: '', initiative: 10, hp: null, type: 'player', disposition: null, characterId: null,
});

function startCombat(current: string | null = 'fighter') {
  setState(campaignId, {
    active: true, round: 1, currentTokenId: current,
    combatants: [entry('fighter', 'Guerreira'), entry('cleric', 'Clerigo')],
    spend: { fighter: freshSpend(), cleric: freshSpend() },
  });
}

async function connect(cookie: string) {
  const s = await server.connectAndAuth(cookie, campaignId);
  open.push(s);
  return s;
}

/** The walked feet once they have been counted (the count runs after the move is announced). */
async function movedFeetOf(tokenId: string, atLeast: number): Promise<number> {
  for (let i = 0; i < 40; i++) {
    const moved = getState(campaignId).spend[tokenId]?.movedFeet ?? 0;
    if (moved >= atLeast) return moved;
    await new Promise((r) => setTimeout(r, 50));
  }
  return getState(campaignId).spend[tokenId]?.movedFeet ?? 0;
}

async function walk(who: ClientSocket, tokenId: string, x: number, y: number) {
  const moved = waitForEvent(who, 'token.moved');
  who.emit('token.move.end', { tokenId, mapId, x, y });
  await moved;
}

const settle = () => new Promise((r) => setTimeout(r, 400));

beforeAll(async () => {
  const [gm, p1, p2] = await Promise.all(['GM', 'P1', 'P2'].map((n) => createTestUser({ displayName: `Move ${n}` })));
  gmId = gm.id; gmEmail = gm.email; p1Id = p1.id; p2Id = p2.id;
  campaignId = (await createTestCampaign(gmId, { name: 'Move', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  fighterCharId = (await prisma.character.create({
    data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Guerreira', data: { speed: 30 } },
  })).id;
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: 100, gridSize: 50, feetPerSquare: 5, diagonalRule: 'flat', annotations: [],
      tokens: freshTokens(),
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  [gmCookie, p1Cookie, p2Cookie] = await Promise.all([gmId, p1Id, p2Id].map((id) => server.loginAs(id)));
});

afterEach(async () => {
  while (open.length) open.pop()!.close();
  clearState(campaignId);
  await prisma.message.deleteMany({ where: { campaignId } });
  await prisma.map.update({ where: { id: mapId }, data: { tokens: freshTokens() } });
});

afterAll(async () => {
  await server?.close();
  clearState(campaignId);
  await prisma.message.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([gmId, p1Id, p2Id]);
  await prisma.$disconnect();
});

describe('counting a walk on the combatant\'s turn', () => {
  it('adds each walk, whispers the GM once on going over, and never blocks', async () => {
    startCombat();
    const gm = await connect(gmCookie);
    const p1 = await connect(p1Cookie);
    const p2 = await connect(p2Cookie);

    await walk(p1, 'fighter', 13, 10);
    expect(await movedFeetOf('fighter', 15)).toBe(15);
    expect(getState(campaignId).spend.fighter.overBudgetWarned).toBe(false);

    const toGm = waitForEvent<any>(gm, 'chat.message');
    const noP1 = expectNoEvent(p1, 'chat.message', 1000);
    const noP2 = expectNoEvent(p2, 'chat.message', 1000);
    await walk(p1, 'fighter', 17, 10);
    expect(await movedFeetOf('fighter', 35)).toBe(35);
    const whisper = await toGm;
    expect(whisper.type).toBe('WHISPER');
    expect(whisper.content).toBe('Guerreira andou 10,5 m de 9 m neste turno.');
    await Promise.all([noP1, noP2]);
    expect(getState(campaignId).spend.fighter.overBudgetWarned).toBe(true);

    // The move stands, and a further one is counted without a second whisper.
    const noSecond = expectNoEvent(gm, 'chat.message', 1000);
    await walk(p1, 'fighter', 20, 10);
    expect(await movedFeetOf('fighter', 50)).toBe(50);
    await noSecond;
    expect(await prisma.message.count({ where: { campaignId, type: 'WHISPER' } })).toBe(1);
    const stored = (await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).tokens as any[];
    expect(stored.find((t) => t.id === 'fighter').position).toEqual({ x: 20, y: 10 });
  });

  it('tells the GM the new count in the order', async () => {
    startCombat();
    const gm = await connect(gmCookie);
    const p1 = await connect(p1Cookie);
    const state = waitForEvent<any>(gm, 'initiative.state');
    await walk(p1, 'fighter', 12, 10);
    expect((await state).spend.fighter.movedFeet).toBe(10);
  });

  it('counts nothing for a combatant whose turn it is not', async () => {
    startCombat('cleric');
    const p1 = await connect(p1Cookie);
    await walk(p1, 'fighter', 13, 10);
    await settle();
    expect(getState(campaignId).spend.fighter.movedFeet).toBe(0);
  });

  it('counts nothing when no fight is on', async () => {
    const p1 = await connect(p1Cookie);
    await walk(p1, 'fighter', 13, 10);
    await settle();
    expect(getState(campaignId).spend.fighter).toBeUndefined();
  });

  it('counts a move made through the token update route too', async () => {
    startCombat();
    const gm = request.agent(app);
    expect((await gm.post('/api/auth/login').send({ email: gmEmail, password: TEST_PASSWORD })).status).toBe(200);
    const res = await gm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/fighter`).send({ position: { x: 10, y: 14 } });
    expect(res.status).toBe(200);
    expect(await movedFeetOf('fighter', 20)).toBe(20);
  });
});
