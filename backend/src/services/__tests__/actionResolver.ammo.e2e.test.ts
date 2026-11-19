/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * Ammunition on the bar (Faithful campaigns): each shot spends one from the
 * stack, the GM's undo gives it back, a refused action costs no arrow, and
 * outside a fight half of what was shot is picked up. Compendium entries are
 * invented minimal ones (no book text) under a book of this file's own.
 * Requires PostgreSQL at DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { listActions, resolveAction, undoAction, type ActionRequest } from '../actionResolver';
import { ammoAmount, equipItem, recoverAmmo } from '../inventory';
import { beginTurn, clearState, flushCombatWrites, setState, type CombatantEntry } from '../../websocket/initiativeState';
import type { Viewer } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const BOOK = `p5d-ammo-${randomUUID().slice(0, 8)}`;
const MISS: Rng = () => 1;
const HIT: Rng = (sides) => sides;

let gmId: string;
let p1Id: string;
let campaignId: string;
let mapId: string;
let rangerId: string;
let gm: Viewer;
let p1: Viewer;

const ref = (slug: string) => ({ bookId: BOOK, slug });

/** A ranger holding a longbow in both hands with `arrows` arrows; a hand crossbow, a dagger and bolts in the pack. */
function rangerSheet(arrows = 20, bolts = 0): any {
  const raw = readFileSync(resolve(SHEETS, 'patrulheiro.json'), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK));
  const s = JSON.parse(raw);
  s.inventory = [
    { id: 'bow', name: 'Arco longo', quantity: 1, slot: 'both', equipped: true, compendiumRef: ref('arco-longo') },
    { id: 'arrows', name: 'Flechas', quantity: arrows, slot: 'ammo', equipped: true, compendiumRef: ref('flechas-20') },
    { id: 'xbow', name: 'Besta de mão', quantity: 1, compendiumRef: ref('besta-de-mao') },
    { id: 'bolts', name: 'Virotes', quantity: bolts, compendiumRef: ref('virotes-20') },
    { id: 'dagger', name: 'Adaga', quantity: 1, compendiumRef: ref('adaga') },
  ];
  s.attacks = [
    { name: 'Arco longo', attackBonus: 20, damageRoll: '1d8', damageType: 'perfurante', itemId: 'bow', compendiumRef: ref('arco-longo') },
    { name: 'Besta de mão', attackBonus: 20, damageRoll: '1d6', damageType: 'perfurante', itemId: 'xbow', compendiumRef: ref('besta-de-mao') },
    { name: 'Adaga', attackBonus: 20, damageRoll: '1d4', damageType: 'perfurante', itemId: 'dagger', compendiumRef: ref('adaga') },
  ];
  delete s.ammoToRecover;
  return s;
}

const goblin = { ac: 12, hpMax: 700, speed: '9 m', abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, actions: [] };
const token = (over: Record<string, unknown>): any => ({
  imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, ...over,
});
const tokens = () => [
  token({ id: 'ranger', name: 'Patrulheira', position: { x: 10, y: 10 }, characterId: rangerId, controlledBy: p1Id, type: 'player' }),
  token({ id: 'goblin', name: 'Goblin', position: { x: 11, y: 10 }, type: 'npc', hp: { current: 700, max: 700, temp: 0 }, statBlock: goblin }),
];

/** The dagger in hand instead of the bow, so its throw is listed. */
const holdDagger = (s: any) => {
  s.inventory.find((i: any) => i.id === 'bow').slot = undefined;
  s.inventory.find((i: any) => i.id === 'dagger').slot = 'main';
};
const data = async (): Promise<any> => (await prisma.character.findUniqueOrThrow({ where: { id: rangerId } })).data;
const put = (s: any) => prisma.character.update({ where: { id: rangerId }, data: { data: s } });
const patch = async (change: (s: any) => void) => { const s = await data(); change(s); await put(s); };
const detail = (detailLevel: 'FAITHFUL' | 'FLEXIBLE') => prisma.campaign.update({ where: { id: campaignId }, data: { detailLevel } });
const count = async (id: string) => (await data()).inventory.find((i: any) => i.id === id)?.quantity;
const req = (over: Partial<ActionRequest> = {}): ActionRequest => ({ mapId, actorTokenId: 'ranger', actionId: 'attack:0', targetTokenId: 'goblin', mode: 'normal', ...over });
const shoot = (over: Partial<ActionRequest> = {}, rng: Rng = MISS) => resolveAction(campaignId, p1, req(over), rng);
function ok(out: any): any {
  if (!out.ok) throw new Error(`expected success, got ${out.error}`);
  return out;
}

