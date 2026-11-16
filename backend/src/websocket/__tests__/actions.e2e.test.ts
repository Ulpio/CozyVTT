/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and socket payloads are JSON read loosely */
/**
 * The action bar's socket events. A player must never be sent a GM token's
 * AC, hit chance or the undo record, not in the live message, the update,
 * the answer, nor history. Requires PostgreSQL at DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createWsTestServer, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import type { Socket as ClientSocket } from 'socket.io-client';
import * as wsUtils from '../utils';

jest.setTimeout(30000);

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const BOOK = `p5a-ws-${randomUUID().slice(0, 8)}`;
const FORBIDDEN = ['ac', 'hitChance', 'undo', 'summary'];

function sheet(name: string): any {
  const raw = readFileSync(resolve(SHEETS, `${name}.json`), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK));
  return JSON.parse(raw);
}

/** Every key anywhere in a JSON value. */
function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, into));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      keysOf(v, into);
    }
  }
  return into;
}
const leaks = (value: unknown) => FORBIDDEN.filter((k) => keysOf(value).has(k));

const goblinStatBlock = {
  ac: 15,
  hpMax: 7,
  speed: '9 m',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  actions: [{ name: 'Cimitarra', description: 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.' }],
};
const token = (over: Record<string, unknown>): any => ({
  imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, ...over,
});

const freshTokens = () => [
  token({ id: 'fighter', name: 'Guerreira', position: { x: 10, y: 10 }, characterId: fighterId, controlledBy: p1Id, type: 'player' }),
  token({ id: 'cleric', name: 'Clérigo', position: { x: 11, y: 10 }, characterId: clericId, controlledBy: p2Id, type: 'player' }),
  token({ id: 'goblin', name: 'Goblin', position: { x: 11, y: 11 }, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
];

let server: WsTestServer;
let gmId: string, p1Id: string, p2Id: string, specId: string;
let campaignId: string, mapId: string, fighterId: string, clericId: string;
let cookies: Record<'gm' | 'p1' | 'p2' | 'spec', string>;
const open: ClientSocket[] = [];

async function connect(who: keyof typeof cookies) {
  const s = await server.connectAndAuth(cookies[who], campaignId);
  open.push(s);
  return s;
}

type Msg = { id: string; type: string; metadata: any; content: string };
const ofType = (s: ClientSocket, event: string, test: (m: any) => boolean = () => true) =>
  new Promise<any>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`no ${event}`)), 4000);
    s.on(event, function h(m: any) {
      if (!test(m)) return;
      clearTimeout(t);
      s.off(event, h);
      res(m);
    });
  });

const attack = () => ({ mapId, actorTokenId: 'fighter', actionId: 'attack:0', targetTokenId: 'goblin', mode: 'normal' });

