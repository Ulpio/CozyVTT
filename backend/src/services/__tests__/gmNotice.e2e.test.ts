/**
 * The GM's private notice: a WHISPER from the GM to a character's owner,
 * carried with `metadata.kind = 'gmNotice'`, sent only to the owner's and the
 * GMs' sockets and kept out of everyone else's history. Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { GM_ONLY, NOTICE_LENGTH, NO_PLAYER, NO_CHARACTER, noticeRecipient } from '../gmNotice';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let gmId: string;
let anaId: string;
let brunoId: string;
let goneId: string;
let campaignId: string;
let anaCharId: string;
let gmCharId: string;
let goneCharId: string;
let gm: ClientSocket;
let ana: ClientSocket;
let bruno: ClientSocket;
const emails: Record<string, string> = {};

const notice = (socket: ClientSocket, characterId: string, text: string) =>
  socket.timeout(5000).emitWithAck('gm.notice', { characterId, text });
const character = (userId: string, name: string) =>
  prisma.character.create({ data: { userId, campaignId, gameSystem: 'FIFTH_EDITION', name, data: {} } }).then((c) => c.id);

async function history(userId: string): Promise<any[]> {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: emails[userId], password: TEST_PASSWORD })).status).toBe(200);
  const res = await agent.get(`/api/campaigns/${campaignId}/messages`);
  expect(res.status).toBe(200);
  return res.body.messages ?? res.body.data?.messages ?? [];
}

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const users = await Promise.all(['gm', 'ana', 'bruno', 'gone'].map((n) => createTestUser({ email: `notice-${n}-${stamp}@test.cozyvtt.local`, displayName: `Notice ${n}` })));
  [gmId, anaId, brunoId, goneId] = users.map((u) => u.id);
  users.forEach((u) => { emails[u.id] = u.email; });
  campaignId = (await createTestCampaign(gmId, { name: `Notice ${stamp}`, gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: anaId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: brunoId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  anaCharId = await character(anaId, 'Ana hero');
  gmCharId = await character(gmId, 'GM npc');
  goneCharId = await character(goneId, 'Gone hero');
  server = await createWsTestServer();
});

beforeEach(async () => {
  await prisma.message.deleteMany({ where: { campaignId } });
  gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  ana = await server.connectAndAuth(await server.loginAs(anaId), campaignId);
  bruno = await server.connectAndAuth(await server.loginAs(brunoId), campaignId);
});

afterEach(() => {
  [gm, ana, bruno].forEach((s) => s.disconnect());
});

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([gmId, anaId, brunoId, goneId]);
  await prisma.$disconnect();
});

it('stores a whisper to the owner and sends it to the owner and the GM only', async () => {
  const toAna = waitForEvent<any>(ana, 'chat.message');
  const toGm = waitForEvent<any>(gm, 'chat.message');
  const quiet = expectNoEvent(bruno, 'chat.message', 600);
  expect(await notice(gm, anaCharId, 'Você percebe um brilho')).toEqual({ ok: true });
  const [a, g] = await Promise.all([toAna, toGm]);
  await quiet;
  for (const m of [a, g]) {
    expect(m).toMatchObject({ content: 'Você percebe um brilho', type: 'WHISPER', recipientId: anaId, userId: gmId });
    expect(m.metadata).toEqual({ kind: 'gmNotice', characterId: anaCharId });
  }
  const rows = await prisma.message.findMany({ where: { campaignId } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ type: 'WHISPER', recipientId: anaId, userId: gmId });
  expect((rows[0].metadata as any).kind).toBe('gmNotice');
});

it('keeps the notice out of another player\'s history and gives it to its reader with the metadata', async () => {
  expect(await notice(gm, anaCharId, 'Segredo')).toEqual({ ok: true });
  expect((await history(brunoId)).some((m) => m.content === 'Segredo')).toBe(false);
  const mine = (await history(anaId)).find((m) => m.content === 'Segredo');
  expect(mine.metadata.kind).toBe('gmNotice');
  expect(mine.metadata.characterId).toBe(anaCharId);
  expect((await history(gmId)).some((m) => m.content === 'Segredo')).toBe(true);
});

it('refuses a player', async () => {
  const quiet = expectNoEvent(gm, 'chat.message', 400);
  expect(await notice(ana, anaCharId, 'oi')).toEqual({ ok: false, error: GM_ONLY });
  await quiet;
  expect(await prisma.message.count({ where: { campaignId } })).toBe(0);
});

it.each([['empty', ''], ['blank', '   '], ['501 characters', 'x'.repeat(501)]])('refuses %s text', async (_n, text) => {
  expect(await notice(gm, anaCharId, text)).toEqual({ ok: false, error: NOTICE_LENGTH });
  expect(await prisma.message.count({ where: { campaignId } })).toBe(0);
});

it('accepts 500 characters, trimmed', async () => {
  expect(await notice(gm, anaCharId, `  ${'x'.repeat(500)}  `)).toEqual({ ok: true });
  expect((await prisma.message.findFirstOrThrow({ where: { campaignId } })).content).toBe('x'.repeat(500));
});

it('refuses a character with no player at the table', async () => {
  expect(await notice(gm, gmCharId, 'oi')).toEqual({ ok: false, error: NO_PLAYER });
  expect(await notice(gm, goneCharId, 'oi')).toEqual({ ok: false, error: NO_PLAYER });
  expect(await noticeRecipient(campaignId, anaCharId)).toBe(anaId);
  expect(await noticeRecipient(campaignId, gmCharId)).toBeNull();
  expect(await noticeRecipient(campaignId, goneCharId)).toBeNull();
  expect(await prisma.message.count({ where: { campaignId } })).toBe(0);
});

it('refuses an unknown character', async () => {
  expect(await notice(gm, 'nope', 'oi')).toEqual({ ok: false, error: NO_CHARACTER });
  expect(await noticeRecipient(campaignId, 'nope')).toBeNull();
});