const combatant = (tokenId: string, characterId: string | null): CombatantEntry => ({
  tokenId, mapId, name: tokenId, imageUrl: '', initiative: 10, hp: null, type: 'player', disposition: null, characterId,
});
function fight() {
  setState(campaignId, beginTurn({ active: true, round: 1, currentTokenId: null, combatants: [combatant('ranger', rangerId), combatant('goblin', null)] }, 'ranger'));
}

beforeAll(async () => {
  const users = await Promise.all(['GM', 'P1'].map((n) => createTestUser({ displayName: `P5d ammo ${n}` })));
  [gmId, p1Id] = users.map((u) => u.id);
  gm = { role: 'GM', userId: gmId };
  p1 = { role: 'PLAYER', userId: p1Id };
  campaignId = (await createTestCampaign(gmId, { name: 'P5d ammo', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5d ammo test book', gameSystem: 'FIFTH_EDITION' } });
  const entry = (type: string, slug: string, name: string, d: object) => ({ bookId: BOOK, type, slug, name, search: name.toLowerCase(), text: '', data: d });
  await prisma.compendiumEntry.createMany({
    data: [
      entry('weapon', 'arco-longo', 'Arco longo', { range: 'ranged', properties: ['munição', 'pesada', 'duas mãos'], normalRange: 45, longRange: 180, ammunition: 'flechas-20', damage: { dice: '1d8', type: 'perfurante' } }),
      entry('weapon', 'besta-de-mao', 'Besta de mão', { range: 'ranged', properties: ['munição', 'leve', 'recarga'], normalRange: 9, longRange: 36, ammunition: 'virotes-20', damage: { dice: '1d6', type: 'perfurante' } }),
      entry('weapon', 'adaga', 'Adaga', { range: 'melee', properties: ['leve', 'acuidade', 'arremesso'], normalRange: 6, longRange: 18, damage: { dice: '1d4', type: 'perfurante' } }),
      entry('gear', 'flechas-20', 'Flechas (20)', {}),
      entry('gear', 'virotes-20', 'Virotes (20)', {}),
    ],
  });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  rangerId = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Patrulheira', data: rangerSheet() } })).id;
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: 100, gridSize: 50, feetPerSquare: 5, diagonalRule: 'flat', annotations: [], tokens: [] },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
});

beforeEach(async () => {
  await detail('FAITHFUL');
  await prisma.map.update({ where: { id: mapId }, data: { tokens: tokens() } });
  await put(rangerSheet());
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

describe('a shot in a Faithful campaign', () => {
  it('spends one arrow per shot, hit or miss, and counts it to recover', async () => {
    ok(await shoot());
    ok(await shoot({}, HIT));
    ok(await shoot());
    expect(await count('arrows')).toBe(17);
    expect((await data()).ammoToRecover).toEqual({ 'flechas-20': 3 });
  });

  it('is given back by the GM\'s undo', async () => {
    ok(await shoot());
    ok(await shoot());
    const third = ok(await shoot());
    ok(await undoAction(campaignId, gm, third.messageId));
    expect(await count('arrows')).toBe(18);
    expect((await data()).ammoToRecover).toEqual({ 'flechas-20': 2 });
  });

  it('refuses with "Sem flechas." when there are none, and spends no action', async () => {
    await patch((s) => { s.inventory.find((i: any) => i.id === 'arrows').quantity = 0; });
    fight();
    expect(await shoot()).toEqual({ ok: false, error: 'Sem flechas.' });
    // The action is still there: with an arrow found, the same shot goes through.
    await patch((s) => { s.inventory.find((i: any) => i.id === 'arrows').quantity = 1; });
    ok(await shoot());
  });

  it('refuses with "Sem flechas." when the stack is gone altogether', async () => {
    await patch((s) => { s.inventory = s.inventory.filter((i: any) => i.id !== 'arrows'); });
    expect(await shoot()).toEqual({ ok: false, error: 'Sem flechas.' });
  });

  it('refuses a hand crossbow with no bolts with "Sem virotes."', async () => {
    await patch((s) => {
      s.inventory.find((i: any) => i.id === 'bow').slot = undefined;
      s.inventory.find((i: any) => i.id === 'xbow').slot = 'main';
    });
    expect(await shoot({ actionId: 'attack:1' })).toEqual({ ok: false, error: 'Sem virotes.' });
  });

  it('takes the arrow from the backpack when none is in the ammo slot', async () => {
    await patch((s) => { delete s.inventory.find((i: any) => i.id === 'arrows').slot; });
    ok(await shoot());
    expect(await count('arrows')).toBe(19);
  });

  it('splits a stored bundle the backfill left whole before the first shot takes one', async () => {
    await patch((s) => {
      const stack = s.inventory.find((i: any) => i.id === 'arrows');
      stack.name = 'Flechas (20)';
      stack.quantity = 1;
    });
    ok(await shoot());
    expect(await count('arrows')).toBe(19);
    expect((await data()).inventory.find((i: any) => i.id === 'arrows').name).toBe('Flechas');
  });

  it('does not spend the arrow when the action is then refused (already used)', async () => {
    fight();
    ok(await shoot());
    const second = await shoot();
    expect(second.ok).toBe(false);
    expect(await count('arrows')).toBe(19);
    expect((await data()).ammoToRecover).toEqual({ 'flechas-20': 1 });
  });

  it('spends nothing for a thrown dagger', async () => {
    await patch(holdDagger);
    ok(await shoot({ actionId: 'attack:2:thrown' }));
    expect(await count('arrows')).toBe(20);
    expect((await data()).ammoToRecover).toBeUndefined();
  });

  it('spends nothing in a Flexible campaign', async () => {
    await detail('FLEXIBLE');
    ok(await shoot());
    expect(await count('arrows')).toBe(20);
    expect((await data()).ammoToRecover).toBeUndefined();
  });
});

describe('listing a weapon that fires ammunition', () => {
  it('tells the bar which gear it fires, and lists nothing of the kind for a thrown dagger', async () => {
    const bow = await listActions(campaignId, p1, mapId, 'ranger');
    if ('error' in bow) throw new Error(bow.error);
    expect(bow.options.find((o) => o.id === 'attack:0')?.ammunition).toEqual({ slug: 'flechas-20', label: 'flechas' });
    await patch(holdDagger);
    const dagger = await listActions(campaignId, p1, mapId, 'ranger');
    if ('error' in dagger) throw new Error(dagger.error);
    expect(dagger.options.every((o) => o.ammunition === undefined)).toBe(true);
  });
});

describe('picking the arrows up', () => {
  it('gives back half after 7 shots, clears the count and says so in the chat', async () => {
    for (let i = 0; i < 7; i++) ok(await shoot());
    expect(await count('arrows')).toBe(13);
    const out = ok(await recoverAmmo(campaignId, p1, rangerId));
    expect(out.recovered).toEqual({ 'flechas-20': 3 });
    expect(await count('arrows')).toBe(16);
    expect((await data()).ammoToRecover).toBeUndefined();
    const lines = await prisma.message.findMany({ where: { campaignId }, orderBy: { createdAt: 'desc' }, take: 1 });
    expect(lines[0].content).toBe('Patrulheira recolhe 3 flechas.');
  });

  it('says "1 flecha" for a single arrow', async () => {
    for (let i = 0; i < 3; i++) ok(await shoot());
    ok(await recoverAmmo(campaignId, p1, rangerId));
    const lines = await prisma.message.findMany({ where: { campaignId }, orderBy: { createdAt: 'desc' }, take: 1 });
    expect(lines[0].content).toBe('Patrulheira recolhe 1 flecha.');
  });

  it('names one of each of the book\'s kinds in the singular', () => {
    expect(ammoAmount(1, 'virotes')).toBe('1 virote');
    expect(ammoAmount(1, 'balas de funda')).toBe('1 bala de funda');
    expect(ammoAmount(1, 'agulhas de zarabatana')).toBe('1 agulha de zarabatana');
    expect(ammoAmount(2, 'virotes')).toBe('2 virotes');
    expect(ammoAmount(1, 'pedras')).toBe('1 pedras');
  });

  it('is refused during an active fight', async () => {
    for (let i = 0; i < 4; i++) ok(await shoot());
    fight();
    expect(await recoverAmmo(campaignId, p1, rangerId)).toEqual({ ok: false, error: 'Não dá para recolher munição durante o combate.' });
    expect((await data()).ammoToRecover).toEqual({ 'flechas-20': 4 });
  });

  it('after a recovery, the GM undoing an earlier shot gives back one arrow and the count stays 0', async () => {
    const first = ok(await shoot());
    ok(await shoot());
    ok(await recoverAmmo(campaignId, p1, rangerId));
    expect(await count('arrows')).toBe(19);
    ok(await undoAction(campaignId, gm, first.messageId));
    expect(await count('arrows')).toBe(20);
    expect((await data()).ammoToRecover?.['flechas-20'] ?? 0).toBe(0);
  });

  it('recreates the stack on an undo when it is gone', async () => {
    await patch((s) => { s.inventory.find((i: any) => i.id === 'arrows').quantity = 1; });
    const only = ok(await shoot());
    await patch((s) => { s.inventory = s.inventory.filter((i: any) => i.id !== 'arrows'); });
    ok(await undoAction(campaignId, gm, only.messageId));
    const stack = (await data()).inventory.find((i: any) => i.compendiumRef?.slug === 'flechas-20');
    expect(stack).toMatchObject({ name: 'Flechas', quantity: 1, compendiumRef: ref('flechas-20') });
  });

  it('creates the stack when it is gone at pick-up', async () => {
    ok(await shoot());
    ok(await shoot());
    await patch((s) => { s.inventory = s.inventory.filter((i: any) => i.id !== 'arrows'); });
    ok(await recoverAmmo(campaignId, p1, rangerId));
    const stack = (await data()).inventory.find((i: any) => i.compendiumRef?.slug === 'flechas-20');
    expect(stack).toMatchObject({ name: 'Flechas', quantity: 1 });
  });

  it('is the owner\'s or the GM\'s alone', async () => {
    const other: Viewer = { role: 'PLAYER', userId: (await createTestUser({ displayName: 'P5d ammo stranger' })).id };
    expect(await recoverAmmo(campaignId, other, rangerId)).toEqual({ ok: false, error: 'Not your token' });
    ok(await recoverAmmo(campaignId, gm, rangerId));
    await cleanupUsers([other.userId]);
  });
});

describe('undoing a pick-up', () => {
  it('takes back only what it gave: later shots and inventory changes stay, the count adds up', async () => {
    for (let i = 0; i < 4; i++) ok(await shoot());
    const pick = ok(await recoverAmmo(campaignId, p1, rangerId));
    expect(await count('arrows')).toBe(18);
    for (let i = 0; i < 3; i++) ok(await shoot());
    expect(await count('arrows')).toBe(15);
    expect(ok(await equipItem(campaignId, p1, rangerId, 'dagger', 'main')).ok).toBe(true);

    ok(await undoAction(campaignId, gm, pick.messageId));
    const s = await data();
    expect(await count('arrows')).toBe(13);
    expect(s.ammoToRecover).toEqual({ 'flechas-20': 7 });
    expect(s.inventory.find((i: any) => i.id === 'dagger').slot).toBe('main');
  });

  it('works in the reverse order too: an earlier shot undone, then the pick-up', async () => {
    const first = ok(await shoot());
    for (let i = 0; i < 3; i++) ok(await shoot());
    const pick = ok(await recoverAmmo(campaignId, p1, rangerId));
    expect(await count('arrows')).toBe(18);
    ok(await undoAction(campaignId, gm, first.messageId));
    expect(await count('arrows')).toBe(19);
    ok(await undoAction(campaignId, gm, pick.messageId));
    expect(await count('arrows')).toBe(17);
    // The count is what had been counted at the pick-up (4); the undone shot cannot be told apart from it.
    expect((await data()).ammoToRecover).toEqual({ 'flechas-20': 4 });
  });

  it('treats a count of one as nothing to recover: no card, no change to the stack', async () => {
    ok(await shoot());
    const out = ok(await recoverAmmo(campaignId, p1, rangerId));
    expect(out.recovered).toEqual({});
    expect(out.messageId).toBeUndefined();
    expect(await count('arrows')).toBe(19);
    expect((await data()).ammoToRecover).toEqual({ 'flechas-20': 1 });
  });

  it('drops zero keys when it writes the count', async () => {
    await patch((s) => { s.ammoToRecover = { 'flechas-20': 0, 'virotes-20': 5 }; });
    const out = ok(await recoverAmmo(campaignId, p1, rangerId));
    expect(out.recovered).toEqual({ 'virotes-20': 2 });
    expect((await data()).ammoToRecover).toBeUndefined();
    await patch((s) => { s.ammoToRecover = { 'flechas-20': 0 }; });
    ok(await recoverAmmo(campaignId, p1, rangerId));
    expect((await data()).ammoToRecover).toBeUndefined();
  });

  it('keeps a kind it found nowhere to put in the count', async () => {
    await patch((s) => { s.inventory = [{ id: 'x', name: 'Tralha', quantity: 1 }]; s.attacks = []; s.ammoToRecover = { 'flechas-20': 6 }; });
    const out = ok(await recoverAmmo(campaignId, p1, rangerId));
    expect(out.recovered).toEqual({});
    expect((await data()).ammoToRecover).toEqual({ 'flechas-20': 6 });
  });
});
