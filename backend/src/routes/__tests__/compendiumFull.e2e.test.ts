/**
 * GET /api/compendium/entries?full=true: the same search, with each entry's
 * text and data. Without it the list stays light. The entries are invented.
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let agent: request.Agent;
const campaignIds: string[] = [];

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Compendium Full' });
  userId = user.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  const make = (bookId: string, slug: string) =>
    prisma.compendiumEntry.create({
      data: { bookId, type: 'gear', slug, name: `Cheia ${slug}`, nameEn: null, search: `p4f ${slug}`, text: `Texto ${slug}.`, data: { cost: '1 po', weight: 2 } },
    });
  await make('phb', 'p4f-um');
  await make('srd', 'p4f-dois');
});

afterAll(async () => {
  await cleanupCampaigns(campaignIds);
  await prisma.compendiumEntry.deleteMany({ where: { slug: { startsWith: 'p4f-' } } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

it('returns text and data per item with full=true', async () => {
  const res = await agent.get('/api/compendium/entries').query({ q: 'p4f', type: 'gear', full: 'true' });
  expect(res.status).toBe(200);
  expect(res.body.total).toBe(2);
  const one = res.body.items.find((i: { slug: string }) => i.slug === 'p4f-um');
  expect(one.text).toBe('Texto p4f-um.');
  expect(one.data).toEqual({ cost: '1 po', weight: 2 });
});

it('keeps the list light without full', async () => {
  const res = await agent.get('/api/compendium/entries').query({ q: 'p4f', type: 'gear' });
  expect(res.status).toBe(200);
  expect(res.body.items).toHaveLength(2);
  for (const item of res.body.items) {
    expect(item).not.toHaveProperty('text');
    expect(item).not.toHaveProperty('data');
  }
  const off = await agent.get('/api/compendium/entries').query({ q: 'p4f', full: 'false' });
  expect(off.body.items[0]).not.toHaveProperty('data');
});

it('still filters by the campaign books with full=true', async () => {
  const created = await agent.post('/api/campaigns').send({ name: 'P4F Campanha', gameSystem: 'FIFTH_EDITION', bookIds: ['phb'] });
  expect(created.status).toBe(201);
  const campaignId = created.body.campaign.id;
  campaignIds.push(campaignId);
  const res = await agent.get('/api/compendium/entries').query({ q: 'p4f', type: 'gear', full: 'true', campaignId });
  expect(res.status).toBe(200);
  expect(res.body.items.map((i: { slug: string }) => i.slug)).toEqual(['p4f-um']);
  expect(res.body.items[0].data).toBeDefined();
});
