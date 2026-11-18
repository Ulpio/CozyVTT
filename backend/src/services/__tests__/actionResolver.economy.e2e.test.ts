/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * The bar's resolver with a fight on: what a combatant has already spent this
 * turn is refused, a refused resolve spends nothing, and the GM's undo gives
 * the action back while the turn is still the same one. Book entries are
 * invented minimal ones (no book text). Requires PostgreSQL at DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { resolveAction, listActions, undoAction, type ActionRequest } from '../actionResolver';
import { beginTurn, clearState, flushCombatWrites, freshSpend, getState, setState, type CombatantEntry } from '../../websocket/initiativeState';
import type { Viewer } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const BOOK = `p5c-eco-${randomUUID().slice(0, 8)}`;

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

let gmId: string;
let p1Id: string;
let p2Id: string;
let campaignId: string;
let mapId: string;
let fighterId: string;
let clericId: string;
let gm: Viewer;
let p1: Viewer;
let p2: Viewer;

const goblinStatBlock = {
  ac: 15,
  hpMax: 7,
  speed: '9 m',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  actions: [
    { name: 'Cimitarra', description: 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.' },
    { name: 'Arco Curto', description: 'Ataque à Distância com Arma: +4 para atingir, distância 24/96 m, um alvo. Acerto: 5 (1d6 + 2) de dano perfurante.' },
    { name: 'Ataques Múltiplos', description: 'O goblin faz dois ataques com a cimitarra.' },
  ],
};

function clericSheet() {
  const s = sheet('clerigo');
  s.spellcasting.spells = [
    { level: 1, name: 'Bênção', prepared: true, ritual: false, concentration: true, compendiumRef: { bookId: BOOK, slug: 'bencao' } },
    { level: 1, name: 'Ritual longo', prepared: true, ritual: false, concentration: false, compendiumRef: { bookId: BOOK, slug: 'ritual-longo' } },
    { level: 1, name: 'Passo rápido', prepared: true, ritual: false, concentration: false, compendiumRef: { bookId: BOOK, slug: 'passo-rapido' } },
  ];
  return s;
}

const token = (over: Record<string, unknown>): any => ({
  imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, ...over,
});

function tokens() {
  return [
    token({ id: 'fighter', name: 'Guerreira', position: { x: 10, y: 10 }, characterId: fighterId, controlledBy: p1Id, type: 'player' }),
    token({ id: 'cleric', name: 'Clérigo', position: { x: 11, y: 10 }, characterId: clericId, controlledBy: p2Id, type: 'player' }),
    token({ id: 'goblin', name: 'Goblin', position: { x: 11, y: 11 }, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
    token({ id: 'far', name: 'Goblin longe', position: { x: 10, y: 50 }, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
  ];
}

async function tokenHp(id: string) {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return (map.tokens as any[]).find((t) => t.id === id).hp;
}

const req = (over: Partial<ActionRequest>): ActionRequest => ({
  mapId, actorTokenId: 'fighter', actionId: 'attack:0', targetTokenId: 'goblin', mode: 'normal', ...over,
});

const combatant = (tokenId: string, type: CombatantEntry['type']): CombatantEntry => ({
  tokenId, mapId, name: tokenId, imageUrl: '', initiative: 10, hp: null, type, disposition: null, characterId: null,
});

/** A fight with the fighter, the cleric and the goblin, `current` acting in round 1. */
function startFight(current = 'fighter') {
  setState(campaignId, beginTurn({
    active: true, round: 1, currentTokenId: null,
    combatants: [combatant('fighter', 'player'), combatant('cleric', 'player'), combatant('goblin', 'npc')],
  }, current));
}

const spent = (tokenId: string) => getState(campaignId).spend[tokenId];

beforeAll(async () => {
  const users = await Promise.all(['GM', 'P1', 'P2'].map((n) => createTestUser({ displayName: `P5c eco ${n}` })));
  [gmId, p1Id, p2Id] = users.map((u) => u.id);
  gm = { role: 'GM', userId: gmId };
  p1 = { role: 'PLAYER', userId: p1Id };
  p2 = { role: 'PLAYER', userId: p2Id };
  campaignId = (await createTestCampaign(gmId, { name: 'P5c economy', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5c economy test book', gameSystem: 'FIFTH_EDITION' } });
  const entry = (type: string, slug: string, name: string, data: unknown) =>
    ({ bookId: BOOK, type, slug, name, search: name.toLowerCase(), text: 'Texto inventado.', data: data as object });
  await prisma.compendiumEntry.createMany({
    data: [
      entry('weapon', 'espada-longa', 'Espada longa', { range: 'melee', properties: ['versátil'], damage: { dice: '1d8', type: 'cortante' } }),
      entry('spell', 'bencao', 'Bênção', { level: 1, range: '9 metros', castingTime: '1 ação', concentration: true, mechanics: {} }),
      entry('spell', 'ritual-longo', 'Ritual longo', { level: 1, range: '9 metros', castingTime: '10 minutos', concentration: false, mechanics: {} }),
      entry('spell', 'passo-rapido', 'Passo rápido', { level: 1, range: 'Pessoal', castingTime: '1 ação bônus', concentration: false, mechanics: {} }),
    ],
  });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  fighterId = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Guerreira', data: sheet('guerreiro') } })).id;
  clericId = (await prisma.character.create({ data: { userId: p2Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Clérigo', data: clericSheet() } })).id;
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
  await prisma.character.update({ where: { id: fighterId }, data: { data: sheet('guerreiro') } });
  await prisma.character.update({ where: { id: clericId }, data: { data: clericSheet() } });
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

function ok(out: Awaited<ReturnType<typeof resolveAction>>) {
  if (!out.ok) throw new Error(`expected success, got ${out.error}`);
  return out;
}

describe('on the fighter\'s turn', () => {
  it('lets the first attack through and refuses the second before rolling', async () => {
    startFight();
    ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    expect(spent('fighter')).toMatchObject({ action: true, attacksLeft: 0, attackActionTaken: true });
    expect(await resolveAction(campaignId, p1, req({}), seq())).toEqual({ ok: false, error: 'Você já usou a ação neste turno.' });
  });

  it('spends nothing when the resolve is refused for another reason', async () => {
    startFight();
    expect(await resolveAction(campaignId, p1, req({ targetTokenId: 'far' }), seq())).toEqual({ ok: false, error: 'Out of range' });
    expect(spent('fighter')).toEqual(freshSpend());
  });

  it('lets exactly one of two attacks arriving together through when one attack is left', async () => {
    startFight();
    const state = getState(campaignId);
    state.spend.fighter = { ...freshSpend(), action: true, attackActionTaken: true, attacksLeft: 1 };
    setState(campaignId, state);
    const outs = await Promise.all([
      resolveAction(campaignId, p1, req({}), seq(15, 1)),
      resolveAction(campaignId, p1, req({}), seq(15, 1)),
    ]);
    expect(outs.filter((o) => o.ok)).toHaveLength(1);
    expect(outs.filter((o) => !o.ok)).toEqual([{ ok: false, error: 'Você já usou a ação neste turno.' }]);
    expect(spent('fighter').attacksLeft).toBe(0);
  });

  it('gives a monster what its Multiattack allows after the first attack', async () => {
    startFight('goblin');
    ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(1)));
    expect(spent('goblin')).toMatchObject({ action: true, attacksLeft: 99 });
    ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId: 'npc:actions:1', targetTokenId: 'fighter', mode: 'normal' }, seq(1)));
    expect(spent('goblin').attacksLeft).toBe(98);
  });

  it('lets a monster attack after posting its Multiattack, and refuses a second Multiattack', async () => {
    startFight('goblin');
    const goblin = (actionId: string, rng: Rng) => resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId, targetTokenId: 'fighter', mode: 'normal' }, rng);
    const multi = ok(await goblin('npc:actions:2', seq()));
    expect(multi.card.actionName).toBe('Ataques Múltiplos');
    expect(spent('goblin')).toMatchObject({ action: true, attackActionTaken: true, attacksLeft: 99 });
    const listed: any = await listActions(campaignId, gm, mapId, 'goblin');
    expect(listed.combat.spend).toMatchObject({ action: true, attackActionTaken: true, attacksLeft: 99 });
    ok(await goblin('npc:actions:0', seq(1)));
    ok(await goblin('npc:actions:0', seq(1)));
    expect(spent('goblin').attacksLeft).toBe(97);
    expect(await goblin('npc:actions:2', seq())).toEqual({ ok: false, error: 'Você já usou a ação neste turno.' });
  });

  it('refuses a spell that takes minutes to cast, and spends no slot', async () => {
    startFight('cleric');
    const out = await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: `spell:${BOOK}/ritual-longo`, mode: 'normal' });
    expect(out).toEqual({ ok: false, error: 'Leva tempo demais para conjurar em combate.' });
    const data: any = (await prisma.character.findUniqueOrThrow({ where: { id: clericId } })).data;
    expect(data.spellcasting.slots['1'].expended).toBe(0);
  });
});

describe('off turn', () => {
  it('refuses an action spell with "Não é a sua vez." and spends no slot', async () => {
    startFight();
    const out = await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: `spell:${BOOK}/bencao`, mode: 'normal' });
    expect(out).toEqual({ ok: false, error: 'Não é a sua vez.' });
    const data: any = (await prisma.character.findUniqueOrThrow({ where: { id: clericId } })).data;
    expect(data.spellcasting.slots['1'].expended).toBe(0);
    expect(data.concentratingOn ?? null).toBeNull();
  });

  it('lets the goblin make one melee attack as its reaction, and no ranged one', async () => {
    startFight();
    const goblin = (actionId: string, rng: Rng) => resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId, targetTokenId: 'fighter', mode: 'normal' }, rng);
    expect(await goblin('npc:actions:1', seq())).toEqual({ ok: false, error: 'Não é a sua vez.' });
    ok(await goblin('npc:actions:0', seq(1)));
    expect(spent('goblin')).toMatchObject({ reaction: true, action: false });
    expect(await goblin('npc:actions:0', seq())).toEqual({ ok: false, error: 'Você já usou a reação.' });
  });

  it('gives the reaction back on an undo in the same round, even after the turn moved on', async () => {
    startFight();
    const out = ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(1)));
    setState(campaignId, beginTurn(getState(campaignId), 'cleric'));
    ok(await undoAction(campaignId, gm, out.messageId) as any);
    expect(spent('goblin').reaction).toBe(false);
  });
});