beforeAll(async () => {
  const users = await Promise.all(['GM', 'P1', 'P2', 'Spec'].map((n) => createTestUser({ displayName: `P5a ws ${n}` })));
  [gmId, p1Id, p2Id, specId] = users.map((u) => u.id);
  campaignId = (await createTestCampaign(gmId, { name: 'P5a ws', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: specId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5a ws book', gameSystem: 'FIFTH_EDITION' } });
  await prisma.compendiumEntry.create({
    data: { bookId: BOOK, type: 'weapon', slug: 'espada-longa', name: 'Espada longa', search: 'espada longa', text: '', data: { range: 'melee', properties: ['versátil'], damage: { dice: '1d8', type: 'cortante' } } },
  });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  fighterId = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Guerreira', data: sheet('guerreiro') } })).id;
  clericId = (await prisma.character.create({ data: { userId: p2Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Clérigo', data: sheet('clerigo') } })).id;
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: 100, gridSize: 50, feetPerSquare: 5, diagonalRule: 'flat', annotations: [],
      tokens: freshTokens(),
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  const [gm, p1, p2, spec] = await Promise.all([gmId, p1Id, p2Id, specId].map((id) => server.loginAs(id)));
  cookies = { gm, p1, p2, spec };
});

afterEach(async () => {
  while (open.length) open.pop()!.close();
  await prisma.message.deleteMany({ where: { campaignId } });
  await prisma.map.update({ where: { id: mapId }, data: { tokens: freshTokens() } });
  await prisma.character.update({ where: { id: fighterId }, data: { data: sheet('guerreiro') } });
});

afterAll(async () => {
  await server?.close();
  await prisma.message.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await prisma.compendiumBook.delete({ where: { id: BOOK } });
  await cleanupUsers([gmId, p1Id, p2Id, specId]);
  await prisma.$disconnect();
});

describe('action.resolve', () => {
  it('sends the GM the whole card and a player the projected one, live', async () => {
    const [gm, p1, p2] = await Promise.all([connect('gm'), connect('p1'), connect('p2')]);
    const isAction = (m: Msg) => m.type === 'CHARACTER_ACTION';
    const [toGm, toP1, toP2] = [ofType(gm, 'chat.message', isAction), ofType(p1, 'chat.message', isAction), ofType(p2, 'chat.message', isAction)];

    const answer = await p1.timeout(5000).emitWithAck('action.resolve', attack());

    expect(answer).toEqual({ ok: true, messageId: expect.any(String) });
    expect(leaks(answer)).toEqual([]);
    const [g, a, b] = await Promise.all([toGm, toP1, toP2]);
    expect(g.id).toBe(answer.messageId);
    expect(g.metadata).toMatchObject({ kind: 'action', undo: expect.any(Object) });
    expect(g.metadata.targets[0]).toMatchObject({ ac: 15 });
    expect(g.metadata.targets[0]).toHaveProperty('hitChance');
    for (const m of [a, b]) {
      expect(m.metadata.kind).toBe('action');
      expect(leaks(m.metadata)).toEqual([]);
      expect(m.userId).toBe(p1Id);
    }
  });

  it('sends a spectator the projected card too', async () => {
    const [p1, spec] = await Promise.all([connect('p1'), connect('spec')]);
    const toSpec = ofType(spec, 'chat.message', (m) => m.type === 'CHARACTER_ACTION');
    await p1.timeout(5000).emitWithAck('action.resolve', attack());
    expect(leaks((await toSpec).metadata)).toEqual([]);
  });

  it('refuses a malformed payload through the answer, and stores nothing', async () => {
    const p1 = await connect('p1');
    const bad = [
      { ...attack(), mode: 'sideways' },
      { ...attack(), slotLevel: 10 },
      { ...attack(), actionId: 'x'.repeat(201) },
      { ...attack(), mapId: 'x'.repeat(65) },
      { ...attack(), grip: 'three' },
      null,
    ];
    for (const payload of bad) {
      const answer = await p1.timeout(3000).emitWithAck('action.resolve', payload);
      expect(answer).toMatchObject({ ok: false, error: expect.any(String) });
    }
    expect(await prisma.message.count({ where: { campaignId } })).toBe(0);
  });

  it('refuses a spectator, and a token that is not the player\'s', async () => {
    const [spec, p2] = await Promise.all([connect('spec'), connect('p2')]);
    expect(await spec.timeout(3000).emitWithAck('action.resolve', attack())).toMatchObject({ ok: false, error: 'Spectators cannot use actions' });
    expect(await p2.timeout(3000).emitWithAck('action.resolve', attack())).toMatchObject({ ok: false, error: 'Not your token' });
  });
});

describe('announcing', () => {
  it('answers ok once the action is stored, even when telling the table fails', async () => {
    // The GM acts, so this file's player stays under the one-second resolve ceiling.
    const gm = await connect('gm');
    const spy = jest.spyOn(wsUtils, 'campaignSockets').mockRejectedValueOnce(new Error('socket lookup failed'));
    try {
      const answer = await gm.timeout(5000).emitWithAck('action.resolve', attack());
      expect(answer).toEqual({ ok: true, messageId: expect.any(String) });
      expect(await prisma.message.count({ where: { campaignId, id: answer.messageId } })).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

});

describe('action.list', () => {
  it('lists a player their own actions, and gives the GM the NPC summary alone', async () => {
    const [p1, gm] = await Promise.all([connect('p1'), connect('gm')]);
    const mine = await p1.timeout(3000).emitWithAck('action.list', { mapId, actorTokenId: 'fighter' });
    expect(mine.options.length).toBeGreaterThan(0);
    expect(leaks(mine)).toEqual([]);
    const npc = await gm.timeout(3000).emitWithAck('action.list', { mapId, actorTokenId: 'goblin' });
    expect(npc.options.some((o: any) => typeof o.summary === 'string')).toBe(true);
    expect(await p1.timeout(3000).emitWithAck('action.list', { mapId, actorTokenId: 'goblin' })).toMatchObject({ ok: false });
  });

  it('refuses a spectator and a malformed request', async () => {
    const [spec, p1] = await Promise.all([connect('spec'), connect('p1')]);
    expect(await spec.timeout(3000).emitWithAck('action.list', { mapId, actorTokenId: 'fighter' })).toMatchObject({ ok: false });
    expect(await p1.timeout(3000).emitWithAck('action.list', { mapId })).toMatchObject({ ok: false, error: expect.any(String) });
  });
});

describe('history', () => {
  async function agentFor(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const agent = request.agent(createTestApp());
    expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
    return agent;
  }

  it('serves a player the projected card and the GM the stored one', async () => {
    const p1 = await connect('p1');
    const { messageId } = await p1.timeout(5000).emitWithAck('action.resolve', attack());
    for (const [who, full] of [[p1Id, false], [p2Id, false], [gmId, true]] as const) {
      const agent = await agentFor(who);
      const res = await agent.get(`/api/campaigns/${campaignId}/messages`);
      expect(res.status).toBe(200);
      const card = res.body.messages.find((m: any) => m.id === messageId).metadata;
      expect(card.kind).toBe('action');
      if (full) expect(card.undo).toBeDefined();
      else expect(leaks(card)).toEqual([]);
    }
  });
});

describe('action.undo', () => {
  it('refuses a player, then the GM undoes it and each reader gets their own update', async () => {
    const [gm, p1] = await Promise.all([connect('gm'), connect('p1')]);
    const { messageId } = await p1.timeout(5000).emitWithAck('action.resolve', attack());

    expect(await p1.timeout(3000).emitWithAck('action.undo', { messageId })).toMatchObject({ ok: false, error: 'GM only' });

    const [toGm, toP1] = [ofType(gm, 'chat.message.updated'), ofType(p1, 'chat.message.updated')];
    const answer = await gm.timeout(5000).emitWithAck('action.undo', { messageId });
    expect(answer).toMatchObject({ ok: true });
    expect(leaks(answer)).toEqual([]);
    expect(Object.keys(answer)).not.toContain('card');
    const [g, p] = await Promise.all([toGm, toP1]);
    expect(g).toMatchObject({ id: messageId, metadata: { undoneAt: expect.any(String), undo: expect.any(Object) } });
    expect(p.id).toBe(messageId);
    expect(p.metadata.undoneAt).toEqual(expect.any(String));
    expect(leaks(p.metadata)).toEqual([]);
  });

  it('refuses a malformed payload', async () => {
    const gm = await connect('gm');
    expect(await gm.timeout(3000).emitWithAck('action.undo', {})).toMatchObject({ ok: false, error: expect.any(String) });
  });
});

describe('action.concentration', () => {
  it('posts the small card to everyone and re-sends the original card per reader', async () => {
    const card = {
      kind: 'action',
      actor: { tokenId: 'goblin', name: 'Goblin' },
      actionName: 'Cimitarra',
      mode: 'normal',
      targets: [{ tokenId: 'cleric', name: 'Clérigo', isCharacter: true, ownerUserId: p2Id, showHpBar: false, ac: 16, hpBefore: 20, hpAfter: 10, hpMax: 20, concentrationCheckDc: 10 }],
      undo: { mapId, hp: [{ tokenId: 'cleric', characterId: clericId, before: { current: 20, temp: 0 }, after: { current: 10, temp: 0 } }] },
    };
    const original = await prisma.message.create({ data: { campaignId, userId: gmId, type: 'CHARACTER_ACTION', content: 'Goblin → Clérigo: Cimitarra', metadata: card as any } });
    const [gm, p1, p2] = await Promise.all([connect('gm'), connect('p1'), connect('p2')]);
    const isSmall = (m: Msg) => m.metadata?.kind === 'concentration';
    const [smallP1, updP1, updGm] = [ofType(p1, 'chat.message', isSmall), ofType(p1, 'chat.message.updated'), ofType(gm, 'chat.message.updated')];

    expect(await p1.timeout(3000).emitWithAck('action.concentration', { messageId: original.id, targetTokenId: 'cleric' })).toMatchObject({ ok: false, error: 'Not your token' });
    const answer = await p2.timeout(5000).emitWithAck('action.concentration', { messageId: original.id, targetTokenId: 'cleric' });

    expect(answer).toMatchObject({ ok: true, messageId: expect.any(String) });
    expect(Object.keys(answer)).not.toContain('actionCard');
    expect(leaks(answer)).toEqual([]);
    const small = await smallP1;
    expect(small.id).toBe(answer.messageId);
    expect(small.metadata).toMatchObject({ kind: 'concentration', dc: 10 });
    const [p, g] = await Promise.all([updP1, updGm]);
    expect(p.id).toBe(original.id);
    expect(leaks(p.metadata)).toEqual([]);
    expect(g.metadata.undo).toBeDefined();
    expect(g.metadata.targets[0].concentrationRolledAt).toEqual(expect.any(String));

    expect(await p2.timeout(3000).emitWithAck('action.concentration', { messageId: original.id, targetTokenId: 'cleric' })).toMatchObject({ ok: false, error: 'Already rolled' });
    await expectNoEvent(p1, 'chat.message.updated', 200);
  });
});

describe('saves, areas and recharge', () => {
  // A GM creature whose breath (reworded, in the book's shape) leaves it in a cone.
  const drakeBlock = {
    ac: 14,
    hpMax: 40,
    abilities: { str: 14, dex: 12, con: 14, int: 6, wis: 10, cha: 8 },
    actions: [{
      name: 'Sopro Gélido (Recarrega 6)',
      description: 'A criatura sopra gelo num cone de 9 metros. Cada criatura na área faz um teste de resistência de Constituição CD 12; em caso de falha sofre 10 (3d6) de dano de frio, e em caso de sucesso sofre metade desse dano.',
    }],
  };
  const SECRET = 'lurker-goblin';
  /** The drake at (20,10) breathes west over the cleric and a hidden goblin; the fighter is out of reach. */
  async function breathTable() {
    await prisma.map.update({
      where: { id: mapId },
      data: {
        tokens: [
          ...freshTokens().filter((t: any) => t.id !== 'cleric'),
          token({ id: 'cleric', name: 'Clérigo', position: { x: 18, y: 10 }, characterId: clericId, controlledBy: p2Id, type: 'player' }),
          token({ id: SECRET, name: 'Goblin Espreitador', position: { x: 17, y: 11 }, visible: false, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
          token({ id: 'drake', name: 'Draco', position: { x: 20, y: 10 }, type: 'npc', hp: { current: 40, max: 40, temp: 0 }, statBlock: drakeBlock }),
        ],
      },
    });
  }
  const breath = () => ({ mapId, actorTokenId: 'drake', actionId: 'npc:actions:0', mode: 'normal', area: { anchor: { x: 10 * 50 + 25, y: (100 - 10 - 0.5) * 50 } } });
  const secretLeaks = (value: unknown) => [
    ...leaks(value),
    ...['bonus', 'controllerUserIds', 'concealed', 'seenBy', 'recharge', 'undoSkipped'].filter((k) => keysOf(value).has(k)),
    ...(JSON.stringify(value ?? null).includes(SECRET) ? [SECRET] : []),
  ];

  it('sends players a breath card without the hidden goblin, lists the pending save to its player alone, and lets only that player roll it', async () => {
    await breathTable();
    const [gm, p1, p2] = await Promise.all([connect('gm'), connect('p1'), connect('p2')]);
    const isAction = (m: Msg) => m.type === 'CHARACTER_ACTION';
    const [toGm, toP1] = [ofType(gm, 'chat.message', isAction), ofType(p1, 'chat.message', isAction)];
    const answer = await gm.timeout(5000).emitWithAck('action.resolve', breath());
    expect(answer).toEqual({ ok: true, messageId: expect.any(String) });
    const [g, a] = await Promise.all([toGm, toP1]);
    expect(g.metadata.targets.map((t: any) => t.tokenId).sort()).toEqual(['cleric', SECRET]);
    expect(a.metadata.targets.map((t: any) => t.tokenId)).toEqual(['cleric']);
    expect(a.metadata.pendingSaves).toBe(1);
    expect(secretLeaks(a.metadata)).toEqual([]);
    expect(a.content).not.toContain('Espreitador');

    const mine = await p1.timeout(3000).emitWithAck('action.pendingSaves', {});
    expect(mine).toEqual({ ok: true, pending: [] });
    const theirs = await p2.timeout(3000).emitWithAck('action.pendingSaves');
    expect(theirs.pending).toHaveLength(1);
    expect(theirs.pending[0].messageId).toBe(answer.messageId);
    expect(theirs.pending[0].card.targets[0].yourSave).toBe(true);
    expect(secretLeaks(theirs)).toEqual([]);

    expect(await p1.timeout(3000).emitWithAck('action.save', { messageId: answer.messageId, targetTokenId: 'cleric', mode: 'normal' }))
      .toMatchObject({ ok: false, error: 'Not your token' });
    expect(await p2.timeout(3000).emitWithAck('action.saveRemaining', { messageId: answer.messageId })).toMatchObject({ ok: false, error: 'GM only' });
    const updP1 = ofType(p1, 'chat.message.updated');
    const rolled = await p2.timeout(5000).emitWithAck('action.save', { messageId: answer.messageId, targetTokenId: 'cleric', mode: 'advantage' });
    expect(rolled).toEqual({ ok: true });
    const upd = await updP1;
    expect(upd.id).toBe(answer.messageId);
    expect(upd.metadata.targets[0].save).toMatchObject({ status: 'rolled', mode: 'advantage', total: expect.any(Number) });
    expect(upd.metadata.pendingSaves).toBe(0);
    expect(secretLeaks(upd.metadata)).toEqual([]);
    expect(await p2.timeout(3000).emitWithAck('action.save', { messageId: answer.messageId, targetTokenId: 'cleric', mode: 'normal' }))
      .toMatchObject({ ok: false, error: 'Already rolled' });
    expect(await p2.timeout(3000).emitWithAck('action.pendingSaves', {})).toEqual({ ok: true, pending: [] });
  });

  it('lets the GM roll the rest and undo one target, and refuses players', async () => {
    await breathTable();
    const [gm, p1] = await Promise.all([connect('gm'), connect('p1')]);
    const { messageId } = await gm.timeout(5000).emitWithAck('action.resolve', breath());
    expect(await p1.timeout(3000).emitWithAck('action.undoTarget', { messageId, targetTokenId: 'cleric' })).toMatchObject({ ok: false, error: 'GM only' });
    const updP1 = ofType(p1, 'chat.message.updated');
    expect(await gm.timeout(5000).emitWithAck('action.saveRemaining', { messageId })).toEqual({ ok: true });
    expect((await updP1).metadata.pendingSaves).toBe(0);
    const updAgain = ofType(p1, 'chat.message.updated');
    const undone = await gm.timeout(5000).emitWithAck('action.undoTarget', { messageId, targetTokenId: SECRET });
    expect(undone).toMatchObject({ ok: true, partial: false });
    const upd = await updAgain;
    expect(secretLeaks(upd.metadata)).toEqual([]);
    expect(await gm.timeout(3000).emitWithAck('action.undoTarget', { messageId, targetTokenId: SECRET })).toMatchObject({ ok: false, error: 'Already undone' });
  });

  it('lets the GM roll and reset a spent recharge, and posts the roll', async () => {
    await breathTable();
    const [gm, p1] = await Promise.all([connect('gm'), connect('p1')]);
    await gm.timeout(5000).emitWithAck('action.resolve', breath());
    expect(await gm.timeout(3000).emitWithAck('action.resolve', breath())).toMatchObject({ ok: false, error: 'This action is spent until it recharges' });
    const recharge = { mapId, tokenId: 'drake', optionId: 'npc:actions:0' };
    expect(await p1.timeout(3000).emitWithAck('action.recharge', recharge)).toMatchObject({ ok: false, error: 'GM only' });
    expect(await p1.timeout(3000).emitWithAck('action.rechargeReset', recharge)).toMatchObject({ ok: false, error: 'GM only' });
    const posted = ofType(p1, 'chat.message', (m: Msg) => m.metadata?.kind === 'recharge');
    const rolled = await gm.timeout(5000).emitWithAck('action.recharge', recharge);
    expect(rolled).toMatchObject({ ok: true, messageId: expect.any(String), d6: expect.any(Number), recharged: expect.any(Boolean) });
    expect((await posted).metadata).toMatchObject({ kind: 'recharge', name: 'Draco', min: 6, d6: rolled.d6 });
    if (!rolled.recharged) expect(await gm.timeout(3000).emitWithAck('action.rechargeReset', recharge)).toEqual({ ok: true });
    expect(await gm.timeout(3000).emitWithAck('action.rechargeReset', recharge)).toMatchObject({ ok: false, error: 'This action is not spent' });
  });

  it("resends the map when a breath catches only player characters, and when it is undone, so the GM's button follows", async () => {
    await breathTable();
    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
    await prisma.map.update({ where: { id: mapId }, data: { tokens: (map.tokens as any[]).filter((t) => t.id !== SECRET) } });
    const gm = await connect('gm');
    const drakeIn = (m: any) => m.mapData.tokens.find((t: any) => t.id === 'drake');
    const spent = ofType(gm, 'map.changed', (m: any) => m.mapId === mapId && drakeIn(m)?.rechargeSpent?.includes('npc:actions:0'));
    const { messageId } = await gm.timeout(5000).emitWithAck('action.resolve', breath());
    await spent;
    const back = ofType(gm, 'map.changed', (m: any) => m.mapId === mapId && !(drakeIn(m)?.rechargeSpent ?? []).includes('npc:actions:0'));
    expect(await gm.timeout(5000).emitWithAck('action.undo', { messageId })).toMatchObject({ ok: true });
    await back;
  });

  it('keeps the recharge roll of a hidden creature to the GM alone', async () => {
    await breathTable();
    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
    await prisma.map.update({ where: { id: mapId }, data: { tokens: (map.tokens as any[]).map((t) => (t.id === 'drake' ? { ...t, visible: false } : t)) } });
    const [gm, p1] = await Promise.all([connect('gm'), connect('p1')]);
    await gm.timeout(5000).emitWithAck('action.resolve', breath());
    const toGm = ofType(gm, 'chat.message', (m: Msg) => m.metadata?.kind === 'recharge');
    const rolled = await gm.timeout(5000).emitWithAck('action.recharge', { mapId, tokenId: 'drake', optionId: 'npc:actions:0' });
    expect(rolled).toMatchObject({ ok: true, messageId: expect.any(String) });
    const g = await toGm;
    expect(g).toMatchObject({ type: 'WHISPER', recipientId: gmId, metadata: { kind: 'recharge', name: 'Draco' } });
    await expectNoEvent(p1, 'chat.message', 300);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: p1Id } });
    const agent = request.agent(createTestApp());
    expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
    const history = await agent.get(`/api/campaigns/${campaignId}/messages`);
    expect(history.body.messages.some((m: any) => m.id === rolled.messageId)).toBe(false);
    expect(JSON.stringify(history.body)).not.toContain('Draco');
  });

  it('refuses an area sent with target ids, and malformed save payloads', async () => {
    await breathTable();
    const gm = await connect('gm');
    expect(await gm.timeout(3000).emitWithAck('action.resolve', { ...breath(), targetTokenIds: ['cleric'] })).toMatchObject({ ok: false, error: 'Invalid target' });
    const bad = [
      { ...breath(), area: { anchor: { x: 'a', y: 1 } } },
      { ...breath(), area: {} },
      { ...attack(), targetTokenIds: [] },
      { ...attack(), targetTokenIds: Array.from({ length: 21 }, (_, i) => `t${i}`) },
    ];
    for (const payload of bad) expect(await gm.timeout(3000).emitWithAck('action.resolve', payload)).toMatchObject({ ok: false, error: expect.any(String) });
    for (const [event, payload] of [
      ['action.save', { messageId: 'x', targetTokenId: 'y', mode: 'sideways' }],
      ['action.save', { messageId: 'x' }],
      ['action.saveRemaining', {}],
      ['action.undoTarget', { messageId: 'x' }],
      ['action.recharge', { mapId }],
      ['action.rechargeReset', { tokenId: 'drake' }],
    ] as const) {
      expect(await gm.timeout(3000).emitWithAck(event, payload)).toMatchObject({ ok: false, error: expect.any(String) });
    }
    expect(await prisma.message.count({ where: { campaignId } })).toBe(0);
  });

  it('refuses spectators the save events', async () => {
    const spec = await connect('spec');
    for (const event of ['action.save', 'action.saveRemaining', 'action.undoTarget', 'action.pendingSaves', 'action.recharge', 'action.rechargeReset']) {
      expect(await spec.timeout(3000).emitWithAck(event, {})).toMatchObject({ ok: false, error: 'Spectators cannot use actions' });
    }
  });
});
