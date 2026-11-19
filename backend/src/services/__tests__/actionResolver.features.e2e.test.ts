/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * Class feature buttons on the bar: a state that runs until it is ended
 * (Rage), a heal from dice or from a pool (Second Wind, Lay on Hands), an
 * extra action (Action Surge), unarmed attacks after the Attack action
 * (Flurry of Blows) and common actions taken as a bonus action (Cunning
 * Action), each spending its pool and its share of the turn, and each taken
 * back by the GM's undo; then what rides on a weapon attack (Sneak Attack,
 * Divine Smite, Rage damage) and the passives that change it (Extra Attack,
 * Improved Critical). The class entries are invented minimal ones (no book
 * text) under a book of this file's own. Requires PostgreSQL at DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { holdWeapons } from '../../__tests__/helpers/holdWeapons';
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
  return holdWeapons(JSON.parse(raw));
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
        filter: { melee: true, strength: true },
      }),
      feature('Pancada Inventada', 1, {
        key: 'brutal', kind: 'addDamage', cost: 'none', resources: [{ key: 'brutal', max: 1, recovers: 'short' }],
        spends: { key: 'brutal' }, dice: { '1': '1d4' }, filter: { melee: true },
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
      feature('Golpe Duplo Inventado', 5, { key: 'extra-attack', kind: 'passive', passive: { extraAttacks: 1 } }),
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
      feature('Castigo Inventado', 2, {
        key: 'divine-smite', kind: 'addDamage', cost: 'none', slot: { base: '2d8', perSlot: '1d8', maxDice: 5 }, filter: { melee: true },
      }),
    ],
  },
  ladino: {
    name: 'Ladino',
    features: [
      feature('Furtivo Inventado', 1, {
        key: 'sneak-attack', kind: 'addDamage', cost: 'none', oncePerTurn: true, filter: { finesseOrRanged: true }, dice: { '1': '1d6', '3': '2d6' },
      }),
      feature('Astúcia Inventada', 2, { key: 'cunning-action', kind: 'makeBonus', cost: 'bonus', makeBonus: ['dash', 'disengage', 'hide'] }),
    ],
  },
};

/** Invented subclass entries with the slugs the fixture sheets point at. */
const SUBCLASSES: Record<string, { name: string; parent: string; features: unknown[] }> = {
  campeao: {
    name: 'Campeão',
    parent: 'guerreiro',
    features: [feature('Crítico Inventado', 3, { key: 'improved-critical', kind: 'passive', passive: { critMin: 19 } })],
  },
};

