/* eslint-disable @typescript-eslint/no-explicit-any -- socket acks and JSON sheets are read loosely */
/**
 * The P6 "done when" session (the GM's tools), played end to end over real
 * sockets and a real database: three characters (two players), one secret check
 * for all three (results to the GM, nothing on either player socket), a private
 * notice to the ranger (only her player and the GM), "Poção de Cura" x2 from the
 * real compendium to the fighter (the part skips when materiais/.compendio/data is
 * absent, like the P5d one) and a free "Mapa rasgado". Requires PostgreSQL at DATABASE_URL.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(60000);

const GEAR = resolve(__dirname, '../../../../materiais/.compendio/data/phb/gear.json');
const present = existsSync(GEAR);
if (!present) console.warn(`p6.e2e: ${GEAR} not found (the compendium data is private); skipping the compendium step.`);
const itIf = present ? it : it.skip;

const BOOK = `p6-e2e-${randomUUID().slice(0, 8)}`;
/** The curated compendium spells it "Poção de cura"; the notice carries the entry's own name. */
const POTION = present ? (JSON.parse(readFileSync(GEAR, 'utf8')) as any[]).find((e) => e.slug === 'pocao-de-cura').name : '';

let server: WsTestServer;
let gmId: string;
let anaId: string;
let brunoId: string;
let campaignId: string;
const ids: Record<string, string> = {};
let gm: ClientSocket;
let ana: ClientSocket;
let bruno: ClientSocket;

const emit = (socket: ClientSocket, event: string, payload: unknown) => socket.timeout(5000).emitWithAck(event, payload);
const spacing = () => new Promise((r) => setTimeout(r, 1100)); // the per-second ceilings are per user
const bag = async (who: string): Promise<any[]> => ((await prisma.character.findUniqueOrThrow({ where: { id: ids[who] } })).data as any).inventory ?? [];

function record(socket: ClientSocket): { events: string[] } {
  const seen = { events: [] as string[] };
  socket.onAny((name: string) => seen.events.push(name));
  return seen;
}
const noise = (e: string) => e !== 'presence.update' && e !== 'user.joined';

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const users = await Promise.all(['gm', 'ana', 'bruno'].map((n) => createTestUser({ email: `p6-${n}-${stamp}@test.cozyvtt.local`, displayName: `P6 ${n}` })));
  [gmId, anaId, brunoId] = users.map((u) => u.id);
  campaignId = (await createTestCampaign(gmId, { name: `P6 ${stamp}`, gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: anaId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: brunoId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const make = async (key: string, userId: string, name: string) => {
    ids[key] = (await prisma.character.create({ data: { userId, campaignId, gameSystem: 'FIFTH_EDITION', name, data: { inventory: [] } } })).id;
  };
  await make('ranger', anaId, 'Patrulheira');
  await make('wizard', anaId, 'Maga');
  await make('fighter', brunoId, 'Guerreiro');
  if (present) {
    const rows: any[] = JSON.parse(readFileSync(GEAR, 'utf8'));
    await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P6 e2e book', gameSystem: 'FIFTH_EDITION' } });
    await prisma.compendiumEntry.createMany({
      data: rows.map((e) => ({ bookId: BOOK, type: e.type, slug: e.slug, name: e.name, search: String(e.name).toLowerCase(), text: '', data: e.data as object })),
      skipDuplicates: true,
    });
    await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  }
  server = await createWsTestServer();
  await spacing();
  gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  ana = await server.connectAndAuth(await server.loginAs(anaId), campaignId);
  bruno = await server.connectAndAuth(await server.loginAs(brunoId), campaignId);
  await new Promise((r) => setTimeout(r, 300)); // let the joins settle
});

afterAll(async () => {
  [gm, ana, bruno].forEach((s) => s?.disconnect());
  await server.close();
  await cleanupCampaigns([campaignId]);
  if (present) await prisma.compendiumBook.deleteMany({ where: { id: BOOK } });
  await cleanupUsers([gmId, anaId, brunoId]);
  await prisma.$disconnect();
});

it('1. a secret check for the three: one result each to the GM, nothing to either player', async () => {
  const seenAna = record(ana);
  const seenBruno = record(bruno);
  const rolls = ['ranger', 'wizard', 'fighter'].map((k, i) => ({ characterId: ids[k], expression: `1d20+${i + 3}`, purpose: 'Percepção', characterName: k }));
  const toGm = waitForEvent<any>(gm, 'dice.rolled');
  const ack: any = await emit(gm, 'gm.secretCheck', { rolls });
  expect(ack.ok).toBe(true);
  expect(ack.results).toHaveLength(3);
  expect((await toGm).secret).toBe(true);
  for (const k of ['ranger', 'wizard', 'fighter']) {
    const result = ack.results.find((r: any) => r.characterId === ids[k]);
    expect(result).toBeDefined();
    expect(result.total).toBe(result.dice[0] + rolls.findIndex((r) => r.characterId === ids[k]) + 3);
  }
  await new Promise((r) => setTimeout(r, 600));
  const rows = await prisma.diceRoll.findMany({ where: { campaignId } });
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.secret && r.userId === gmId)).toBe(true);
  expect(await prisma.message.count({ where: { campaignId } })).toBe(0); // no chat line either
  expect(seenAna.events.filter(noise)).toEqual([]);
  expect(seenBruno.events.filter(noise)).toEqual([]);
});

