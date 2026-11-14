/**
 * The compendium over the API: the books, a search that ignores accents and
 * case and also matches the English name, one entry, and the admin's
 * corrections. Magic items stay out of a player's search until the GM hands
 * one over (P6). The entries are invented. Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const created: string[] = [];
let player: request.Agent;
let admin: request.Agent;
let spellId: string;
let armorId: string;
let itemId: string;

async function signIn(role: 'ADMIN' | 'USER'): Promise<request.Agent> {
  const user = await createTestUser({ displayName: `Compendium ${role}`, role });
  created.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

const spellData = {
  level: 1,
  school: 'evocação',
  castingTime: '1 ação',
  range: '36 metros',
  components: { v: true, s: true, m: false },
  duration: 'Instantânea',
  concentration: false,
  ritual: false,
  classes: [],
};

beforeAll(async () => {
  player = await signIn('USER');
  admin = await signIn('ADMIN');
  const make = (type: string, slug: string, name: string, nameEn: string | null, search: string, data: object) =>
    prisma.compendiumEntry.create({ data: { bookId: type === 'magicItem' ? 'dmg' : 'phb', type, slug, name, nameEn, search, text: 'Inventado.', data } });
  spellId = (await make('spell', 'p2r-misseis-magicos', 'Mísseis Mágicos Rota', 'Magic Missile Route', 'misseis magicos rota magic missile route', spellData)).id;
  armorId = (await make('armor', 'p2r-misseis-magicos', 'Mísseis Mágicos Rota', null, 'misseis magicos rota', {
    category: 'shield', baseAc: 2, addDex: false, stealthDisadvantage: false, cost: '10 po', weight: 3,
  })).id;
  itemId = (await make('magicItem', 'p2r-pocao-rota', 'Poção Rota', 'Potion Route', 'pocao rota potion route', {
    category: 'Poção', rarity: 'comum', attunement: false,
  })).id;
});

afterAll(async () => {
  await prisma.compendiumEntry.deleteMany({ where: { slug: { startsWith: 'p2r-' } } });
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('lists the four books', async () => {
  const res = await player.get('/api/compendium/books');
  expect(res.status).toBe(200);
  expect(res.body.map((b: { id: string }) => b.id).sort()).toEqual(['dmg', 'mm', 'phb', 'srd']);
});

it('finds by name without accents or case', async () => {
  for (const q of ['misseis magicos rota', 'MÍSSEIS MÁGICOS ROTA', 'Misseis']) {
    const res = await player.get('/api/compendium/entries').query({ q, type: 'spell' });
    expect(res.status).toBe(200);
    expect(res.body.items.map((e: { id: string }) => e.id)).toContain(spellId);
  }
});

it('finds by English name', async () => {
  const res = await player.get('/api/compendium/entries').query({ q: 'magic missile route' });
  expect(res.body.items.map((e: { id: string }) => e.id)).toContain(spellId);
});

it('returns a spell and an armor that share a name', async () => {
  const res = await player.get('/api/compendium/entries').query({ q: 'misseis magicos rota' });
  const types = res.body.items.filter((e: { slug: string }) => e.slug === 'p2r-misseis-magicos').map((e: { type: string }) => e.type).sort();
  expect(types).toEqual(['armor', 'spell']);
  expect(res.body.total).toBeGreaterThanOrEqual(2);
});

it('hides magic items from a player and shows them to the admin', async () => {
  const asPlayer = await player.get('/api/compendium/entries').query({ q: 'pocao rota' });
  expect(asPlayer.body.items.map((e: { id: string }) => e.id)).not.toContain(itemId);
  expect((await player.get('/api/compendium/entries').query({ type: 'magicItem' })).body.items).toEqual([]);
  expect((await player.get(`/api/compendium/entries/${itemId}`)).status).toBe(404);

  const asAdmin = await admin.get('/api/compendium/entries').query({ q: 'pocao rota' });
  expect(asAdmin.body.items.map((e: { id: string }) => e.id)).toContain(itemId);
  expect((await admin.get(`/api/compendium/entries/${itemId}`)).status).toBe(200);
});

it('returns one entry whole', async () => {
  const res = await player.get(`/api/compendium/entries/${armorId}`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ type: 'armor', text: 'Inventado.', data: { baseAc: 2 } });
});

it('lets only the admin correct an entry', async () => {
  expect((await player.patch(`/api/compendium/entries/${spellId}`).send({ text: 'Não.' })).status).toBe(403);
  const res = await admin.patch(`/api/compendium/entries/${spellId}`).send({ text: 'Corrigido.', nameEn: 'Magic Missile Fixed' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ text: 'Corrigido.', nameEn: 'Magic Missile Fixed' });
});

it('refuses a correction that breaks the schema', async () => {
  const res = await admin.patch(`/api/compendium/entries/${spellId}`).send({ data: { ...spellData, level: 12 } });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/level/);
});

it('marks a corrected entry as edited, and searches its new name', async () => {
  await admin.patch(`/api/compendium/entries/${armorId}`).send({ name: 'Escudo Rota Corrigido' });
  const stored = await prisma.compendiumEntry.findUnique({ where: { id: armorId } });
  expect(stored?.editedAt).toBeInstanceOf(Date);
  expect(stored?.editedById).toBeTruthy();
  expect(stored?.search).toBe('escudo rota corrigido');
});
