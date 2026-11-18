/**
 * The combat order, the turn and each combatant's spending live in the
 * database, and a player is sent only the spending of what they control.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import {
  clearState,
  flushCombatWrites,
  freshSpend,
  getState,
  hydrateCombatStates,
  setState,
  withCombatLock,
  forgetCombatMemory,
  type TurnSpend,
} from '../initiativeState';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let gmId: string;
let p1Id: string;
let p2Id: string;
let campaignId: string;
let mapId: string;
let gmCookie: string;
let p1Cookie: string;

const HERO = 'hero', ALLY = 'ally', GOBLIN = 'goblin';
type Sent = { active: boolean; round: number; currentTokenId: string | null; spend: Record<string, TurnSpend> };

beforeAll(async () => {
  const [gm, p1, p2] = await Promise.all(
    ['dm', 'p1', 'p2'].map((n) =>
      prisma.user.create({ data: { email: `combat-${n}-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: n } })
    )
  );
  gmId = gm.id; p1Id = p1.id; p2Id = p2.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Combat ${runId}`, ownerId: gmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', rotation: 0, conditions: [], metadata: {}, visible: true };
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Combat Map', imageUrl: '/x', baseLayerUrl: '/x', width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: [
        { ...base, id: HERO, name: 'Hero', position: { x: 1, y: 1 }, controlledBy: p1Id },
        { ...base, id: ALLY, name: 'Ally', position: { x: 2, y: 2 }, controlledBy: p2Id },
        { ...base, id: GOBLIN, name: 'Goblin', position: { x: 3, y: 3 }, controlledBy: null },
      ],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  [gmCookie, p1Cookie] = await Promise.all([server.loginAs(gmId), server.loginAs(p1Id)]);
});

afterAll(async () => {
  clearState(campaignId);
  await flushCombatWrites(campaignId);
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, p1Id, p2Id] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  clearState(campaignId);
  await flushCombatWrites(campaignId);
});

const row = () => prisma.combatState.findUnique({ where: { campaignId } });

async function startFight(order: string[], gm: Awaited<ReturnType<WsTestServer['connectAndAuth']>>) {
  for (const tokenId of order) {
    const done = waitForEvent(gm, 'initiative.state');
    gm.emit('initiative.add', { tokenId, mapId });
    await done;
  }
  const started = waitForEvent<Sent>(gm, 'initiative.state');
  gm.emit('initiative.start');
  return started;
}

describe('combat state in the database', () => {
  it('keeps a row from the start, survives a restart and is gone when the fight ends', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    await startFight([HERO, ALLY], gm);
    await flushCombatWrites(campaignId);
    expect(await row()).not.toBeNull();
    expect(getState(campaignId).spend[HERO]).toEqual(freshSpend());

    const state = getState(campaignId);
    state.spend[HERO].action = true;
    setState(campaignId, state);
    await flushCombatWrites(campaignId);

    forgetCombatMemory();
    expect(getState(campaignId).active).toBe(false);
    await hydrateCombatStates();
    const back = getState(campaignId);
    expect(back.round).toBe(1);
    expect(back.currentTokenId).toBe(HERO);
    expect(back.spend[HERO].action).toBe(true);

    const ended = waitForEvent(gm, 'initiative.state');
    gm.emit('initiative.end');
    await ended;
    await flushCombatWrites(campaignId);
    expect(await row()).toBeNull();
    gm.disconnect();
  });

  it('resets the new current combatant on next and clears every once-per-turn mark', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    await startFight([HERO, ALLY], gm);
    const state = getState(campaignId);
    state.spend[HERO].oncePerTurn = ['sneak'];
    state.spend[ALLY] = { ...freshSpend(), action: true, bonus: true, movedFeet: 20, oncePerTurn: ['x'], overBudgetWarned: true };
    setState(campaignId, state);

    const moved = waitForEvent(gm, 'initiative.state');
    gm.emit('initiative.next');
    await moved;
    const after = getState(campaignId);
    expect(after.currentTokenId).toBe(ALLY);
    expect(after.spend[ALLY]).toEqual(freshSpend());
    expect(after.spend[HERO].oncePerTurn).toEqual([]);
    gm.disconnect();
  });

  it('gives a combatant added mid-fight a fresh record and a removed current one passes the turn fresh', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    await startFight([HERO, ALLY], gm);
    const added = waitForEvent(gm, 'initiative.state');
    gm.emit('initiative.add', { tokenId: GOBLIN, mapId });
    await added;
    expect(getState(campaignId).spend[GOBLIN]).toEqual(freshSpend());

    const state = getState(campaignId);
    state.spend[ALLY].action = true;
    setState(campaignId, state);
    const removed = waitForEvent(gm, 'initiative.state');
    gm.emit('initiative.remove', { tokenId: HERO });
    await removed;
    const after = getState(campaignId);
    expect(after.currentTokenId).not.toBe(HERO);
    expect(after.spend[HERO]).toBeUndefined();
    expect(after.spend[after.currentTokenId as string]).toEqual(freshSpend());
    gm.disconnect();
  });

  it('sends a player the spending of their own combatants only, and the GM all of it', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    await startFight([GOBLIN, HERO, ALLY], gm);
    const state = getState(campaignId);
    state.spend[HERO].action = true;
    setState(campaignId, state);

    const forPlayer = waitForEvent<Sent>(p1, 'initiative.state');
    const forGm = waitForEvent<Sent>(gm, 'initiative.state');
    gm.emit('initiative.next');
    const [seenByPlayer, seenByGm] = await Promise.all([forPlayer, forGm]);
    expect(seenByGm.currentTokenId).toBe(HERO);
    expect(Object.keys(seenByGm.spend).sort()).toEqual([ALLY, GOBLIN, HERO]);
    expect(Object.keys(seenByPlayer.spend)).toEqual([HERO]);
    gm.disconnect();
    p1.disconnect();
  });

  it('refuses combat.restore from a player and resets the part for the GM', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    await startFight([HERO, ALLY], gm);
    const state = getState(campaignId);
    state.spend[HERO] = { ...freshSpend(), action: true, bonus: true, reaction: true, movedFeet: 15, attacksLeft: 0 };
    setState(campaignId, state);

    const refused = waitForEvent(p1, 'error');
    p1.emit('combat.restore', { tokenId: HERO, what: 'action' });
    await refused;
    expect(getState(campaignId).spend[HERO].action).toBe(true);

    for (const what of ['action', 'bonus', 'reaction', 'movement', 'attack'] as const) {
      const done = waitForEvent(gm, 'initiative.state');
      gm.emit('combat.restore', { tokenId: HERO, what });
      await done;
    }
    const spent = getState(campaignId).spend[HERO];
    expect(spent).toMatchObject({ action: false, bonus: false, reaction: false, movedFeet: 0, dashes: 0, attacksLeft: 1 });
    gm.disconnect();
    p1.disconnect();
  });

  it('gives back the Attack action with the action', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    await startFight([HERO, ALLY], gm);
    const state = getState(campaignId);
    state.spend[HERO] = { ...freshSpend(), action: true, attackActionTaken: true, attacksLeft: 1 };
    setState(campaignId, state);

    const done = waitForEvent(gm, 'initiative.state');
    gm.emit('combat.restore', { tokenId: HERO, what: 'action' });
    await done;
    expect(getState(campaignId).spend[HERO]).toMatchObject({ action: false, attackActionTaken: false, attacksLeft: 0 });
    gm.disconnect();
  });

  it('serialises withCombatLock callers in the order they came', async () => {
    const seen: number[] = [];
    await Promise.all([
      withCombatLock(campaignId, async () => { await new Promise((r) => setTimeout(r, 30)); seen.push(1); }),
      withCombatLock(campaignId, () => { seen.push(2); }),
    ]);
    expect(seen).toEqual([1, 2]);
  });
});
