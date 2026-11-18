/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * Short and long rests: what each gives back (pools by when they recover,
 * a warlock's slots, hit points, slots, hit dice), the states a long rest
 * ends, who may rest whom, the refusal during a fight, one card for many
 * characters, and the GM's undo. The class entries are invented minimal ones
 * (no book text) under a book of this file's own. Requires PostgreSQL at
 * DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { undoAction } from '../actionResolver';
import { takeRest } from '../rest';
import { beginTurn, clearState, flushCombatWrites, setState, type CombatantEntry } from '../../websocket/initiativeState';
import type { Viewer } from '../../rules/actions/actionCard';

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const BOOK = `p5c-rest-${randomUUID().slice(0, 8)}`;
const COMBAT = 'Não dá para descansar durante o combate.';

function sheet(name: string): any {
  const raw = readFileSync(resolve(SHEETS, `${name}.json`), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK));
  return JSON.parse(raw);
}

const feature = (name: string, level: number, action: Record<string, unknown>) => ({ name, description: 'Inventada.', level, mechanics: { action } });

const CLASSES: Record<string, { name: string; features: unknown[] }> = {
  barbaro: {
    name: 'Bárbaro',
    features: [
      feature('Fúria', 1, {
        key: 'rage', kind: 'state', cost: 'bonus', stateName: 'Fúria',
        resources: [{ key: 'rage', max: 3, recovers: 'long' }], spends: { key: 'rage' },
      }),
    ],
  },
  monge: {
    name: 'Monge',
    features: [feature('Ki', 2, { key: 'ki', kind: 'none', reason: 'Só a reserva.', resources: [{ key: 'ki', max: 'classLevel', recovers: 'short' }] })],
  },
  guerreiro: { name: 'Guerreiro', features: [] },
};

const token = (over: Record<string, unknown>): any => ({
  imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, ...over,
});

const HEROES: Record<string, string> = { barb: 'barbaro', fighter: 'guerreiro', monk: 'monge', warlock: 'bruxo' };

let gmId: string;
let p1Id: string;
let p2Id: string;
let campaignId: string;
let mapId: string;
let gm: Viewer;
let p1: Viewer;
let p2: Viewer;
const ids: Record<string, string> = {};
let otherId: string;

const data = async (who: string): Promise<any> => (await prisma.character.findUniqueOrThrow({ where: { id: ids[who] } })).data;
async function setSheet(who: string, change: (s: any) => void) {
  const s = await data(who);
  change(s);
  await prisma.character.update({ where: { id: ids[who] }, data: { data: s } });
}
const combatant = (tokenId: string): CombatantEntry => ({
  tokenId, mapId, name: tokenId, imageUrl: '', initiative: 10, hp: null, type: 'player', disposition: null, characterId: null,
});

function ok<T extends { ok: boolean }>(out: T): Extract<T, { ok: true }> {
  if (!out.ok) throw new Error(`expected success, got ${(out as any).error}`);
  return out as Extract<T, { ok: true }>;
}

beforeAll(async () => {
  const users = await Promise.all(['GM', 'P1', 'P2'].map((n) => createTestUser({ displayName: `P5c rest ${n}` })));
  [gmId, p1Id, p2Id] = users.map((u) => u.id);
  gm = { role: 'GM', userId: gmId };
  p1 = { role: 'PLAYER', userId: p1Id };
  p2 = { role: 'PLAYER', userId: p2Id };
  campaignId = (await createTestCampaign(gmId, { name: 'P5c rests', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5c rest test book', gameSystem: 'FIFTH_EDITION' } });
  await prisma.compendiumEntry.createMany({
    data: Object.entries(CLASSES).map(([slug, c]) => ({
      bookId: BOOK, type: 'class', slug, name: c.name, search: c.name.toLowerCase(), text: 'Texto inventado.', data: { features: c.features } as object,
    })),
  });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  for (const [id, cls] of Object.entries(HEROES)) {
    ids[id] = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: id, data: sheet(cls) } })).id;
  }
  otherId = (await prisma.character.create({ data: { userId: p2Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'other', data: sheet('guerreiro') } })).id;
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: 100, gridSize: 50, feetPerSquare: 5, diagonalRule: 'flat', annotations: [], tokens: [] },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
});

