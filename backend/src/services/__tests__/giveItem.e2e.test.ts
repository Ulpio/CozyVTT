/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets are JSON read loosely */
/**
 * The GM giving a character an item: from the compendium (a book the campaign
 * uses) or typed free, into the backpack through the P5d normaliser, then the
 * "Você recebeu" notice to the owner. The compendium entries are invented
 * minimal ones under a book of this file's own. Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { GM_ONLY, NO_CHARACTER } from '../gmNotice';
import { openPack } from '../inventory';

jest.setTimeout(30000);

const BOOK = `p6-give-${randomUUID().slice(0, 8)}`;
const OFF_BOOK = `p6-give-off-${randomUUID().slice(0, 8)}`;
const NOT_FOUND = 'Item não encontrado no compêndio.';

const ENTRIES: { bookId?: string; type: string; slug: string; name: string; data: Record<string, unknown> }[] = [
  { type: 'gear', slug: 'pocao-de-cura', name: 'Poção de Cura', data: { cost: '50 po', weight: 0.25 } },
  { type: 'gear', slug: 'flechas-20', name: 'Flechas (20)', data: { cost: '1 po', weight: 0.5 } },
  { type: 'gear', slug: 'tocha', name: 'Tocha', data: { cost: '1 pc', weight: 0.5 } },
  { type: 'weapon', slug: 'arco-longo', name: 'Arco Longo', data: { category: 'martial', range: 'ranged', damage: { dice: '1d8', type: 'perfurante' }, properties: ['munição'], ammunition: 'flechas-20', weight: 1 } },
  { type: 'magicItem', slug: 'anel-de-protecao', name: 'Anel de Proteção', data: {} },
  { type: 'pack', slug: 'pacote-de-explorador', name: 'Pacote de Explorador', data: { cost: '10 po', contents: ['inventado'], items: [{ ref: { type: 'gear', slug: 'tocha' }, quantity: 3 }, { name: 'Pederneira', quantity: 1 }] } },
  { type: 'spell', slug: 'bola-de-fogo', name: 'Bola de Fogo', data: {} },
  { bookId: OFF_BOOK, type: 'gear', slug: 'item-escondido', name: 'Item Escondido', data: { weight: 1 } },
];

let gmId: string;
let anaId: string;
let goneId: string;
let campaignId: string;
let anaCharId: string;
let goneCharId: string;
let gmCharId: string;
let gm: ClientSocket;
let ana: ClientSocket;

const give = (socket: ClientSocket, payload: unknown) => socket.timeout(5000).emitWithAck('character.item.give', payload);
const bag = async (id = anaCharId): Promise<any[]> => ((await prisma.character.findUniqueOrThrow({ where: { id } })).data as any).inventory ?? [];
const ref = (slug: string, bookId = BOOK) => ({ bookId, slug });
const notices = () => prisma.message.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } });
const setBag = (inventory: any[], id = anaCharId) => prisma.character.update({ where: { id }, data: { data: { inventory } } });

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const users = await Promise.all(['gm', 'ana', 'gone'].map((n) => createTestUser({ email: `give-${n}-${stamp}@test.cozyvtt.local`, displayName: `Give ${n}` })));
  [gmId, anaId, goneId] = users.map((u) => u.id);
  campaignId = (await createTestCampaign(gmId, { name: `Give ${stamp}`, gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: anaId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.createMany({
    data: [BOOK, OFF_BOOK].map((id) => ({ id, name: `P6 give ${id}`, gameSystem: 'FIFTH_EDITION' as const })),
  });
  await prisma.compendiumEntry.createMany({
    data: ENTRIES.map((e) => ({ bookId: e.bookId ?? BOOK, type: e.type, slug: e.slug, name: e.name, search: e.name.toLowerCase(), text: 'Texto inventado.', data: e.data as object })),
  });
  await prisma.campaignBook.deleteMany({ where: { campaignId } });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  const make = (userId: string, name: string) => prisma.character.create({ data: { userId, campaignId, gameSystem: 'FIFTH_EDITION', name, data: { inventory: [] } } }).then((c) => c.id);
  anaCharId = await make(anaId, 'Ana hero');
  goneCharId = await make(goneId, 'Gone hero');
  gmCharId = await make(gmId, 'GM npc');
  server = await createWsTestServer();
});

let server: WsTestServer;

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 1100)); // the per-second ceiling is per user, across sockets
  await prisma.message.deleteMany({ where: { campaignId } });
  await setBag([]);
  await setBag([], goneCharId);
  gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  ana = await server.connectAndAuth(await server.loginAs(anaId), campaignId);
});

afterEach(() => {
  [gm, ana].forEach((s) => s.disconnect());
});

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await prisma.compendiumBook.deleteMany({ where: { id: { in: [BOOK, OFF_BOOK] } } });
  await cleanupUsers([gmId, anaId, goneId]);
  await prisma.$disconnect();
});

it('gives a compendium item: backpack, no slot, an id, weight in pounds, the update and the notice', async () => {
  const updated = waitForEvent<any>(ana, 'character.updated');
  const toAna = waitForEvent<any>(ana, 'chat.message');
  expect(await give(gm, { characterId: anaCharId, ref: ref('pocao-de-cura'), quantity: 2 })).toEqual({ ok: true, noticeSent: true });
  const items = await bag();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ name: 'Poção de Cura', quantity: 2, weight: 0.5, compendiumRef: ref('pocao-de-cura') });
  expect(items[0].id).toEqual(expect.any(String));
  expect(items[0].slot).toBeUndefined();
  expect(JSON.stringify(await updated)).toContain('Poção de Cura');
  const message = await toAna;
  expect(message).toMatchObject({ content: 'Você recebeu: Poção de Cura ×2', type: 'WHISPER', recipientId: anaId });
  expect(message.metadata).toEqual({ kind: 'gmNotice', characterId: anaCharId, item: { name: 'Poção de Cura', quantity: 2, compendiumRef: ref('pocao-de-cura') } });
});

it('tells the open sheet its new inventory in character.updated', async () => {
  const updated = waitForEvent<any>(ana, 'character.updated');
  await give(gm, { characterId: anaCharId, ref: ref('tocha'), quantity: 1 });
  const payload = await updated;
  expect(JSON.stringify(payload)).toContain('Tocha');
});

it('gives a free item with the plain notice text and keeps its notes', async () => {
  expect(await give(gm, { characterId: anaCharId, name: '  Mapa rasgado ', notes: 'Falta o canto', quantity: 1 })).toEqual({ ok: true, noticeSent: true });
  const items = await bag();
  expect(items[0]).toMatchObject({ name: 'Mapa rasgado', quantity: 1, notes: 'Falta o canto' });
  expect(items[0].compendiumRef).toBeUndefined();
  expect(items[0].id).toEqual(expect.any(String));
  const [row] = await notices();
  expect(row.content).toBe('Você recebeu: Mapa rasgado');
  expect((row.metadata as any).item).toEqual({ name: 'Mapa rasgado', quantity: 1 });
  expect((row.metadata as any).item).not.toHaveProperty('compendiumRef');
});

it('adds a bundle of arrows to the stack already in the backpack: one stack of 25', async () => {
  await setBag([{ id: 'arrows', name: 'Flechas', quantity: 5, weight: 0.025, compendiumRef: ref('flechas-20') }]);
  expect(await give(gm, { characterId: anaCharId, ref: ref('flechas-20'), quantity: 1 })).toEqual({ ok: true, noticeSent: true });
  const items = await bag();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ id: 'arrows', name: 'Flechas', quantity: 25 });
  expect((await notices())[0].content).toBe('Você recebeu: Flechas ×20');
});

it('adds an ordinary item to the stack already there', async () => {
  await setBag([{ id: 't', name: 'Tocha', quantity: 2, compendiumRef: ref('tocha') }]);
  await give(gm, { characterId: anaCharId, ref: ref('tocha'), quantity: 3 });
  const items = await bag();
  expect(items).toHaveLength(1);
  expect(items[0].quantity).toBe(5);
});

it('does not stack onto a weapon held in a hand', async () => {
  await setBag([{ id: 'bow', name: 'Arco Longo', quantity: 1, slot: 'both', equipped: true, compendiumRef: ref('arco-longo') }]);
  await give(gm, { characterId: anaCharId, ref: ref('arco-longo'), quantity: 1 });
  const items = await bag();
  expect(items).toHaveLength(2);
  expect(items.find((i) => i.id === 'bow').slot).toBe('both');
  expect(items.find((i) => i.id !== 'bow').slot).toBeUndefined();
});

it('gives a magic item', async () => {
  expect(await give(gm, { characterId: anaCharId, ref: ref('anel-de-protecao'), quantity: 1 })).toMatchObject({ ok: true });
  expect((await bag())[0]).toMatchObject({ name: 'Anel de Proteção', compendiumRef: ref('anel-de-protecao') });
});

it('gives a pack closed (no slot) that still opens', async () => {
  expect(await give(gm, { characterId: anaCharId, ref: ref('pacote-de-explorador'), quantity: 1 })).toMatchObject({ ok: true });
  const [pack] = await bag();
  expect(pack.slot).toBeUndefined();
  expect(await openPack(campaignId, { role: 'GM', userId: gmId }, anaCharId, pack.id)).toEqual({ ok: true });
  const after = await bag();
  expect(after.map((i) => i.name).sort()).toEqual(['Pederneira', 'Tocha']);
  expect(after.find((i) => i.name === 'Tocha').quantity).toBe(3);
});

it('adds the item with no notice when the owner left the table', async () => {
  const toGm = jest.fn();
  gm.on('chat.message', toGm);
  expect(await give(gm, { characterId: goneCharId, ref: ref('tocha'), quantity: 1 })).toEqual({ ok: true, noticeSent: false });
  expect((await bag(goneCharId))[0]).toMatchObject({ name: 'Tocha', quantity: 1 });
  expect(await notices()).toHaveLength(0);
  expect(toGm).not.toHaveBeenCalled();
});

it('adds the item with no notice to the GM\'s own character', async () => {
  await setBag([], gmCharId);
  expect(await give(gm, { characterId: gmCharId, name: 'Chave', quantity: 1 })).toEqual({ ok: true, noticeSent: false });
  expect((await bag(gmCharId))[0].name).toBe('Chave');
});

it('refuses a player first, whatever the payload', async () => {
  expect(await give(ana, { characterId: anaCharId, ref: ref('tocha'), quantity: 1 })).toEqual({ ok: false, error: GM_ONLY });
  expect(await give(ana, null)).toEqual({ ok: false, error: GM_ONLY });
  expect(await give(ana, { quantity: 'x' })).toEqual({ ok: false, error: GM_ONLY });
  expect(await bag()).toEqual([]);
  expect(await notices()).toHaveLength(0);
});

it.each([[0], [1000], [1.5], [-1], ['2'], [null]])('refuses quantity %p', async (quantity) => {
  const out: any = await give(gm, { characterId: anaCharId, ref: ref('tocha'), quantity });
  expect(out).toEqual({ ok: false, error: 'A quantidade precisa ser um número inteiro de 1 a 999.' });
  expect(await bag()).toEqual([]);
  expect(await notices()).toHaveLength(0);
});

it('accepts 999', async () => {
  expect(await give(gm, { characterId: anaCharId, ref: ref('tocha'), quantity: 999 })).toMatchObject({ ok: true });
  expect((await bag())[0].quantity).toBe(999);
});

it('refuses a ref from a book the campaign does not use, a missing entry or a non-item type', async () => {
  for (const r of [ref('item-escondido', OFF_BOOK), ref('nao-existe'), ref('bola-de-fogo')]) {
    expect(await give(gm, { characterId: anaCharId, ref: r, quantity: 1 })).toEqual({ ok: false, error: NOT_FOUND });
  }
  expect(await bag()).toEqual([]);
});

it('refuses a payload with both or neither of ref and name, or a bad name', async () => {
  const both: any = await give(gm, { characterId: anaCharId, ref: ref('tocha'), name: 'Tocha', quantity: 1 });
  const neither: any = await give(gm, { characterId: anaCharId, quantity: 1 });
  expect(both.ok).toBe(false);
  expect(neither.ok).toBe(false);
  expect(both.error).toBe('Escolha um item do compêndio ou digite um nome, não os dois.');
  expect(await bag()).toEqual([]);
});

it.each([[''], ['   '], ['x'.repeat(121)], [5]])('refuses the free name %p', async (name) => {
  expect(await give(gm, { characterId: anaCharId, name, quantity: 1 })).toEqual({ ok: false, error: 'O nome do item precisa ter de 1 a 120 caracteres.' });
  expect(await bag()).toEqual([]);
});

it('accepts a free name of exactly 120 characters', async () => {
  expect(await give(gm, { characterId: anaCharId, name: 'y'.repeat(120), quantity: 1 })).toEqual({ ok: true, noticeSent: true });
  expect((await bag())[0].name).toHaveLength(120);
});

it('refuses notes over 500 characters', async () => {
  expect(await give(gm, { characterId: anaCharId, name: 'X', notes: 'n'.repeat(501), quantity: 1 })).toEqual({ ok: false, error: 'A anotação do item pode ter até 500 caracteres.' });
  expect(await bag()).toEqual([]);
});

it('refuses an unknown or empty character and non-object payloads with clear text', async () => {
  expect(await give(gm, { characterId: 'nope', name: 'X', quantity: 1 })).toEqual({ ok: false, error: NO_CHARACTER });
  expect(await give(gm, { characterId: '', name: 'X', quantity: 1 })).toEqual({ ok: false, error: NO_CHARACTER });
  expect(await give(gm, null)).toEqual({ ok: false, error: NO_CHARACTER });
  expect(await give(gm, 'oi')).toEqual({ ok: false, error: NO_CHARACTER });
});

it('refuses a character of another campaign', async () => {
  const other = (await createTestCampaign(gmId, { name: 'Other give campaign', gameSystem: 'FIFTH_EDITION' })).id;
  const otherChar = (await prisma.character.create({ data: { userId: anaId, campaignId: other, gameSystem: 'FIFTH_EDITION', name: 'Elsewhere', data: { inventory: [] } } })).id;
  try {
    expect(await give(gm, { characterId: otherChar, name: 'X', quantity: 1 })).toEqual({ ok: false, error: NO_CHARACTER });
    expect(await bag(otherChar)).toEqual([]);
  } finally {
    await cleanupCampaigns([other]);
  }
});

it('adds a bundle of arrows to a stack held in the ammo slot, which stays there', async () => {
  await setBag([{ id: 'quiver', name: 'Flechas', quantity: 5, slot: 'ammo', equipped: true, compendiumRef: ref('flechas-20') }]);
  expect(await give(gm, { characterId: anaCharId, ref: ref('flechas-20'), quantity: 1 })).toMatchObject({ ok: true });
  const items = await bag();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ id: 'quiver', quantity: 25, slot: 'ammo' });
});

describe('a full backpack', () => {
  const full = () => Array.from({ length: 500 }, (_v, i) => ({ id: `f${i}`, name: `Coisa ${i}`, quantity: 1 }));

  it('refuses a new item, free or from the compendium, and changes nothing', async () => {
    await setBag(full());
    expect(await give(gm, { characterId: anaCharId, name: 'Mapa', quantity: 1 })).toEqual({ ok: false, error: 'A mochila está cheia.' });
    expect(await give(gm, { characterId: anaCharId, ref: ref('tocha'), quantity: 1 })).toEqual({ ok: false, error: 'A mochila está cheia.' });
    expect(await bag()).toHaveLength(500);
    expect(await notices()).toHaveLength(0);
  });

  it('still merges into an existing stack', async () => {
    await setBag([...full().slice(0, 499), { id: 't', name: 'Tocha', quantity: 1, compendiumRef: ref('tocha') }]);
    expect(await give(gm, { characterId: anaCharId, ref: ref('tocha'), quantity: 2 })).toMatchObject({ ok: true });
    const items = await bag();
    expect(items).toHaveLength(500);
    expect(items.find((i) => i.id === 't').quantity).toBe(3);
  });
});
