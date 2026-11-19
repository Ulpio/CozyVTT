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
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(60000);
jest.setTimeout(60000);

const GEAR = resolve(__dirname, '../../../../materiais/.compendio/data/phb/gear.json');
const gearRows: any[] = existsSync(GEAR) ? JSON.parse(readFileSync(GEAR, 'utf8')) : [];
/** The curated compendium spells it "Poção de cura"; the notice carries the entry's own name. */
const POTION: string | undefined = gearRows.find((e) => e.slug === 'pocao-de-cura')?.name;
const present = gearRows.length > 0 && POTION !== undefined;
if (!present) console.warn(`p6.e2e: ${GEAR} not found or without the potion (the compendium data is private); skipping the compendium step.`);
const itIf = present ? it : it.skip;

const BOOK = `p6-e2e-${randomUUID().slice(0, 8)}`;

let server: WsTestServer | undefined;
let gmId: string;
let anaId: string;
let brunoId: string;
let campaignId: string | undefined;
const ids: Record<string, string> = {};
let gm: ClientSocket;
let ana: ClientSocket;
let bruno: ClientSocket;

type Seen = { name: string; payload: any }[];
const seen: Record<'gm' | 'ana' | 'bruno', Seen> = { gm: [], ana: [], bruno: [] };

const emit = (socket: ClientSocket, event: string, payload: unknown) => socket.timeout(5000).emitWithAck(event, payload);
const spacing = () => new Promise((r) => setTimeout(r, 1100)); // the per-second ceilings are per user
const bag = async (who: string): Promise<any[]> => ((await prisma.character.findUniqueOrThrow({ where: { id: ids[who] } })).data as any).inventory ?? [];
const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const noise = (e: { name: string }) => e.name !== 'presence.update' && e.name !== 'user.joined';
const clearSeen = () => { seen.gm.length = seen.ana.length = seen.bruno.length = 0; };
const named = (s: Seen, name: string) => s.filter((e) => e.name === name).map((e) => e.payload);

/** Every event on every socket is recorded from the start; a test clears the logs, acts, settles, then asserts exact counts. */
function recordAll(socket: ClientSocket, into: Seen): void {
  socket.onAny((name: string, payload: unknown) => into.push({ name, payload }));
}

/** Exactly one gmNotice WHISPER to each recipient and nothing at all to the others. */
function expectOneNotice(recipients: ('gm' | 'ana' | 'bruno')[], content: string, recipientId: string, metadata: object): void {
  for (const who of ['gm', 'ana', 'bruno'] as const) {
    const events = seen[who].filter(noise);
    if (recipients.includes(who)) {
      expect(events.map((e) => e.name)).toEqual(expect.arrayContaining(['chat.message']));
      const chats = named(seen[who], 'chat.message');
      expect(chats).toHaveLength(1);
      expect(chats[0]).toMatchObject({ content, type: 'WHISPER', recipientId, userId: gmId });
      expect(chats[0].metadata).toEqual(metadata);
    } else {
      expect(events.map((e) => e.name).filter((n) => n === 'chat.message')).toEqual([]);
    }
  }
}

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
    ids[key] = (await prisma.character.create({ data: { userId, campaignId: campaignId!, gameSystem: 'FIFTH_EDITION', name, data: { inventory: [] } } })).id;
  };
  await make('ranger', anaId, 'Patrulheira');
  await make('wizard', anaId, 'Maga');
  await make('fighter', brunoId, 'Guerreiro');
  if (present) {
    await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P6 e2e book', gameSystem: 'FIFTH_EDITION' } });
    await prisma.compendiumEntry.createMany({
      data: gearRows.map((e) => ({ bookId: BOOK, type: e.type, slug: e.slug, name: e.name, search: String(e.name).toLowerCase(), text: '', data: e.data as object })),
      skipDuplicates: true,
    });
    await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  }
  server = await createWsTestServer();
  await spacing();
  gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  ana = await server.connectAndAuth(await server.loginAs(anaId), campaignId);
  bruno = await server.connectAndAuth(await server.loginAs(brunoId), campaignId);
  recordAll(gm, seen.gm);
  recordAll(ana, seen.ana);
  recordAll(bruno, seen.bruno);
  await settle(300); // let the joins settle
});

afterAll(async () => {
  [gm, ana, bruno].forEach((s) => s?.disconnect());
  await server?.close();
  if (campaignId) await cleanupCampaigns([campaignId]);
  await prisma.compendiumBook.deleteMany({ where: { id: BOOK } });
  await cleanupUsers([gmId, anaId, brunoId].filter(Boolean));
  await prisma.$disconnect();
});

