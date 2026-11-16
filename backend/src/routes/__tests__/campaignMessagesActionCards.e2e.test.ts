/**
 * GET /api/campaigns/:campaignId/messages — action cards in history.
 *
 * The stored card is the GM's. A player, a spectator and anyone else who
 * reads history is sent it projected: no AC, hit chance or undo record.
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

const card = {
  kind: 'action',
  actor: { tokenId: 'a', name: 'Goblin' },
  actionName: 'Cimitarra',
  mode: 'normal',
  targets: [{ tokenId: 't', name: 'Guerreira', isCharacter: true, ownerUserId: 'x', showHpBar: false, ac: 18, hitChance: 0.4, hpBefore: 20, hpAfter: 16, hpMax: 28 }],
  undo: { hp: [{ tokenId: 't', before: { current: 20, temp: 0 }, after: { current: 16, temp: 0 } }] },
};
const concentration = { kind: 'concentration', actionMessageId: 'm', tokenId: 't', name: 'Guerreira', dc: 10, d20: 12, bonus: 2, total: 14, kept: true };

describe('chat history with action cards', () => {
  let gmId: string, playerId: string, specId: string, campaignId: string, actionId: string, concId: string;
  const agents: Record<string, ReturnType<typeof request.agent>> = {};

  beforeAll(async () => {
    const users = await Promise.all(['GM', 'Player', 'Spec'].map((n) => createTestUser({ displayName: `Hist ${n}` })));
    [gmId, playerId, specId] = users.map((u) => u.id);
    campaignId = (await createTestCampaign(gmId, { name: 'Action history' })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: gmId, role: 'GM', characterIds: [] },
        { campaignId, userId: playerId, role: 'PLAYER', characterIds: [] },
        { campaignId, userId: specId, role: 'SPECTATOR', characterIds: [] },
      ],
    });
    const make = (metadata: object) =>
      prisma.message.create({ data: { campaignId, userId: gmId, type: 'CHARACTER_ACTION', content: 'x', metadata: metadata as never } });
    actionId = (await make(card)).id;
    concId = (await make(concentration)).id;
    for (const [name, user] of [['gm', gmId], ['player', playerId], ['spec', specId]] as const) {
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user } });
      agents[name] = request.agent(app);
      expect((await agents[name].post('/api/auth/login').send({ email: row.email, password: TEST_PASSWORD })).status).toBe(200);
    }
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([gmId, playerId, specId]);
    await prisma.$disconnect();
  });

  const read = async (who: string, id: string) => {
    const res = await agents[who].get(`/api/campaigns/${campaignId}/messages`);
    expect(res.status).toBe(200);
    return res.body.messages.find((m: { id: string }) => m.id === id).metadata;
  };

  it('gives the GM the stored card whole', async () => {
    expect(await read('gm', actionId)).toEqual(card);
  });

  it.each(['player', 'spec'])('gives a %s the projected card', async (who) => {
    const metadata = await read(who, actionId);
    const text = JSON.stringify(metadata);
    expect(metadata.kind).toBe('action');
    expect(text).not.toMatch(/"(ac|hitChance|undo|hpBefore|hpAfter|hpMax|ownerUserId)"/);
  });

  it('leaves the concentration card as it is for everyone', async () => {
    for (const who of ['gm', 'player', 'spec']) expect(await read(who, concId)).toEqual(concentration);
  });
});
