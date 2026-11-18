/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * Class feature buttons on the bar: a state that runs until it is ended
 * (Rage), a heal from dice or from a pool (Second Wind, Lay on Hands), an
 * extra action (Action Surge), unarmed attacks after the Attack action
 * (Flurry of Blows) and common actions taken as a bonus action (Cunning
 * Action), each spending its pool and its share of the turn, and each taken
 * back by the GM's undo. The class entries are invented minimal ones (no book
 * text) under a book of this file's own. Requires PostgreSQL at DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { resolveAction, listActions, undoAction, type ActionRequest } from '../actionResolver';
import { endAllStates } from '../actionResolver/features';
import { beginTurn, clearState, flushCombatWrites, freshSpend, getState, setState, type CombatantEntry } from '../../websocket/initiativeState';
import type { Viewer } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const BOOK = `p5c-feat-${randomUUID().slice(0, 8)}`;
const NO_USES = 'Sem usos restantes.';

/** Rolls these numbers in order, whatever the die; no numbers means nothing may be rolled. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('ran out of seeded rolls');
    return values[i++];
  };
}

function sheet(name: string): any {
  const raw = readFileSync(resolve(SHEETS, `${name}.json`), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK));
  return JSON.parse(raw);
}

const feature = (name: string, level: number, action: Record<string, unknown>) => ({ name, description: 'Inventada.', level, mechanics: { action } });

/** Invented class entries with the slugs the fixture sheets point at. */
const CLASSES: Record<string, { name: string; features: unknown[] }> = {
  barbaro: {
    name: 'Bárbaro',
    features: [
      feature('Ira Inventada', 1, {
        key: 'rage', kind: 'state', cost: 'bonus', stateName: 'Fúria',
        resources: [{ key: 'rage', max: { '1': 2, '3': 3 }, recovers: 'long' }], spends: { key: 'rage' }, damageBonus: { '1': 2 },
      }),
    ],
  },
  guerreiro: {
    name: 'Guerreiro',
    features: [
      feature('Fôlego Inventado', 1, {
        key: 'second-wind', kind: 'heal', cost: 'bonus', resources: [{ key: 'second-wind', max: 1, recovers: 'short' }],
        spends: { key: 'second-wind' }, dice: { '1': '1d10' }, addClassLevel: true,
      }),
      feature('Surto Inventado', 2, {
        key: 'action-surge', kind: 'extraAction', cost: 'none', resources: [{ key: 'action-surge', max: 1, recovers: 'short' }], spends: { key: 'action-surge' },
      }),
    ],
  },
  monge: {
    name: 'Monge',
    features: [
      feature('Energia Inventada', 2, { key: 'ki', kind: 'none', reason: 'Só a reserva.', resources: [{ key: 'ki', max: 'classLevel', recovers: 'short' }] }),
      feature('Golpes Inventados', 2, {
        key: 'flurry-of-blows', kind: 'attacks', cost: 'bonus', label: 'Saraivada Inventada', spends: { key: 'ki' },
        attacks: { count: 2, unarmedDice: { '1': '1d4', '5': '1d6' }, requiresAttackAction: true },
      }),
    ],
  },
  paladino: {
    name: 'Paladino',
    features: [
      feature('Mãos Inventadas', 1, {
        key: 'lay-on-hands', kind: 'heal', cost: 'action', resources: [{ key: 'lay-on-hands', max: { perLevel: 5 }, recovers: 'long' }],
        spends: { key: 'lay-on-hands', chosen: true },
      }),
    ],
  },
  ladino: {
    name: 'Ladino',
    features: [feature('Astúcia Inventada', 2, { key: 'cunning-action', kind: 'makeBonus', cost: 'bonus', makeBonus: ['dash', 'disengage', 'hide'] })],
  },
};

const fid = (cls: string, key: string) => `feature:${BOOK}/${cls}/${key}`;
const RAGE = fid('barbaro', 'rage');
const SECOND_WIND = fid('guerreiro', 'second-wind');
const SURGE = fid('guerreiro', 'action-surge');
const FLURRY = fid('monge', 'flurry-of-blows');
const HANDS = fid('paladino', 'lay-on-hands');