it('2. a notice to the ranger reaches only her player and the GM', async () => {
  await spacing();
  const toAna = waitForEvent<any>(ana, 'chat.message');
  const toGm = waitForEvent<any>(gm, 'chat.message');
  const quiet = expectNoEvent(bruno, 'chat.message', 700);
  expect(await emit(gm, 'gm.notice', { characterId: ids.ranger, text: 'Você percebe um brilho atrás da estante' })).toEqual({ ok: true });
  const [a, g] = await Promise.all([toAna, toGm]);
  await quiet;
  for (const m of [a, g]) {
    expect(m).toMatchObject({ content: 'Você percebe um brilho atrás da estante', type: 'WHISPER', recipientId: anaId, userId: gmId });
    expect(m.metadata).toEqual({ kind: 'gmNotice', characterId: ids.ranger });
  }
  expect(await prisma.message.count({ where: { campaignId } })).toBe(1);
});

itIf('3. "Poção de Cura" x2 from the compendium goes to the fighter\'s backpack with a notice', async () => {
  await spacing();
  const toBruno = waitForEvent<any>(bruno, 'chat.message');
  const toGm = waitForEvent<any>(gm, 'chat.message');
  const quietAna = expectNoEvent(ana, 'chat.message', 700);
  expect(await emit(gm, 'character.item.give', { characterId: ids.fighter, ref: { bookId: BOOK, slug: 'pocao-de-cura' }, quantity: 2 })).toEqual({ ok: true, noticeSent: true });
  const items = await bag('fighter');
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ name: POTION, quantity: 2, compendiumRef: { bookId: BOOK, slug: 'pocao-de-cura' } });
  expect(items[0].slot).toBeUndefined();
  const [b, g] = await Promise.all([toBruno, toGm]);
  await quietAna;
  for (const m of [b, g]) {
    expect(m).toMatchObject({ content: `Você recebeu: ${POTION} ×2`, type: 'WHISPER', recipientId: brunoId });
    expect(m.metadata).toEqual({ kind: 'gmNotice', characterId: ids.fighter, item: { name: POTION, quantity: 2 } });
  }
});

it('4. a free "Mapa rasgado" works the same way', async () => {
  await spacing();
  const before = (await bag('fighter')).length;
  const toBruno = waitForEvent<any>(bruno, 'chat.message');
  const quietAna = expectNoEvent(ana, 'chat.message', 700);
  expect(await emit(gm, 'character.item.give', { characterId: ids.fighter, name: 'Mapa rasgado', quantity: 1 })).toEqual({ ok: true, noticeSent: true });
  const items = await bag('fighter');
  expect(items).toHaveLength(before + 1);
  expect(items.find((i) => i.name === 'Mapa rasgado')).toMatchObject({ quantity: 1 });
  const m = await toBruno;
  await quietAna;
  expect(m).toMatchObject({ content: 'Você recebeu: Mapa rasgado', type: 'WHISPER', recipientId: brunoId });
  expect(m.metadata.item).toEqual({ name: 'Mapa rasgado', quantity: 1 });
});