const fid = (cls: string, key: string) => `feature:${BOOK}/${cls}/${key}`;
const RAGE = fid('barbaro', 'rage');
const SECOND_WIND = fid('guerreiro', 'second-wind');
const SURGE = fid('guerreiro', 'action-surge');
const FLURRY = fid('monge', 'flurry-of-blows');
const HANDS = fid('paladino', 'lay-on-hands');
const SNEAK = fid('ladino', 'sneak-attack');
const SMITE = fid('paladino', 'divine-smite');
const BRUTAL = fid('barbaro', 'brutal');
const CANNOT_RESOLVE = 'This action cannot be resolved';
const ONCE_PER_TURN = 'Uma vez por turno.';

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
  await prisma.compendiumEntry.createMany({
    data: Object.entries(SUBCLASSES).map(([slug, c]) => ({
      bookId: BOOK, type: 'subclass', slug, name: c.name, search: c.name.toLowerCase(), text: 'Texto inventado.',
      data: { parent: c.parent, features: c.features } as object,
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

describe('Sneak Attack, a once-a-turn rider', () => {
  const sneak = (over: Partial<ActionRequest> = {}) => req('rogue', 'attack:0', { targetTokenId: 'goblin', riders: [{ featureId: SNEAK }], ...over });

  it('is listed on the finesse rapier', async () => {
    const listed = await listActions(campaignId, p1, mapId, 'rogue');
    if ('error' in listed) throw new Error(listed.error);
    expect(listed.options.find((o) => o.id === 'attack:0')?.riders).toEqual([{ featureId: SNEAK, name: 'Furtivo Inventado' }]);
  });

  it('adds 2d6 of the weapon type on a hit, once a turn; again off turn after next, and on the next turn', async () => {
    startFight('rogue');
    // +5: 15 hits AC 15; rapier 1d8+3 (4) = 7; 2d6 (3, 2) = 5.
    const out = ok(await resolveAction(campaignId, p1, sneak(), seq(15, 4, 3, 2)));
    expect(out.card.targets[0].damage).toEqual([
      { total: 7, type: 'perfurante', breakdown: expect.any(String) },
      { total: 5, type: 'perfurante', label: 'Furtivo Inventado', breakdown: expect.stringContaining('2d6') },
    ]);
    expect(out.card.ridersUnused).toBeUndefined();
    expect(spent('rogue').oncePerTurn).toEqual([SNEAK]);
    expect(await resolveAction(campaignId, p1, sneak({ actionId: 'attack:1' }), seq())).toEqual({ ok: false, error: ONCE_PER_TURN });

    // The turn passes to the goblin: a reaction attack in the same round may add it again.
    setState(campaignId, beginTurn(getState(campaignId), 'goblin'));
    const reaction = ok(await resolveAction(campaignId, p1, sneak(), seq(15, 4, 3, 2)));
    expect(reaction.card.targets[0].damage).toHaveLength(2);
    expect(spent('rogue')).toMatchObject({ reaction: true, oncePerTurn: [SNEAK] });

    setState(campaignId, beginTurn(getState(campaignId), 'rogue'));
    ok(await resolveAction(campaignId, p1, sneak(), seq(15, 4, 3, 2)));
  });

  it('can be used again after the GM undoes its hit in the same turn', async () => {
    startFight('rogue');
    const first = ok(await resolveAction(campaignId, p1, sneak(), seq(15, 4, 3, 2)));
    expect(spent('rogue').oncePerTurn).toEqual([SNEAK]);
    expect((await undoAction(campaignId, gm, first.messageId)).ok).toBe(true);
    expect(spent('rogue')).toMatchObject({ action: false, oncePerTurn: [] });
    const again = ok(await resolveAction(campaignId, p1, sneak(), seq(15, 4, 3, 2)));
    expect(again.card.targets[0].damage).toHaveLength(2);
    expect(again.card.targets[0].damage?.[1]).toMatchObject({ total: 5, label: 'Furtivo Inventado' });
    expect(spent('rogue').oncePerTurn).toEqual([SNEAK]);
  });

  it('leaves the marks alone when its hit is undone after the turn moved on', async () => {
    startFight('rogue');
    const first = ok(await resolveAction(campaignId, p1, sneak(), seq(15, 4, 3, 2)));
    // Next turn: the rogue's reaction attack uses it again on the goblin's turn.
    setState(campaignId, beginTurn(getState(campaignId), 'goblin'));
    ok(await resolveAction(campaignId, p1, sneak(), seq(15, 4, 3, 2)));
    expect(spent('rogue').oncePerTurn).toEqual([SNEAK]);
    expect((await undoAction(campaignId, gm, first.messageId)).ok).toBe(true);
    expect(spent('rogue')).toMatchObject({ reaction: true, oncePerTurn: [SNEAK] });
    expect(await resolveAction(campaignId, p1, sneak({ actionId: 'attack:1' }), seq())).toEqual({ ok: false, error: ONCE_PER_TURN });
  });

  it('spends nothing on a miss, and the card says it was not used', async () => {
    startFight('rogue');
    const out = ok(await resolveAction(campaignId, p1, sneak(), seq(2)));
    expect(out.card.targets[0].attack?.hit).toBe(false);
    expect(out.card.targets[0].damage).toBeUndefined();
    expect(out.card.ridersUnused).toEqual(['Furtivo Inventado']);
    expect(spent('rogue').oncePerTurn).toEqual([]);
  });

  it('is refused on an option that does not list it, on a non-weapon option and with a slot level', async () => {
    startFight('rogue');
    expect(await resolveAction(campaignId, p1, req('barb', 'attack:0', { targetTokenId: 'goblin', riders: [{ featureId: SNEAK }] }), seq())).toEqual({ ok: false, error: CANNOT_RESOLVE });
    expect(await resolveAction(campaignId, p1, req('rogue', 'common:dodge', { riders: [{ featureId: SNEAK }] }), seq())).toEqual({ ok: false, error: CANNOT_RESOLVE });
    expect(await resolveAction(campaignId, p1, sneak({ riders: [{ featureId: SNEAK, slotLevel: 1 }] }), seq())).toEqual({ ok: false, error: CANNOT_RESOLVE });
    expect(await resolveAction(campaignId, p1, sneak({ riders: [{ featureId: SNEAK }, { featureId: SNEAK }] }), seq())).toEqual({ ok: false, error: CANNOT_RESOLVE });
    expect(spent('rogue')).toEqual(freshSpend());
  });
});

describe('Divine Smite, a rider that spends a spell slot', () => {
  const smite = (slotLevel?: number) => req('paladin', 'attack:0', { targetTokenId: 'goblin', riders: [{ featureId: SMITE, ...(slotLevel ? { slotLevel } : {}) }] });

  it('adds 3d8 with a 2nd-level slot, spends the slot, and the undo gives it back', async () => {
    await setSheet('paladin', (s) => { s.spellcasting.slots['2'] = { total: 1, expended: 0 }; });
    startFight('paladin');
    // Longsword 1d8+5 (4) = 9; 3d8 (1, 2, 3) = 6.
    const out = ok(await resolveAction(campaignId, p1, smite(2), seq(15, 4, 1, 2, 3)));
    expect(out.card.targets[0].damage?.[1]).toEqual({ total: 6, type: 'cortante', label: 'Castigo Inventado', breakdown: expect.stringContaining('3d8') });
    expect((await charData('paladin')).spellcasting.slots['2']).toEqual({ total: 1, expended: 1 });
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    expect((await charData('paladin')).spellcasting.slots['2']).toEqual({ total: 1, expended: 0 });
  });

  it('doubles its dice on a critical and stops at five dice', async () => {
    await setSheet('paladin', (s) => { s.spellcasting.slots['5'] = { total: 1, expended: 0 }; });
    const out = ok(await resolveAction(campaignId, p1, smite(5), seq(20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)));
    expect(out.card.targets[0].damage?.[1]).toMatchObject({ total: 10, breakdown: expect.stringContaining('10d8') });
  });

  it('is refused before rolling with no slot of that level, spending nothing', async () => {
    startFight('paladin');
    expect(await resolveAction(campaignId, p1, smite(2), seq())).toEqual({ ok: false, error: 'No spell slot of that level' });
    expect(spent('paladin')).toEqual(freshSpend());
    expect(await resolveAction(campaignId, p1, smite(), seq())).toEqual({ ok: false, error: CANNOT_RESOLVE });
  });

  it('keeps the slot on a miss', async () => {
    const out = ok(await resolveAction(campaignId, p1, smite(1), seq(2)));
    expect(out.card.ridersUnused).toEqual(['Castigo Inventado']);
    expect((await charData('paladin')).spellcasting.slots['1']).toEqual({ total: 3, expended: 0 });
    expect(out.card.undo.slot).toBeUndefined();
  });
});

describe('A rider with a pool of uses', () => {
  const brutal = () => req('barb', 'attack:0', { targetTokenId: 'goblin', riders: [{ featureId: BRUTAL }] });

  it('spends a use on a hit, and the undo gives it back', async () => {
    const out = ok(await resolveAction(campaignId, p1, brutal(), seq(15, 6, 3)));
    expect(out.card.targets[0].damage?.[1]).toMatchObject({ total: 3, label: 'Pancada Inventada' });
    expect((await charData('barb')).featureUses).toEqual({ brutal: 1 });
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    expect((await charData('barb')).featureUses).toEqual({ brutal: 0 });
  });

  it('is refused before rolling when the pool is empty', async () => {
    await setSheet('barb', (s) => { s.featureUses = { brutal: 1 }; });
    expect(await resolveAction(campaignId, p1, brutal(), seq())).toEqual({ ok: false, error: NO_USES });
  });
});

describe('Rage damage', () => {
  it('adds 2 to a raging barbarian\'s greataxe hit, not to a thrown javelin', async () => {
    await setSheet('barb', (s) => { s.activeStates = [RAGE]; });
    // Greataxe 1d12+3 (6) = 9, +2.
    const axe = ok(await resolveAction(campaignId, p1, req('barb', 'attack:0', { targetTokenId: 'goblin' }), seq(15, 6)));
    expect(axe.card.targets[0].damage?.[0].total).toBe(11);
    // Javelin thrown 1d6+3 (4) = 7: a ranged attack, no Rage.
    const javelin = ok(await resolveAction(campaignId, p1, req('barb', 'attack:1:thrown', { targetTokenId: 'goblin' }), seq(15, 4)));
    expect(javelin.card.targets[0].damage?.[0].total).toBe(7);
  });

  it('adds nothing when not raging', async () => {
    const axe = ok(await resolveAction(campaignId, p1, req('barb', 'attack:0', { targetTokenId: 'goblin' }), seq(15, 6)));
    expect(axe.card.targets[0].damage?.[0].total).toBe(9);
  });
});

describe('Extra Attack and Improved Critical', () => {
  it('lets a 5th-level fighter attack twice under one action', async () => {
    await setSheet('fighter', (s) => { s.level = 5; });
    startFight('fighter');
    const listed = await listActions(campaignId, p1, mapId, 'fighter');
    if ('error' in listed) throw new Error(listed.error);
    expect(listed.combat?.attacksPerAction).toBe(2);
    const swing = req('fighter', 'attack:0', { targetTokenId: 'goblin' });
    ok(await resolveAction(campaignId, p1, swing, seq(2)));
    ok(await resolveAction(campaignId, p1, swing, seq(2)));
    expect(await resolveAction(campaignId, p1, swing, seq(2))).toEqual({ ok: false, error: 'Você já usou a ação neste turno.' });
  });

  it('lets a 3rd-level Champion crit on a 19', async () => {
    // Longsword 1d8+3, doubled: 3 + 4 + 3.
    const out = ok(await resolveAction(campaignId, p1, req('fighter', 'attack:0', { targetTokenId: 'goblin' }), seq(19, 3, 4)));
    expect(out.card.targets[0].attack).toMatchObject({ natural: 19, hit: true, critical: true });
    expect(out.card.targets[0].damage?.[0].total).toBe(10);
  });
});