describe('undo', () => {
  it('gives the action back while it is still the same turn', async () => {
    startFight();
    const out = ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    expect(spent('fighter').action).toBe(true);
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    expect(spent('fighter')).toEqual(freshSpend());
    ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
  });

  it('gives back only what the undone card spent: the action, not a later bonus action', async () => {
    startFight('cleric');
    const cast = (slug: string) => resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: `spell:${BOOK}/${slug}`, mode: 'normal' });
    const first = ok(await cast('bencao'));
    ok(await cast('passo-rapido'));
    expect(spent('cleric')).toMatchObject({ action: true, bonus: true });
    expect((await undoAction(campaignId, gm, first.messageId)).ok).toBe(true);
    expect(spent('cleric')).toMatchObject({ action: false, bonus: true });
  });

  it('leaves the metres walked alone', async () => {
    startFight();
    const out = ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    const state = getState(campaignId);
    state.spend.fighter = { ...state.spend.fighter, movedFeet: 25, overBudgetWarned: true };
    setState(campaignId, state);
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    expect(spent('fighter')).toMatchObject({ action: false, movedFeet: 25, overBudgetWarned: true });
  });

  it('gives back one attack of the Attack action, and the action with the attack that started it', async () => {
    startFight('goblin');
    const attack = () => resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(1));
    const first = ok(await attack());
    const second = ok(await attack());
    expect(spent('goblin')).toMatchObject({ action: true, attacksLeft: 98 });
    expect((await undoAction(campaignId, gm, second.messageId)).ok).toBe(true);
    expect(spent('goblin')).toMatchObject({ action: true, attacksLeft: 99, attackActionTaken: true });
    expect((await undoAction(campaignId, gm, first.messageId)).ok).toBe(true);
    expect(spent('goblin')).toMatchObject({ action: false, attacksLeft: 1, attackActionTaken: false });
  });

  it('gives back the dash it added', async () => {
    startFight();
    const out = ok(await resolveAction(campaignId, p1, req({ actionId: 'common:dash', targetTokenId: undefined }), seq()));
    expect(spent('fighter').dashes).toBe(1);
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    expect(spent('fighter')).toMatchObject({ action: false, dashes: 0 });
  });

  it('after the turn moved on gives the hit points back and leaves the action spent', async () => {
    startFight();
    const out = ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    expect(await tokenHp('goblin')).toEqual({ current: 3, max: 7, temp: 0 });
    setState(campaignId, beginTurn(getState(campaignId), 'cleric'));
    expect((await undoAction(campaignId, gm, out.messageId)).ok).toBe(true);
    expect(await tokenHp('goblin')).toEqual({ current: 7, max: 7, temp: 0 });
    expect(spent('fighter').action).toBe(true);
  });
});