it('1. a secret check for the three: one result each to the GM, nothing to either player', async () => {
  clearSeen();
  // The bonus is part of the expression the client builds from each sheet; the server cannot see the sheet bonus.
  const rolls = ['ranger', 'wizard', 'fighter'].map((k, i) => ({ characterId: ids[k], expression: `1d20+${i + 3}`, purpose: 'Percepção', characterName: k }));
  const ack: any = await emit(gm, 'gm.secretCheck', { rolls });
  expect(ack.ok).toBe(true);
  expect(ack.results).toHaveLength(3);
  for (const k of ['ranger', 'wizard', 'fighter']) {
    const result = ack.results.find((r: any) => r.characterId === ids[k]);
    expect(result).toBeDefined();
    expect(result.total).toBe(result.dice[0] + rolls.findIndex((r) => r.characterId === ids[k]) + 3);
  }
  await settle(800);
  const rolled = named(seen.gm, 'dice.rolled');
  expect(rolled).toHaveLength(3);
  expect(rolled.every((r) => r.secret === true)).toBe(true);
  const rows = await prisma.diceRoll.findMany({ where: { campaignId } });
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.secret && r.userId === gmId)).toBe(true);
  expect(await prisma.message.count({ where: { campaignId } })).toBe(0); // no chat line either
  expect(seen.ana.filter(noise)).toEqual([]);
  expect(seen.bruno.filter(noise)).toEqual([]);
});

it('2. a notice to the ranger reaches only her player and the GM', async () => {
  await spacing();
  clearSeen();
  expect(await emit(gm, 'gm.notice', { characterId: ids.ranger, text: 'Você percebe um brilho atrás da estante' })).toEqual({ ok: true });
  await settle();
  expectOneNotice(['gm', 'ana'], 'Você percebe um brilho atrás da estante', anaId, { kind: 'gmNotice', characterId: ids.ranger });
  expect(seen.bruno.filter(noise)).toEqual([]);
  const rows = await prisma.message.findMany({ where: { campaignId } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ type: 'WHISPER', recipientId: anaId, userId: gmId });
});

itIf('3. "Poção de cura" x2 from the compendium goes to the fighter\'s backpack with a notice', async () => {
  await spacing();
  clearSeen();
  expect(await emit(gm, 'character.item.give', { characterId: ids.fighter, ref: { bookId: BOOK, slug: 'pocao-de-cura' }, quantity: 2 })).toEqual({ ok: true, noticeSent: true });
  await settle();
  const items = await bag('fighter');
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ name: POTION, quantity: 2, compendiumRef: { bookId: BOOK, slug: 'pocao-de-cura' } });
  expect(items[0].id).toEqual(expect.stringMatching(/.+/));
  expect(items[0].slot).toBeUndefined();
  expectOneNotice(['gm', 'bruno'], `Você recebeu: ${POTION} ×2`, brunoId, { kind: 'gmNotice', characterId: ids.fighter, item: { name: POTION, quantity: 2 } });
  expect(seen.ana.filter(noise).map((e) => e.name)).not.toContain('chat.message');
  const rows = await prisma.message.findMany({ where: { campaignId, content: `Você recebeu: ${POTION} ×2` } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ type: 'WHISPER', recipientId: brunoId, userId: gmId });
});

it('4. a free "Mapa rasgado" works the same way', async () => {
  await spacing();
  clearSeen();
  const before = await bag('fighter');
  expect(await emit(gm, 'character.item.give', { characterId: ids.fighter, name: 'Mapa rasgado', quantity: 1 })).toEqual({ ok: true, noticeSent: true });
  await settle();
  const items = await bag('fighter');
  expect(items).toHaveLength(before.length + 1);
  const map = items.find((i) => i.name === 'Mapa rasgado');
  expect(map).toMatchObject({ quantity: 1 });
  expect(map.id).toEqual(expect.stringMatching(/.+/));
  expect(map.slot).toBeUndefined();
  expectOneNotice(['gm', 'bruno'], 'Você recebeu: Mapa rasgado', brunoId, { kind: 'gmNotice', characterId: ids.fighter, item: { name: 'Mapa rasgado', quantity: 1 } });
  expect(seen.ana.filter(noise).map((e) => e.name)).not.toContain('chat.message');
  const rows = await prisma.message.findMany({ where: { campaignId, content: 'Você recebeu: Mapa rasgado' } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ type: 'WHISPER', recipientId: brunoId, userId: gmId });
});