beforeEach(async () => {
  await prisma.map.update({
    where: { id: mapId },
    data: { tokens: Object.keys(HEROES).map((id, i) => token({ id, name: id, position: { x: 10 + i, y: 10 }, characterId: ids[id], controlledBy: p1Id, type: 'player' })) },
  });
  for (const [id, cls] of Object.entries(HEROES)) await prisma.character.update({ where: { id: ids[id] }, data: { data: sheet(cls) } });
  await prisma.character.update({ where: { id: otherId }, data: { data: sheet('guerreiro') } });
  await prisma.message.deleteMany({ where: { campaignId } });
});

afterEach(async () => {
  clearState(campaignId);
  await flushCombatWrites(campaignId);
});

afterAll(async () => {
  await prisma.message.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await prisma.compendiumBook.delete({ where: { id: BOOK } });
  await cleanupUsers([gmId, p1Id, p2Id]);
  await prisma.$disconnect();
});

describe('a short rest', () => {
  it('gives back what recovers on a short rest: ki and the warlock slots, not the rage', async () => {
    await setSheet('monk', (s) => { s.featureUses = { ki: 2 }; });
    await setSheet('barb', (s) => { s.featureUses = { rage: 2 }; });
    await setSheet('warlock', (s) => { s.spellcasting.slots['2'] = { total: 2, expended: 2 }; s.spellcasting.slots['1'] = { total: 0, expended: 0 }; });
    ok(await takeRest(campaignId, p1, [ids.monk, ids.barb, ids.warlock], 'short'));
    expect((await data('monk')).featureUses?.ki ?? 0).toBe(0);
    expect((await data('barb')).featureUses).toEqual({ rage: 2 });
    expect((await data('warlock')).spellcasting.slots['2']).toEqual({ total: 2, expended: 0 });
  });

  it('does not heal, and leaves a running state alone', async () => {
    await setSheet('barb', (s) => { s.hp.current = 5; s.activeStates = [`feature:${BOOK}/barbaro/rage`]; });
    ok(await takeRest(campaignId, p1, [ids.barb], 'short'));
    const s = await data('barb');
    expect(s.hp.current).toBe(5);
    expect(s.activeStates).toHaveLength(1);
  });

  it('does not give a non-warlock its slots back', async () => {
    await setSheet('fighter', (s) => { s.spellcasting = { ...(s.spellcasting ?? {}), slots: { '1': { total: 2, expended: 2 } } }; });
    ok(await takeRest(campaignId, p1, [ids.fighter], 'short'));
    expect((await data('fighter')).spellcasting.slots['1']).toEqual({ total: 2, expended: 2 });
  });
});

describe('a long rest', () => {
  it('gives back hit points, slots, pools and hit dice, and ends the rage on the token', async () => {
    await setSheet('fighter', (s) => { s.hp.current = 3; s.hp.temporary = 6; s.hitDice[0].remaining = 1; s.spellcasting = { ...(s.spellcasting ?? {}), slots: { '1': { total: 2, expended: 2 } } }; });
    await setSheet('barb', (s) => { s.featureUses = { rage: 3 }; s.activeStates = [`feature:${BOOK}/barbaro/rage`]; });
    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
    const edited = (map.tokens as any[]).map((t) => (t.id === 'barb' ? { ...t, conditions: ['Fúria'] } : t));
    await prisma.map.update({ where: { id: mapId }, data: { tokens: edited } });

    const out = ok(await takeRest(campaignId, p1, [ids.fighter, ids.barb], 'long'));
    expect(out.messageId).toBeTruthy();
    const fighter = await data('fighter');
    expect(fighter.hp).toMatchObject({ current: 28, maximum: 28, temporary: 0 });
    expect(fighter.hitDice[0].remaining).toBe(2);
    expect(fighter.spellcasting.slots['1'].expended).toBe(0);
    const barb = await data('barb');
    expect(barb.featureUses?.rage ?? 0).toBe(0);
    expect(barb.activeStates).toEqual([]);
    const after = (await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).tokens as any[];
    expect(after.find((t) => t.id === 'barb').conditions).toEqual([]);
  });

  it('never gives back more hit dice than the pool holds', async () => {
    await setSheet('fighter', (s) => { s.hitDice[0].remaining = 3; });
    ok(await takeRest(campaignId, p1, [ids.fighter], 'long'));
    expect((await data('fighter')).hitDice[0].remaining).toBe(3);
  });
});

