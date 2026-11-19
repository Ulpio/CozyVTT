/**
 * The GM's secret check: the server rolls one expression per character, stores
 * each as a secret DiceRoll and tells the GM alone. Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { GM_ONLY, NO_CHARACTER } from '../../services/gmNotice';

jest.setTimeout(30000);

let server: WsTestServer;
let gmId: string;
let coGmId: string;
let anaId: string;
let campaignId: string;
let anaChar: string;
let gmChar: string;
let gm: ClientSocket;
let coGm: ClientSocket;
let ana: ClientSocket;

const check = (socket: ClientSocket, payload: unknown) => socket.timeout(5000).emitWithAck('gm.secretCheck', payload);
const roll = (characterId: string, expression: string, extra: object = {}) => ({ characterId, expression, purpose: 'Percepção', characterName: 'Hero', ...extra });
const stored = () => prisma.diceRoll.count({ where: { campaignId } });

/** Every event of every name a socket receives, until stopped. */
function record(socket: ClientSocket): { events: string[] } {
  const seen = { events: [] as string[] };
  socket.onAny((name: string) => seen.events.push(name));
  return seen;
}

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const users = await Promise.all(['gm', 'cogm', 'ana'].map((n) => createTestUser({ email: `secret-${n}-${stamp}@test.cozyvtt.local`, displayName: `Secret ${n}` })));
  [gmId, coGmId, anaId] = users.map((u) => u.id);
  campaignId = (await createTestCampaign(gmId, { name: `Secret ${stamp}`, gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: coGmId, campaignId, role: 'GM', characterIds: [] },
      { userId: anaId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  anaChar = (await prisma.character.create({ data: { userId: anaId, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Ana hero', data: {} } })).id;
  gmChar = (await prisma.character.create({ data: { userId: gmId, campaignId, gameSystem: 'FIFTH_EDITION', name: 'GM npc', data: {} } })).id;
  server = await createWsTestServer();
});

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 1100));
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
  gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  coGm = await server.connectAndAuth(await server.loginAs(coGmId), campaignId);
  ana = await server.connectAndAuth(await server.loginAs(anaId), campaignId);
});

afterEach(() => [gm, coGm, ana].forEach((s) => s.disconnect()));

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([gmId, coGmId, anaId]);
  await prisma.$disconnect();
});

it('rolls every character, stores secret rows that match the ack, and tells the GMs but no player', async () => {
  const seen = record(ana);
  const toGm = waitForEvent<any>(gm, 'dice.rolled');
  const toCo = waitForEvent<any>(coGm, 'dice.rolled.secret');
  const ack: any = await check(gm, { rolls: [roll(anaChar, '1d20+5'), roll(gmChar, '1d20+2', { characterName: 'Npc' })] });
  expect(ack.ok).toBe(true);
  expect(ack.results).toHaveLength(2);
  const [first] = await Promise.all([toGm, toCo]);
  expect(first.secret).toBe(true);
  await new Promise((r) => setTimeout(r, 500));

  const rows = await prisma.diceRoll.findMany({ where: { campaignId }, orderBy: { rolledAt: 'asc' } });
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.secret && r.userId === gmId)).toBe(true);
  expect(rows.map((r) => r.expression).sort()).toEqual(['1d20+2', '1d20+5']);
  for (const result of ack.results) {
    expect(result.characterId === anaChar || result.characterId === gmChar).toBe(true);
    const row = rows.find((r) => r.expression === (result.characterId === anaChar ? '1d20+5' : '1d20+2'))!;
    expect(row.result).toBe(result.total);
    expect(result.dice).toHaveLength(1);
    expect(result.total).toBe(result.dice[0] + (result.characterId === anaChar ? 5 : 2));
    expect(typeof result.breakdown).toBe('string');
  }
  expect(seen.events.filter((e) => e !== 'presence.update' && e !== 'user.joined')).toEqual([]);
});

it('records zero events of any name on a player socket during the call', async () => {
  await new Promise((r) => setTimeout(r, 300)); // let the joins settle
  const seen = record(ana);
  expect((await check(gm, { rolls: [roll(anaChar, '1d20+5')] }) as any).ok).toBe(true);
  await new Promise((r) => setTimeout(r, 600));
  expect(seen.events).toEqual([]);
});

it('refuses a player with GM_ONLY before reading the payload', async () => {
  expect(await check(ana, { rolls: [roll(anaChar, '1d20')] })).toEqual({ ok: false, error: GM_ONLY });
  expect(await check(ana, null)).toEqual({ ok: false, error: GM_ONLY });
  expect(await check(ana, { rolls: 'x' })).toEqual({ ok: false, error: GM_ONLY });
  expect(await stored()).toBe(0);
});

it('refuses 0 rolls, 21 rolls and non-object payloads with clear text, storing nothing', async () => {
  let n = 0;
  for (const payload of [null, 5, 'x', {}, { rolls: 'x' }, { rolls: [] }, { rolls: Array.from({ length: 21 }, () => roll(anaChar, '1d20')) }]) {
    if (++n % 4 === 0) await new Promise((r) => setTimeout(r, 1100)); // the per-second ceiling
    const out: any = await check(gm, payload);
    expect(out.ok).toBe(false);
    expect(out.error).toBe('Escolha de 1 a 20 personagens.');
  }
  expect(await stored()).toBe(0);
});

it('accepts 20 rolls as one event', async () => {
  const out: any = await check(gm, { rolls: Array.from({ length: 20 }, () => roll(anaChar, '1d20+1')) });
  expect(out.ok).toBe(true);
  expect(out.results).toHaveLength(20);
  expect(await stored()).toBe(20);
});

it('refuses a bad expression or label and stores nothing, even when an earlier roll is good', async () => {
  const bad = [
    { rolls: [roll(anaChar, '1d20'), roll(gmChar, 'banana')] },
    { rolls: [roll(anaChar, '1d20'), roll(gmChar, 5 as any)] },
    { rolls: [roll(anaChar, '1d20'), roll(gmChar, '1d20', { purpose: 'x'.repeat(5000) })] },
    { rolls: [roll(anaChar, '1d20'), roll(gmChar, '1d20', { characterName: 7 })] },
    { rolls: [roll(anaChar, '1d20'), null] },
  ];
  for (const payload of bad) {
    const out: any = await check(gm, payload);
    expect(out.ok).toBe(false);
    expect(out.error).not.toMatch(/ZodError|Invalid input|expected/i);
  }
  expect(await stored()).toBe(0);
});

it('refuses a missing character or one of another campaign, rolling and storing nothing', async () => {
  const other = (await createTestCampaign(gmId, { name: 'Other secret campaign' })).id;
  const otherChar = (await prisma.character.create({ data: { userId: anaId, campaignId: other, gameSystem: 'FIFTH_EDITION', name: 'Elsewhere', data: {} } })).id;
  try {
    const seen = record(coGm);
    expect(await check(gm, { rolls: [roll(anaChar, '1d20'), roll(otherChar, '1d20')] })).toEqual({ ok: false, error: NO_CHARACTER });
    expect(await check(gm, { rolls: [roll('nope', '1d20')] })).toEqual({ ok: false, error: NO_CHARACTER });
    expect(await check(gm, { rolls: [{ expression: '1d20' }] })).toEqual({ ok: false, error: NO_CHARACTER });
    await new Promise((r) => setTimeout(r, 400));
    expect(seen.events.filter((e) => e.startsWith('dice.'))).toEqual([]);
    expect(await prisma.diceRoll.count({ where: { campaignId: { in: [campaignId, other] } } })).toBe(0);
  } finally {
    await cleanupCampaigns([other]);
  }
});
