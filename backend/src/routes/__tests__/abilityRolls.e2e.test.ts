/**
 * /api/characters/ability-roll: a player's ability roll is made once on the
 * server, comes back unchanged when asked for again, and is used up by the
 * character created from it. Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const userIds: string[] = [];
const campaignIds: string[] = [];

async function signIn(label: string): Promise<{ id: string; agent: request.Agent }> {
  const user = await createTestUser({ displayName: label });
  userIds.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent };
}

async function campaignWith(ownerId: string, methods: string[], memberIds: string[] = []): Promise<string> {
  const campaign = await createTestCampaign(ownerId, { gameSystem: 'FIFTH_EDITION' });
  campaignIds.push(campaign.id);
  await prisma.campaign.update({ where: { id: campaign.id }, data: { abilityScoreMethods: methods } });
  for (const userId of [ownerId, ...memberIds]) {
    await prisma.campaignMembership.create({
      data: { userId, campaignId: campaign.id, role: userId === ownerId ? 'GM' : 'PLAYER', characterIds: [] },
    });
  }
  return campaign.id;
}

type Roll = { dice: number[]; kept: number[]; total: number };

afterAll(async () => {
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

it('rolls once and returns the same roll afterwards', async () => {
  const { agent } = await signIn('Roller');
  expect((await agent.get('/api/characters/ability-roll')).body).toEqual({ roll: null });

  const first = await agent.post('/api/characters/ability-roll').send({});
  expect(first.status).toBe(200);
  const second = await agent.post('/api/characters/ability-roll').send({});
  expect(second.body.roll).toEqual(first.body.roll);
  const read = await agent.get('/api/characters/ability-roll');
  expect(read.body.roll).toEqual(first.body.roll);

  const rolls: Roll[] = first.body.roll.rolls;
  expect(rolls).toHaveLength(6);
  for (const r of rolls) {
    expect(r.dice).toHaveLength(4);
    expect(r.kept).toHaveLength(3);
    expect(r.total).toBeGreaterThanOrEqual(3);
    expect(r.total).toBeLessThanOrEqual(18);
    expect(r.total).toBe(r.kept.reduce((a, b) => a + b, 0));
    expect(r.kept).toEqual([...r.dice].sort((a, b) => b - a).slice(0, 3));
  }
});

it('keeps one row when two requests roll at once', async () => {
  const { id, agent } = await signIn('Racer');
  const [a, b] = await Promise.all([
    agent.post('/api/characters/ability-roll').send({}),
    agent.post('/api/characters/ability-roll').send({}),
  ]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(a.body.roll.id).toBe(b.body.roll.id);
  expect(await prisma.abilityRoll.count({ where: { userId: id } })).toBe(1);
});

it('refuses a campaign that does not allow rolling, but still returns an existing roll', async () => {
  const gm = await signIn('GM Closed');
  const player = await signIn('Player Closed');
  const campaignId = await campaignWith(gm.id, ['POINT_BUY'], [player.id]);

  const refused = await player.agent.post('/api/characters/ability-roll').send({ campaignId });
  expect(refused.status).toBe(403);
  expect((await player.agent.get('/api/characters/ability-roll').query({ campaignId })).body).toEqual({ roll: null });
  expect(await prisma.abilityRoll.count({ where: { userId: player.id } })).toBe(0);

  await prisma.abilityRoll.create({
    data: { userId: player.id, scope: campaignId, campaignId, rolls: [{ dice: [1, 2, 3, 4], kept: [4, 3, 2], total: 9 }] },
  });
  const got = await player.agent.get('/api/characters/ability-roll').query({ campaignId });
  expect(got.body.roll.rolls[0].total).toBe(9);
  const posted = await player.agent.post('/api/characters/ability-roll').send({ campaignId });
  expect(posted.status).toBe(200);
  expect(posted.body.roll.id).toBe(got.body.roll.id);
});

it('answers not found to someone outside the campaign', async () => {
  const gm = await signIn('GM Private');
  const outsider = await signIn('Outsider');
  const campaignId = await campaignWith(gm.id, ['ROLL']);
  expect((await outsider.agent.post('/api/characters/ability-roll').send({ campaignId })).status).toBe(404);
  expect((await outsider.agent.get('/api/characters/ability-roll').query({ campaignId })).status).toBe(404);
  expect((await outsider.agent.post('/api/characters/ability-roll').send({ campaignId: 'no-such-campaign' })).status).toBe(404);
});

it('writes six dice rolls to the campaign when rolling in one', async () => {
  const gm = await signIn('GM Rolls');
  const player = await signIn('Player Rolls');
  const campaignId = await campaignWith(gm.id, ['ROLL'], [player.id]);

  const first = await player.agent.post('/api/characters/ability-roll').send({ campaignId });
  expect(first.status).toBe(200);
  const rows = await prisma.diceRoll.findMany({ where: { campaignId, userId: player.id } });
  expect(rows).toHaveLength(6);
  expect(rows.every((r) => r.purpose === 'Atributos' && r.expression === '4d6kh3')).toBe(true);
  expect(rows.map((r) => r.result).sort()).toEqual(first.body.roll.rolls.map((r: Roll) => r.total).sort());

  await player.agent.post('/api/characters/ability-roll').send({ campaignId });
  expect(await prisma.diceRoll.count({ where: { campaignId, userId: player.id } })).toBe(6);
});

it('uses the roll up when a character is created from it, and only the caller\'s', async () => {
  const mine = await signIn('Creator');
  const other = await signIn('Bystander');
  const roll = (await mine.agent.post('/api/characters/ability-roll').send({})).body.roll;
  const theirs = (await other.agent.post('/api/characters/ability-roll').send({})).body.roll;

  const created = await mine.agent.post('/api/characters').send({ name: 'Built From Roll', abilityRollId: theirs.id });
  expect(created.status).toBe(201);
  expect(await prisma.abilityRoll.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  expect(await prisma.abilityRoll.findUnique({ where: { id: roll.id } })).not.toBeNull();

  expect((await mine.agent.post('/api/characters').send({ name: 'Second', abilityRollId: roll.id })).status).toBe(201);
  expect(await prisma.abilityRoll.findUnique({ where: { id: roll.id } })).toBeNull();
  const next = (await mine.agent.post('/api/characters/ability-roll').send({})).body.roll;
  expect(next.id).not.toBe(roll.id);
});

/** A sheet the guided creation built (the frontend's buildSheet test writes it). */
const guidedSheet: unknown = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets/clerigo.json'), 'utf8'),
);