describe('who may rest, and when', () => {
  it('is refused while the fight is on', async () => {
    setState(campaignId, beginTurn({ active: true, round: 1, currentTokenId: null, combatants: [combatant('barb')] }, 'barb'));
    expect(await takeRest(campaignId, p1, [ids.barb], 'long')).toEqual({ ok: false, error: COMBAT });
    expect(await takeRest(campaignId, gm, [ids.barb], 'short')).toEqual({ ok: false, error: COMBAT });
  });

  it('refuses a player resting another player\'s character, and a spectator', async () => {
    const out = await takeRest(campaignId, p1, [ids.barb, otherId], 'long');
    expect(out.ok).toBe(false);
    expect((await takeRest(campaignId, p2, [ids.barb], 'long')).ok).toBe(false);
    expect((await takeRest(campaignId, { role: 'SPECTATOR', userId: p1Id }, [ids.barb], 'long')).ok).toBe(false);
    expect(await prisma.message.count({ where: { campaignId, type: 'CHARACTER_ACTION' } })).toBe(0);
  });

  it('lets the GM rest three at once, with one card', async () => {
    const out = ok(await takeRest(campaignId, gm, [ids.barb, ids.fighter, otherId], 'long'));
    const messages = await prisma.message.findMany({ where: { campaignId, type: 'CHARACTER_ACTION' } });
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(out.messageId);
    const card = messages[0].metadata as any;
    expect(card.actionName).toBe('Descanso longo');
  });

  it('names the short rest and what came back on the card', async () => {
    await setSheet('monk', (s) => { s.featureUses = { ki: 2 }; });
    const out = ok(await takeRest(campaignId, p1, [ids.monk], 'short'));
    expect(out.card.actionName).toBe('Descanso curto');
    expect(out.card.extraText).toContain('Ki 3/3');
  });
});

describe('undoing a rest', () => {
  it('puts back hit points, slots, uses, hit dice, the running state and its condition', async () => {
    await setSheet('barb', (s) => { s.hp.current = 4; s.hitDice[0].remaining = 0; s.featureUses = { rage: 3 }; s.activeStates = [`feature:${BOOK}/barbaro/rage`]; });
    await setSheet('warlock', (s) => { s.spellcasting.slots['1'] = { total: 2, expended: 2 }; });
    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
    await prisma.map.update({ where: { id: mapId }, data: { tokens: (map.tokens as any[]).map((t) => (t.id === 'barb' ? { ...t, conditions: ['Fúria'] } : t)) } });

    const out = ok(await takeRest(campaignId, gm, [ids.barb, ids.warlock], 'long'));
    expect((await data('barb')).hp.current).toBe(32);
    expect(ok(await undoAction(campaignId, gm, out.messageId)).card.undoneAt).toBeTruthy();

    const barb = await data('barb');
    expect(barb.hp.current).toBe(4);
    expect(barb.hitDice[0].remaining).toBe(0);
    expect(barb.featureUses).toEqual({ rage: 3 });
    expect(barb.activeStates).toEqual([`feature:${BOOK}/barbaro/rage`]);
    expect((await data('warlock')).spellcasting.slots['1']).toEqual({ total: 2, expended: 2 });
    const after = (await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).tokens as any[];
    expect(after.find((t) => t.id === 'barb').conditions).toEqual(['Fúria']);
  });
});