let gmId: string;
let p1Id: string;
let campaignId: string;
let mapId: string;
const ids: Record<string, string> = {};
let gm: Viewer;
let p1: Viewer;

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

const HEROES: Record<string, { cls: string; at: { x: number; y: number } }> = {
  barb: { cls: 'barbaro', at: { x: 10, y: 10 } },
  fighter: { cls: 'guerreiro', at: { x: 11, y: 10 } },
  monk: { cls: 'monge', at: { x: 12, y: 10 } },
  paladin: { cls: 'paladino', at: { x: 10, y: 11 } },
  rogue: { cls: 'ladino', at: { x: 12, y: 11 } },
};

function tokens() {
  return [
    ...Object.entries(HEROES).map(([id, h]) => token({ id, name: h.cls, position: h.at, characterId: ids[id], controlledBy: p1Id, type: 'player' })),
    token({ id: 'goblin', name: 'Goblin', position: { x: 11, y: 11 }, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
    token({ id: 'far', name: 'Goblin longe', position: { x: 11, y: 40 }, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
  ];
}

async function mapToken(id: string): Promise<any> {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return (map.tokens as any[]).find((t) => t.id === id);
}
async function charData(tokenId: string): Promise<any> {
  return (await prisma.character.findUniqueOrThrow({ where: { id: ids[tokenId] } })).data;
}
async function setSheet(tokenId: string, change: (s: any) => void) {
  const s = await charData(tokenId);
  change(s);
  await prisma.character.update({ where: { id: ids[tokenId] }, data: { data: s } });
}

const req = (actorTokenId: string, actionId: string, over: Partial<ActionRequest> = {}): ActionRequest => ({
  mapId, actorTokenId, actionId, mode: 'normal', ...over,
});

const combatant = (tokenId: string, type: CombatantEntry['type']): CombatantEntry => ({
  tokenId, mapId, name: tokenId, imageUrl: '', initiative: 10, hp: null, type, disposition: null, characterId: null,
});

function startFight(current: string) {
  setState(campaignId, beginTurn({
    active: true, round: 1, currentTokenId: null,
    combatants: [...Object.keys(HEROES).map((id) => combatant(id, 'player')), combatant('goblin', 'npc')],
  }, current));
}

const spent = (tokenId: string) => getState(campaignId).spend[tokenId];

function ok(out: Awaited<ReturnType<typeof resolveAction>>) {
  if (!out.ok) throw new Error(`expected success, got ${out.error}`);
  return out;
}

beforeAll(async () => {
  const users = await Promise.all(['GM', 'P1'].map((n) => createTestUser({ displayName: `P5c feat ${n}` })));
  [gmId, p1Id] = users.map((u) => u.id);
  gm = { role: 'GM', userId: gmId };
  p1 = { role: 'PLAYER', userId: p1Id };
  campaignId = (await createTestCampaign(gmId, { name: 'P5c features', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5c features test book', gameSystem: 'FIFTH_EDITION' } });
  await prisma.compendiumEntry.createMany({
    data: Object.entries(CLASSES).map(([slug, c]) => ({
      bookId: BOOK, type: 'class', slug, name: c.name, search: c.name.toLowerCase(), text: 'Texto inventado.', data: { features: c.features } as object,
    })),
  });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  for (const [id, h] of Object.entries(HEROES)) {
    ids[id] = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: id, data: sheet(h.cls) } })).id;
  }
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: 100, gridSize: 50,
      feetPerSquare: 5, diagonalRule: 'flat', annotations: [], tokens: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
});

beforeEach(async () => {
  await prisma.map.update({ where: { id: mapId }, data: { tokens: tokens() } });
  for (const [id, h] of Object.entries(HEROES)) await prisma.character.update({ where: { id: ids[id] }, data: { data: sheet(h.cls) } });
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
  await cleanupUsers([gmId, p1Id]);
  await prisma.$disconnect();
});

describe('Rage, a state', () => {
  it('starts: spends a use and the bonus action, marks it running and gives the token its condition', async () => {
    startFight('barb');
    const out = ok(await resolveAction(campaignId, p1, req('barb', RAGE), seq()));
    expect(out.card.actionName).toBe('Ira Inventada');
    const data = await charData('barb');
    expect(data.featureUses).toEqual({ rage: 1 });
    expect(data.activeStates).toEqual([RAGE]);
    expect((await mapToken('barb')).conditions).toEqual(['Fúria']);
    expect(spent('barb').bonus).toBe(true);
    const listed = await listActions(campaignId, p1, mapId, 'barb');
    if ('error' in listed) throw new Error(listed.error);
    expect(listed.options.find((o) => o.id === RAGE)).toMatchObject({ active: true, uses: { left: 2, max: 3 } });
  });

  it('refuses a fourth Rage after three', async () => {
    await setSheet('barb', (s) => { s.featureUses = { rage: 3 }; });
    expect(await resolveAction(campaignId, p1, req('barb', RAGE), seq())).toEqual({ ok: false, error: NO_USES });
    expect((await charData('barb')).activeStates ?? []).toEqual([]);
  });

  it('ends when clicked while running, spending nothing, off turn and out of uses too', async () => {
    startFight('barb');
    ok(await resolveAction(campaignId, p1, req('barb', RAGE), seq()));
    await setSheet('barb', (s) => { s.featureUses = { rage: 3 }; });
    const state = getState(campaignId);
    setState(campaignId, { ...state, currentTokenId: 'fighter' });
    const before = spent('barb');
    ok(await resolveAction(campaignId, p1, req('barb', RAGE), seq()));
    const data = await charData('barb');
    expect(data.activeStates).toEqual([]);
    expect(data.featureUses).toEqual({ rage: 3 });
    expect((await mapToken('barb')).conditions).toEqual([]);
    expect(spent('barb')).toEqual(before);
  });

  it('is taken back by the undo: the use, the state, the condition and the bonus action', async () => {
    startFight('barb');
    const out = ok(await resolveAction(campaignId, p1, req('barb', RAGE), seq()));
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    const data = await charData('barb');
    expect(data.featureUses).toEqual({ rage: 0 });
    expect(data.activeStates).toEqual([]);
    expect((await mapToken('barb')).conditions).toEqual([]);
    expect(spent('barb').bonus).toBe(false);
  });

  it('comes back running when its end is undone', async () => {
    ok(await resolveAction(campaignId, p1, req('barb', RAGE), seq()));
    const ended = ok(await resolveAction(campaignId, p1, req('barb', RAGE), seq()));
    expect((await undoAction(campaignId, gm, ended.messageId)).ok).toBe(true);
    expect((await charData('barb')).activeStates).toEqual([RAGE]);
    expect((await mapToken('barb')).conditions).toEqual(['Fúria']);
  });

  it('ends with the fight', async () => {
    startFight('barb');
    ok(await resolveAction(campaignId, p1, req('barb', RAGE), seq()));
    await endAllStates(campaignId);
    expect((await charData('barb')).activeStates).toEqual([]);
    expect((await mapToken('barb')).conditions).toEqual([]);
  });
});

describe('Second Wind and Action Surge', () => {
  it('heals 1d10 plus the fighter level as a bonus action', async () => {
    await setSheet('fighter', (s) => { s.hp.current = 10; });
    startFight('fighter');
    const out = ok(await resolveAction(campaignId, p1, req('fighter', SECOND_WIND), seq(7)));
    expect(out.card.targets[0]).toMatchObject({ tokenId: 'fighter', healing: 10, hpBefore: 10, hpAfter: 20 });
    const data = await charData('fighter');
    expect(data.hp.current).toBe(20);
    expect(data.featureUses).toEqual({ 'second-wind': 1 });
    expect(spent('fighter').bonus).toBe(true);
    expect(await resolveAction(campaignId, p1, req('fighter', SECOND_WIND), seq(7))).toEqual({ ok: false, error: NO_USES });
  });

  it('gives back the use and the hit points on undo', async () => {
    await setSheet('fighter', (s) => { s.hp.current = 10; });
    const out = ok(await resolveAction(campaignId, p1, req('fighter', SECOND_WIND), seq(7)));
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    const data = await charData('fighter');
    expect(data.hp.current).toBe(10);
    expect(data.featureUses).toEqual({ 'second-wind': 0 });
  });

  it('lets a second action through in the same turn after Action Surge', async () => {
    startFight('fighter');
    ok(await resolveAction(campaignId, p1, req('fighter', 'common:dodge'), seq()));
    expect(await resolveAction(campaignId, p1, req('fighter', 'common:help'), seq())).toEqual({ ok: false, error: 'Você já usou a ação neste turno.' });
    ok(await resolveAction(campaignId, p1, req('fighter', SURGE), seq()));
    expect(spent('fighter').extraActions).toBe(1);
    expect((await charData('fighter')).featureUses).toEqual({ 'action-surge': 1 });
    ok(await resolveAction(campaignId, p1, req('fighter', 'common:help'), seq()));
    expect(spent('fighter').extraActions).toBe(0);
  });

  it('takes the extra action and the use back on undo', async () => {
    startFight('fighter');
    const out = ok(await resolveAction(campaignId, p1, req('fighter', SURGE), seq()));
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    expect(spent('fighter').extraActions).toBe(0);
    expect((await charData('fighter')).featureUses).toEqual({ 'action-surge': 0 });
  });
});

describe('Flurry of Blows', () => {
  it('is named by its label', async () => {
    const listed = await listActions(campaignId, p1, mapId, 'monk');
    if ('error' in listed) throw new Error(listed.error);
    expect(listed.options.find((o) => o.id === FLURRY)).toMatchObject({ name: 'Saraivada Inventada', cost: 'bonus', uses: { left: 3, max: 3 } });
  });

  it('is refused before the Attack action, then makes two unarmed attacks and spends one ki', async () => {
    startFight('monk');
    const twice = { targetTokenIds: ['goblin', 'goblin'] };
    expect(await resolveAction(campaignId, p1, req('monk', FLURRY, twice), seq())).toEqual({ ok: false, error: 'Use a ação Atacar antes.' });
    expect(spent('monk')).toEqual(freshSpend());
    ok(await resolveAction(campaignId, p1, req('monk', 'attack:0', { targetTokenId: 'goblin' }), seq(1)));
    // +5 (proficiency 2, DEX +3): 15 hits AC 15 for 1d4 (2) + 3; then a natural 1 misses.
    const out = ok(await resolveAction(campaignId, p1, req('monk', FLURRY, twice), seq(15, 2, 1)));
    const entry = out.card.targets[0];
    expect(entry.attacks?.map((a) => [a.total, a.hit])).toEqual([[20, true], [6, false]]);
    expect(entry.damage).toEqual([{ total: 5, type: 'contundente', breakdown: expect.any(String) }]);
    expect((await mapToken('goblin')).hp.current).toBe(2);
    expect((await charData('monk')).featureUses).toEqual({ ki: 1 });
    expect(spent('monk').bonus).toBe(true);
  });

  it('wants one target per attack', async () => {
    startFight('monk');
    ok(await resolveAction(campaignId, p1, req('monk', 'attack:0', { targetTokenId: 'goblin' }), seq(1)));
    expect(await resolveAction(campaignId, p1, req('monk', FLURRY, { targetTokenIds: ['goblin'] }), seq())).toEqual({ ok: false, error: 'Invalid target' });
    expect(await resolveAction(campaignId, p1, req('monk', FLURRY, { targetTokenIds: ['goblin', 'far'] }), seq())).toEqual({ ok: false, error: 'Out of range' });
    expect(spent('monk').bonus).toBe(false);
    expect((await charData('monk')).featureUses ?? {}).toEqual({});
  });

  it('gives back the ki, the hit points and the bonus action on undo', async () => {
    startFight('monk');
    ok(await resolveAction(campaignId, p1, req('monk', 'attack:0', { targetTokenId: 'goblin' }), seq(1)));
    const out = ok(await resolveAction(campaignId, p1, req('monk', FLURRY, { targetTokenIds: ['goblin', 'goblin'] }), seq(15, 2, 15, 1)));
    expect((await mapToken('goblin')).hp.current).toBe(0);
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    expect((await mapToken('goblin')).hp.current).toBe(7);
    expect((await charData('monk')).featureUses).toEqual({ ki: 0 });
    expect(spent('monk').bonus).toBe(false);
  });
});

describe('Lay on Hands', () => {
  it('heals the amount chosen from the pool, on a target within touch', async () => {
    await setSheet('fighter', (s) => { s.hp.current = 10; });
    startFight('paladin');
    const out = ok(await resolveAction(campaignId, p1, req('paladin', HANDS, { targetTokenId: 'fighter', amount: 7 }), seq()));
    expect(out.card.targets[0]).toMatchObject({ tokenId: 'fighter', healing: 7, hpAfter: 17 });
    expect((await charData('fighter')).hp.current).toBe(17);
    expect((await charData('paladin')).featureUses).toEqual({ 'lay-on-hands': 7 });
    const listed = await listActions(campaignId, p1, mapId, 'paladin');
    if ('error' in listed) throw new Error(listed.error);
    expect(listed.options.find((o) => o.id === HANDS)?.uses).toEqual({ left: 8, max: 15 });
    expect(spent('paladin').action).toBe(true);
  });

  it('heals the paladin when no target is chosen', async () => {
    await setSheet('paladin', (s) => { s.hp.current = 20; });
    ok(await resolveAction(campaignId, p1, req('paladin', HANDS, { amount: 3 }), seq()));
    expect((await charData('paladin')).hp.current).toBe(23);
  });

  it('refuses more than the pool has left, a missing amount and a target out of touch', async () => {
    await setSheet('paladin', (s) => { s.featureUses = { 'lay-on-hands': 10 }; });
    expect(await resolveAction(campaignId, p1, req('paladin', HANDS, { amount: 6 }), seq())).toEqual({ ok: false, error: NO_USES });
    expect(await resolveAction(campaignId, p1, req('paladin', HANDS), seq())).toEqual({ ok: false, error: 'This action cannot be resolved' });
    expect(await resolveAction(campaignId, p1, req('paladin', HANDS, { targetTokenId: 'far', amount: 1 }), seq())).toEqual({ ok: false, error: 'Out of range' });
    expect((await charData('paladin')).featureUses).toEqual({ 'lay-on-hands': 10 });
  });

  it('gives back the pool and the hit points on undo', async () => {
    await setSheet('fighter', (s) => { s.hp.current = 10; });
    const out = ok(await resolveAction(campaignId, p1, req('paladin', HANDS, { targetTokenId: 'fighter', amount: 7 }), seq()));
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    expect((await charData('fighter')).hp.current).toBe(10);
    expect((await charData('paladin')).featureUses).toEqual({ 'lay-on-hands': 0 });
  });
});

describe('Cunning Action', () => {
  it('offers the common actions as bonus actions, and a bonus Dash spends the bonus action', async () => {
    const listed = await listActions(campaignId, p1, mapId, 'rogue');
    if ('error' in listed) throw new Error(listed.error);
    const bonus = listed.options.filter((o) => o.id.endsWith(':bonus')).map((o) => [o.id, o.cost]);
    expect(bonus).toEqual([['common:dash:bonus', 'bonus'], ['common:disengage:bonus', 'bonus'], ['common:hide:bonus', 'bonus']]);
    expect(listed.options.some((o) => o.id === fid('ladino', 'cunning-action'))).toBe(false);
    startFight('rogue');
    ok(await resolveAction(campaignId, p1, req('rogue', 'common:dodge'), seq()));
    ok(await resolveAction(campaignId, p1, req('rogue', 'common:dash:bonus'), seq()));
    expect(spent('rogue')).toMatchObject({ action: true, bonus: true, dashes: 1 });
  });

  it('is not offered to a class without it', async () => {
    const listed = await listActions(campaignId, p1, mapId, 'fighter');
    if ('error' in listed) throw new Error(listed.error);
    expect(listed.options.some((o) => o.id.endsWith(':bonus'))).toBe(false);
  });
});
