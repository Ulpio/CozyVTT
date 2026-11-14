/**
 * A book's creatures (global, source = a compendium book's id, such as the
 * Monster Manual's 'mm') can be corrected by the admin from any campaign they
 * run, and the correction is marked so a compendium import leaves it alone.
 * Any other GM is still refused, as is another campaign's creature.
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const users: string[] = [];
const campaigns: string[] = [];
let adminAgent: request.Agent;
let gmAgent: request.Agent;
let adminCampaignId: string;
let gmCampaignId: string;
let bookCreatureId: string;
let otherCampaignCreatureId: string;

const statBlock = {
  ac: 13,
  hp: 11,
  hpMax: 11,
  speed: '12 m',
  abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
};

async function gmOfOwnCampaign(role: 'ADMIN' | 'USER'): Promise<{ agent: request.Agent; campaignId: string }> {
  const user = await createTestUser({ displayName: `Book edits ${role}`, role });
  users.push(user.id);
  const campaign = await createTestCampaign(user.id);
  campaigns.push(campaign.id);
  await prisma.campaignMembership.create({ data: { campaignId: campaign.id, userId: user.id, role: 'GM' } });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { agent, campaignId: campaign.id };
}

beforeAll(async () => {
  ({ agent: adminAgent, campaignId: adminCampaignId } = await gmOfOwnCampaign('ADMIN'));
  ({ agent: gmAgent, campaignId: gmCampaignId } = await gmOfOwnCampaign('USER'));
  bookCreatureId = (await prisma.creatureTemplate.create({ data: { name: 'P2E Lobo', source: 'mm', statBlock } })).id;
  otherCampaignCreatureId = (
    await prisma.creatureTemplate.create({ data: { name: 'P2E Caseiro', source: 'custom', statBlock, campaignId: gmCampaignId } })
  ).id;
});

afterAll(async () => {
  await prisma.creatureTemplate.deleteMany({ where: { name: { startsWith: 'P2E ' } } });
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

it('lets the admin correct a Monster Manual creature and marks it edited', async () => {
  const res = await adminAgent.put(`/api/campaigns/${adminCampaignId}/creatures/${bookCreatureId}`).send({ alignment: 'corrigido' });
  expect(res.status).toBe(200);
  const stored = await prisma.creatureTemplate.findUnique({ where: { id: bookCreatureId } });
  expect(stored).toMatchObject({ alignment: 'corrigido', campaignId: null, source: 'mm' });
  expect(stored?.editedAt).toBeInstanceOf(Date);
  expect(stored?.editedById).toBeTruthy();
});

it('still refuses a non-admin GM', async () => {
  const res = await gmAgent.put(`/api/campaigns/${gmCampaignId}/creatures/${bookCreatureId}`).send({ alignment: 'não' });
  expect(res.status).toBe(403);
});

it("still refuses another campaign's creature", async () => {
  const res = await adminAgent.put(`/api/campaigns/${adminCampaignId}/creatures/${otherCampaignCreatureId}`).send({ alignment: 'não' });
  expect([403, 404]).toContain(res.status);
  expect((await prisma.creatureTemplate.findUnique({ where: { id: otherCampaignCreatureId } }))?.alignment).toBeNull();
});