describe('without a fight', () => {
  it('lets the same calls through as before and keeps no spend', async () => {
    ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    ok(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: `spell:${BOOK}/ritual-longo`, mode: 'normal' }));
    expect(getState(campaignId).spend).toEqual({});
    const listed = await listActions(campaignId, p1, mapId, 'fighter');
    expect('error' in listed).toBe(false);
    expect((listed as any).combat).toBeUndefined();
    expect((listed as any).options.some((o: any) => o.id === 'attack:0')).toBe(true);
  });

  it('lets a combatant act freely when it is not in the order', async () => {
    setState(campaignId, beginTurn({ active: true, round: 1, currentTokenId: null, combatants: [combatant('goblin', 'npc')] }, 'goblin'));
    ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
  });
});

describe('the common actions and the list', () => {
  it('posts Dash as a card, spends the action and doubles the budget the list replies with', async () => {
    startFight();
    const before: any = await listActions(campaignId, p1, mapId, 'fighter');
    expect(before.combat).toEqual({ yourTurn: true, spend: freshSpend(), attacksPerAction: 1, budgetFeet: 30 });
    const out = ok(await resolveAction(campaignId, p1, req({ actionId: 'common:dash', targetTokenId: undefined }), seq()));
    expect(out.card.actionName).toBe('Disparada');
    expect(out.card.targets).toEqual([]);
    const after: any = await listActions(campaignId, p1, mapId, 'fighter');
    expect(after.combat).toMatchObject({ yourTurn: true, budgetFeet: 60, spend: { action: true, dashes: 1 } });
    expect(await resolveAction(campaignId, p1, req({ actionId: 'common:dodge', targetTokenId: undefined }), seq())).toEqual({ ok: false, error: 'Você já usou a ação neste turno.' });
  });

  it('tells an off-turn combatant it is not their turn, and a monster its stat block speed', async () => {
    startFight();
    const goblin: any = await listActions(campaignId, gm, mapId, 'goblin');
    expect(goblin.combat).toMatchObject({ yourTurn: false, attacksPerAction: 100, budgetFeet: 30 });
  });
});
