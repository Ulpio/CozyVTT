/**
 * The campaign's character-creation settings, through its routes: the
 * defaults of a new campaign, the GM changing them, bad values refused and a
 * player kept out. Requires PostgreSQL at DATABASE_URL.
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

async function createCampaign(body: Record<string, unknown> = {}): Promise<string> {
  const res = await gm.post('/api/campaigns').send({ name: 'P4T Campanha', gameSystem: 'FIFTH_EDITION', ...body });
  expect(res.status).toBe(201);
  campaignIds.push(res.body.campaign.id);
  await prisma.campaignMembership.create({ data: { userId: playerId, campaignId: res.body.campaign.id, role: 'PLAYER', characterIds: [] } });
  return res.body.campaign.id;
}

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

it('starts a campaign with point buy, standard array and flexible detail', async () => {
  const res = await gm.post('/api/campaigns').send({ name: 'P4T Padrao' });
  expect(res.status).toBe(201);
  campaignIds.push(res.body.campaign.id);
  expect(res.body.campaign.abilityScoreMethods).toEqual(['POINT_BUY', 'STANDARD_ARRAY']);
  expect(res.body.campaign.detailLevel).toBe('FLEXIBLE');
});

it('starts a campaign with the settings it is created with', async () => {
  const id = await createCampaign({ abilityScoreMethods: ['ROLL'], detailLevel: 'FAITHFUL' });
  const get = await gm.get(`/api/campaigns/${id}`);
  expect(get.body.campaign.abilityScoreMethods).toEqual(['ROLL']);
  expect(get.body.campaign.detailLevel).toBe('FAITHFUL');
});

it('lets the GM change both and reads them back', async () => {
  const id = await createCampaign();
  const put = await gm.put(`/api/campaigns/${id}`).send({ abilityScoreMethods: ['ROLL'], detailLevel: 'FAITHFUL' });
  expect(put.status).toBe(200);
  const get = await player.get(`/api/campaigns/${id}`);
  expect(get.body.campaign.abilityScoreMethods).toEqual(['ROLL']);
  expect(get.body.campaign.detailLevel).toBe('FAITHFUL');
});

it('refuses an empty list and an unknown method', async () => {
  const id = await createCampaign();
  expect((await gm.put(`/api/campaigns/${id}`).send({ abilityScoreMethods: [] })).status).toBe(400);
  expect((await gm.put(`/api/campaigns/${id}`).send({ abilityScoreMethods: ['DICE'] })).status).toBe(400);
  expect((await gm.put(`/api/campaigns/${id}`).send({ detailLevel: 'LOOSE' })).status).toBe(400);
});

it('stores a repeated method once', async () => {
  const id = await createCampaign();
  const put = await gm.put(`/api/campaigns/${id}`).send({ abilityScoreMethods: ['ROLL', 'ROLL'] });
  expect(put.status).toBe(200);
  expect(put.body.campaign.abilityScoreMethods).toEqual(['ROLL']);
});

it('keeps a player from changing either', async () => {
  const id = await createCampaign();
  expect((await player.put(`/api/campaigns/${id}`).send({ abilityScoreMethods: ['ROLL'] })).status).toBe(403);
  expect((await player.put(`/api/campaigns/${id}`).send({ detailLevel: 'FAITHFUL' })).status).toBe(403);
  const get = await gm.get(`/api/campaigns/${id}`);
  expect(get.body.campaign.abilityScoreMethods).toEqual(['POINT_BUY', 'STANDARD_ARRAY']);
  expect(get.body.campaign.detailLevel).toBe('FLEXIBLE');
});
