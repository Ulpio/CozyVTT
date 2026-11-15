/**
 * A campaign offers only its books: the creature library leaves out a
 * disabled book's creatures (never the campaign's own or the homemade ones),
 * and the compendium search asked for a campaign returns only its books'
 * entries, to members only. The creatures and the entry are invented.
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let gmId: string;
let outsiderId: string;
let gm: ReturnType<typeof request.agent>;
let outsider: ReturnType<typeof request.agent>;
let campaignId: string;

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

const names = (body: { creatures: Array<{ name: string }> }) => body.creatures.map((c) => c.name).sort();
const setBooks = async (bookIds: string[]) =>
  expect((await gm.put(`/api/campaigns/${campaignId}/books`).send({ bookIds })).status).toBe(200);

beforeAll(async () => {
  const gmUser = await createTestUser();
  const outsiderUser = await createTestUser();
  gmId = gmUser.id;
  outsiderId = outsiderUser.id;
  gm = await login(gmUser.email);
  outsider = await login(outsiderUser.email);
  const res = await gm.post('/api/campaigns').send({ name: 'P3F Campanha', gameSystem: 'FIFTH_EDITION', bookIds: ['phb'] });
  campaignId = res.body.campaign.id;
  await prisma.creatureTemplate.createMany({
    data: [
      { name: 'P3F Lobo', source: 'mm', gameSystem: 'FIFTH_EDITION', statBlock: {} },
      { name: 'P3F Urso', source: 'custom', gameSystem: 'FIFTH_EDITION', statBlock: {} },
      { name: 'P3F Cópia', source: 'mm', gameSystem: 'FIFTH_EDITION', statBlock: {}, campaignId },
    ],
  });
  await prisma.compendiumEntry.create({
    data: {
      bookId: 'phb', type: 'feat', slug: 'p3f-talento', name: 'P3F Talento', search: 'p3f talento',
      text: 'Inventado.', data: { prerequisite: null, benefits: [] },
    },
  });
});

afterAll(async () => {
  await prisma.creatureTemplate.deleteMany({ where: { name: { startsWith: 'P3F ' } } });
  await prisma.compendiumEntry.deleteMany({ where: { slug: { startsWith: 'p3f-' } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([gmId, outsiderId]);
  await prisma.$disconnect();
});

it('leaves a disabled book out of the creature library, keeping the campaign and homemade creatures', async () => {
  await setBooks(['phb']);
  const res = await gm.get(`/api/campaigns/${campaignId}/creatures`).query({ search: 'P3F' });
  expect(res.status).toBe(200);
  expect(names(res.body)).toEqual(['P3F Cópia', 'P3F Urso']);
});

it('finds nothing global from a disabled book by its source', async () => {
  await setBooks(['phb']);
  const res = await gm.get(`/api/campaigns/${campaignId}/creatures`).query({ search: 'P3F', source: 'mm' });
  expect(names(res.body)).toEqual(['P3F Cópia']);
});

it('shows the book creatures again once the book is on', async () => {
  await setBooks(['phb', 'mm']);
  const res = await gm.get(`/api/campaigns/${campaignId}/creatures`).query({ search: 'P3F' });
  expect(names(res.body)).toEqual(['P3F Cópia', 'P3F Lobo', 'P3F Urso']);
});

it('searches the compendium within the campaign books', async () => {
  await setBooks(['mm']);
  const off = await gm.get('/api/compendium/entries').query({ campaignId, q: 'p3f talento' });
  expect(off.status).toBe(200);
  expect(off.body.items).toEqual([]);
  await setBooks(['phb']);
  const on = await gm.get('/api/compendium/entries').query({ campaignId, q: 'p3f talento' });
  expect(on.body.items.map((e: { slug: string }) => e.slug)).toEqual(['p3f-talento']);
});

it('keeps a book filter inside the campaign books', async () => {
  await setBooks(['mm']);
  const res = await gm.get('/api/compendium/entries').query({ campaignId, book: 'phb', q: 'p3f talento' });
  expect(res.body.items).toEqual([]);
});

it('refuses the campaign search to someone outside the campaign', async () => {
  const res = await outsider.get('/api/compendium/entries').query({ campaignId, q: 'p3f talento' });
  expect(res.status).toBe(403);
});

it('keeps every book creature in a campaign with no system, which has no books to choose', async () => {
  const res = await gm.post('/api/campaigns').send({ name: 'P3F Sem Sistema' });
  const loose = res.body.campaign.id;
  try {
    const list = await gm.get(`/api/campaigns/${loose}/creatures`).query({ search: 'P3F' });
    expect(names(list.body)).toEqual(['P3F Lobo', 'P3F Urso']);
  } finally {
    await cleanupCampaigns([loose]);
  }
});