it('uses up only a roll made for the scope the character is created in', async () => {
  const gm = await signIn('GM Scopes');
  const player = await signIn('Player Scopes');
  const campaignId = await campaignWith(gm.id, ['ROLL'], [player.id]);
  const inCampaign = (await player.agent.post('/api/characters/ability-roll').send({ campaignId })).body.roll;
  const outside = (await player.agent.post('/api/characters/ability-roll').send({})).body.roll;

  // A campaign's roll does not pay for a character made outside it, nor the other way round.
  expect((await player.agent.post('/api/characters').send({ name: 'Outside', abilityRollId: inCampaign.id })).status).toBe(201);
  expect(await prisma.abilityRoll.findUnique({ where: { id: inCampaign.id } })).not.toBeNull();
  const inside = await player.agent.post('/api/characters').send({ name: 'Inside', campaignId, data: guidedSheet, abilityRollId: outside.id });
  expect(inside.status).toBe(201);
  expect(await prisma.abilityRoll.findUnique({ where: { id: outside.id } })).not.toBeNull();

  expect((await player.agent.post('/api/characters').send({ name: 'Inside Too', campaignId, data: guidedSheet, abilityRollId: inCampaign.id })).status).toBe(201);
  expect(await prisma.abilityRoll.findUnique({ where: { id: inCampaign.id } })).toBeNull();
});
