/**
 * The books a campaign uses, through its routes: a new campaign's default,
 * the GM changing them, a player reading them, a bad book refused, and a
 * change of system resetting them. Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let gmId: string;
let playerId: string;
let gm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;
const campaignIds: string[] = [];

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function createCampaign(body: Record<string, unknown>): Promise<string> {
  const res = await gm.post('/api/campaigns').send({ name: 'P3T Campanha', gameSystem: 'FIFTH_EDITION', ...body });
  expect(res.status).toBe(201);
  campaignIds.push(res.body.campaign.id);
  await prisma.campaignMembership.create({ data: { userId: playerId, campaignId: res.body.campaign.id, role: 'PLAYER', characterIds: [] } });
  return res.body.campaign.id;
}

const enabled = (body: { books: Array<{ id: string; enabled: boolean }> }) =>
  body.books.filter((b) => b.enabled).map((b) => b.id).sort();

beforeAll(async () => {
  const gmUser = await createTestUser();
  const playerUser = await createTestUser();
  gmId = gmUser.id;
  playerId = playerUser.id;
  gm = await login(gmUser.email);
  player = await login(playerUser.email);
});

afterAll(async () => {
  await cleanupCampaigns(campaignIds);
  await cleanupUsers([gmId, playerId]);
  await prisma.$disconnect();
});

it('starts a new 5e campaign with every 5e book but the English SRD', async () => {
  const id = await createCampaign({});
  const res = await gm.get(`/api/campaigns/${id}/books`);
  expect(res.status).toBe(200);
  expect(enabled(res.body)).toEqual(['dmg', 'mm', 'phb']);
  expect(res.body.books.map((b: { id: string }) => b.id).sort()).toEqual(['dmg', 'mm', 'phb', 'srd']);
});

it('starts a campaign with the books it is created with', async () => {
  const id = await createCampaign({ bookIds: ['phb'] });
  expect(enabled((await gm.get(`/api/campaigns/${id}/books`)).body)).toEqual(['phb']);
});

it('lets the GM change the books and a player read them', async () => {
  const id = await createCampaign({});
  const put = await gm.put(`/api/campaigns/${id}/books`).send({ bookIds: ['phb', 'srd'] });
  expect(put.status).toBe(200);
  expect(enabled(put.body)).toEqual(['phb', 'srd']);
  const read = await player.get(`/api/campaigns/${id}/books`);
  expect(read.status).toBe(200);
  expect(enabled(read.body)).toEqual(['phb', 'srd']);
});

it('does not let a player change the books', async () => {
  const id = await createCampaign({});
  expect((await player.put(`/api/campaigns/${id}/books`).send({ bookIds: ['phb'] })).status).toBe(403);
  expect(enabled((await gm.get(`/api/campaigns/${id}/books`)).body)).toEqual(['dmg', 'mm', 'phb']);
});

it('refuses a book that does not exist and keeps the list', async () => {
  const id = await createCampaign({});
  const res = await gm.put(`/api/campaigns/${id}/books`).send({ bookIds: ['xx'] });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/xx/);
  expect(enabled((await gm.get(`/api/campaigns/${id}/books`)).body)).toEqual(['dmg', 'mm', 'phb']);
});

it('refuses to create a campaign with a book of another system', async () => {
  const res = await gm.post('/api/campaigns').send({ name: 'P3T Errada', gameSystem: 'HORROR_D100', bookIds: ['phb'] });
  expect(res.status).toBe(400);
  expect(await prisma.campaign.count({ where: { name: 'P3T Errada', ownerId: gmId } })).toBe(0);
});

it('resets the books when the system changes, even with other settings', async () => {
  const id = await createCampaign({ bookIds: ['phb'] });
  const res = await gm.put(`/api/campaigns/${id}`).send({ gameSystem: 'HORROR_D100', name: 'P3T Outra' });
  expect(res.status).toBe(200);
  expect((await gm.get(`/api/campaigns/${id}/books`)).body.books).toEqual([]);
  await gm.put(`/api/campaigns/${id}`).send({ gameSystem: 'FIFTH_EDITION' });
  expect(enabled((await gm.get(`/api/campaigns/${id}/books`)).body)).toEqual(['dmg', 'mm', 'phb']);
});

it('leaves the books alone when the system is sent unchanged', async () => {
  const id = await createCampaign({ bookIds: ['phb'] });
  await gm.put(`/api/campaigns/${id}`).send({ gameSystem: 'FIFTH_EDITION', name: 'P3T Mesmo' });
  expect(enabled((await gm.get(`/api/campaigns/${id}/books`)).body)).toEqual(['phb']);
});
