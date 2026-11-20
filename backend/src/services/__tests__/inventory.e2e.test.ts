/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets are JSON read loosely */
/**
 * Equipping, stowing and opening packs through the server: the hand rules,
 * the armour class by difference, the Faithful fight's costs (one free object
 * interaction a turn, the action for more or for a shield, no armour at all),
 * who may do it, two changes at once on one character, the boot backfill of
 * sheets made before body slots, the save path, and opening a pack. The
 * compendium entries are invented minimal ones (no book text) under a book of
 * this file's own. Requires PostgreSQL at DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { equipItem, openPack } from '../inventory';
import { backfillInventory } from '../inventoryBackfill';
import { beginTurn, clearState, flushCombatWrites, getState, setState, type CombatantEntry } from '../../websocket/initiativeState';
import type { Viewer } from '../../rules/actions/actionCard';

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const BOOK = `p5d-inv-${randomUUID().slice(0, 8)}`;
const NOT_YOUR_TURN = 'Não é a sua vez.';
const ARMOUR = 'Leva minutos para vestir ou tirar armadura.';
const ACTION_SPENT = 'Você já usou a ação neste turno.';
const NO_CONTENTS = 'Esse pacote não tem conteúdo conhecido.';
const WRONG_SLOT = 'Esse item não vai nesse espaço.';

const weapon = (properties: string[], extra: Record<string, unknown> = {}) => ({
  category: 'martial', range: 'melee', damage: { dice: '1d8', type: 'cortante' }, properties, cost: '1 po', weight: 1, ...extra,
});
const armour = (category: string, baseAc: number, addDex: boolean, extra: Record<string, unknown> = {}) => ({
  category, baseAc, addDex, stealthDisadvantage: false, cost: '1 po', weight: 5, ...extra,
});

const ENTRIES: { type: string; slug: string; name: string; data: Record<string, unknown> }[] = [
  { type: 'weapon', slug: 'espada-longa', name: 'Espada Longa', data: weapon(['versátil'], { versatile: '1d10' }) },
  { type: 'weapon', slug: 'espada-grande', name: 'Espada Grande', data: weapon(['pesada', 'duas mãos']) },
  { type: 'weapon', slug: 'adaga', name: 'Adaga', data: weapon(['leve', 'acuidade', 'arremesso']) },
  { type: 'weapon', slug: 'arco-longo', name: 'Arco Longo', data: weapon(['munição', 'pesada', 'duas mãos'], { range: 'ranged', ammunition: 'flechas-20' }) },
  { type: 'armor', slug: 'escudo', name: 'Escudo', data: armour('shield', 2, false) },
  { type: 'armor', slug: 'cota-de-malha', name: 'Cota de Malha', data: armour('heavy', 16, false) },
  { type: 'armor', slug: 'couro', name: 'Couro', data: armour('light', 11, true) },
  { type: 'gear', slug: 'flechas-20', name: 'Flechas (20)', data: { cost: '1 po', weight: 0.5 } },
  { type: 'gear', slug: 'tocha', name: 'Tocha', data: { cost: '1 pc', weight: 0.5 } },
  { type: 'gear', slug: 'racoes-de-viagem-1-dia', name: 'Rações de viagem (1 dia)', data: { cost: '5 pp', weight: 1 } },
  { type: 'gear', slug: 'corda-de-canhamo-15-metros', name: 'Corda de cânhamo (15 metros)', data: { cost: '1 po', weight: 5 } },
  { type: 'gear', slug: 'mochila', name: 'Mochila', data: { cost: '2 po', weight: 2.5 } },
  { type: 'gear', slug: 'pedra-de-amolar', name: 'Pedra de amolar', data: { cost: '1 pc', weight: 0.5 } },
  {
    type: 'pack', slug: 'pacote-de-explorador', name: 'Pacote de Explorador',
    data: {
      cost: '10 po', contents: ['inventado'],
      items: [
        { ref: { type: 'gear', slug: 'mochila' }, quantity: 1 },
        { ref: { type: 'gear', slug: 'tocha' }, quantity: 10 },
        { ref: { type: 'gear', slug: 'racoes-de-viagem-1-dia' }, quantity: 10 },
        { ref: { type: 'gear', slug: 'corda-de-canhamo-15-metros' }, quantity: 1 },
        { ref: { type: 'gear', slug: 'flechas-20' }, quantity: 1 },
        { name: 'Pederneira', quantity: 1 },
      ],
    },
  },
  { type: 'pack', slug: 'pacote-sem-lista', name: 'Pacote sem lista', data: { cost: '1 po', contents: ['inventado'] } },
];

const ref = (slug: string) => ({ bookId: BOOK, slug });

/** The fighter as stored: longsword and shield in hand, chain mail on, AC 16 + 2. */
function fighterSheet(): any {
  const raw = readFileSync(resolve(SHEETS, 'guerreiro.json'), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK));
  const sheet = JSON.parse(raw);
  sheet.armorClass = 18;
  sheet.inventory = [
    { id: 'sword', name: 'Espada longa', quantity: 1, equipped: true, slot: 'main', compendiumRef: ref('espada-longa') },
    { id: 'shield', name: 'Escudo', quantity: 1, equipped: true, slot: 'off', compendiumRef: ref('escudo') },
    { id: 'chain', name: 'Cota de malha', quantity: 1, equipped: true, slot: 'armor', compendiumRef: ref('cota-de-malha') },
    { id: 'great', name: 'Espada grande', quantity: 1, equipped: false, compendiumRef: ref('espada-grande') },
    { id: 'leather', name: 'Couro', quantity: 1, equipped: false, compendiumRef: ref('couro') },
    { id: 'dagger', name: 'Adaga', quantity: 1, equipped: false, compendiumRef: ref('adaga') },
    { id: 'torch', name: 'Tocha', quantity: 2, compendiumRef: ref('tocha') },
    { id: 'rope', name: 'Pedra de amolar', quantity: 1, compendiumRef: ref('pedra-de-amolar') },
  ];
  sheet.attacks = [
    { name: 'Espada longa', attackBonus: 5, damageRoll: '1d8+3', damageType: 'cortante', itemId: 'sword', compendiumRef: ref('espada-longa') },
    { name: 'Espada grande', attackBonus: 5, damageRoll: '2d6+3', damageType: 'cortante', itemId: 'great', compendiumRef: ref('espada-grande') },
  ];
  return sheet;
}

/** A sheet from before body slots: `equipped` marks, no ids, a bundle of arrows, an unopened pack. */
function oldSheet(): any {
  const sheet = fighterSheet();
  sheet.inventory = [
    { name: 'Espada longa', quantity: 1, equipped: true, equippable: true, compendiumRef: ref('espada-longa') },
    { name: 'Escudo', quantity: 1, equipped: true, equippable: true, compendiumRef: ref('escudo') },
    { name: 'Cota de malha', quantity: 1, equipped: true, equippable: true, compendiumRef: ref('cota-de-malha') },
    { name: 'Flechas (20)', quantity: 1, compendiumRef: ref('flechas-20') },
    { name: 'Pacote de Explorador', quantity: 1, compendiumRef: ref('pacote-de-explorador') },
  ];
  sheet.attacks = [{ name: 'Espada longa', attackBonus: 5, damageRoll: '1d8+3', damageType: 'cortante', compendiumRef: ref('espada-longa') }];
  return sheet;
}

let gmId: string;
let p1Id: string;
let p2Id: string;
let campaignId: string;
let mapId: string;
let gm: Viewer;
let p1: Viewer;
let p2: Viewer;
let fighterId: string;
let otherId: string;
let p1Email: string;

const data = async (id = fighterId): Promise<any> => (await prisma.character.findUniqueOrThrow({ where: { id } })).data;
const item = (sheet: any, id: string) => sheet.inventory.find((i: any) => i.id === id);
async function setSheet(change: (s: any) => void, id = fighterId) {
  const s = await data(id);
  change(s);
  await prisma.character.update({ where: { id }, data: { data: s } });
}
const combatant = (tokenId: string, characterId: string | null): CombatantEntry => ({
  tokenId, mapId, name: tokenId, imageUrl: '', initiative: 10, hp: null, type: 'player', disposition: null, characterId,
});

/** A fight with the fighter and a goblin; `turn` says whose turn it is. */
function fight(turn: 'fighter' | 'goblin') {
  setState(campaignId, beginTurn({ active: true, round: 1, currentTokenId: null, combatants: [combatant('fighter', fighterId), combatant('goblin', null)] }, turn));
}
const spend = () => getState(campaignId).spend.fighter;
const detail = (detailLevel: 'FAITHFUL' | 'FLEXIBLE') => prisma.campaign.update({ where: { id: campaignId }, data: { detailLevel } });

function ok<T extends { ok: boolean }>(out: T): Extract<T, { ok: true }> {
  if (!out.ok) throw new Error(`expected success, got ${(out as any).error}`);
  return out as Extract<T, { ok: true }>;
}

beforeAll(async () => {
  const users = await Promise.all(['GM', 'P1', 'P2'].map((n) => createTestUser({ displayName: `P5d inventory ${n}` })));
  [gmId, p1Id, p2Id] = users.map((u) => u.id);
  p1Email = users[1].email;
  gm = { role: 'GM', userId: gmId };
  p1 = { role: 'PLAYER', userId: p1Id };
  p2 = { role: 'PLAYER', userId: p2Id };
  campaignId = (await createTestCampaign(gmId, { name: 'P5d inventory', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5d inventory test book', gameSystem: 'FIFTH_EDITION' } });
  await prisma.compendiumEntry.createMany({
    data: ENTRIES.map((e) => ({ bookId: BOOK, type: e.type, slug: e.slug, name: e.name, search: e.name.toLowerCase(), text: 'Texto inventado.', data: e.data as object })),
  });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
  fighterId = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'fighter', data: fighterSheet() } })).id;
  otherId = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'old', data: oldSheet() } })).id;
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: 100, gridSize: 50, feetPerSquare: 5, diagonalRule: 'flat', annotations: [], tokens: [] },
  })).id;
  await prisma.map.update({
    where: { id: mapId },
    data: {
      tokens: [
        { id: 'fighter', name: 'fighter', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, characterId: fighterId, controlledBy: p1Id, type: 'player' },
        { id: 'goblin', name: 'goblin', imageUrl: '', position: { x: 3, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, type: 'npc' },
      ],
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
});

beforeEach(async () => {
  await detail('FAITHFUL');
  await prisma.character.update({ where: { id: fighterId }, data: { data: fighterSheet() } });
  await prisma.character.update({ where: { id: otherId }, data: { data: oldSheet() } });
});

afterEach(async () => {
  clearState(campaignId);
  await flushCombatWrites(campaignId);
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await prisma.compendiumBook.delete({ where: { id: BOOK } });
  await cleanupUsers([gmId, p1Id, p2Id]);
  await prisma.$disconnect();
});

describe('in a Faithful fight, on the fighter\'s turn', () => {
  it('swapping longsword and shield for the greatsword takes the action and the AC drops by 2', async () => {
    fight('fighter');
    const out = ok(await equipItem(campaignId, p1, fighterId, 'great', 'both'));
    expect(out).toEqual({ ok: true, ac: 16, acUnknown: false });
    const s = await data();
    expect(item(s, 'great').slot).toBe('both');
    expect(item(s, 'sword').slot).toBeUndefined();
    expect(item(s, 'shield').slot).toBeUndefined();
    expect(item(s, 'chain').slot).toBe('armor');
    expect(s.armorClass).toBe(16);
    expect(spend()).toMatchObject({ action: true, objectInteractions: 2 });
  });

  it('drawing one sword is the free interaction, a second one takes the action, a third is refused', async () => {
    await setSheet((s) => { delete item(s, 'sword').slot; item(s, 'sword').equipped = false; });
    fight('fighter');
    ok(await equipItem(campaignId, p1, fighterId, 'sword', 'main'));
    expect(spend()).toMatchObject({ action: false, objectInteractions: 1 });
    expect(item(await data(), 'sword').slot).toBe('main');

    ok(await equipItem(campaignId, p1, fighterId, 'sword', null));
    expect(spend()).toMatchObject({ action: true, objectInteractions: 2 });

    expect(await equipItem(campaignId, p1, fighterId, 'sword', 'main')).toEqual({ ok: false, error: ACTION_SPENT });
    expect(item(await data(), 'sword').slot).toBeUndefined();
  });

  it('taking off the shield takes the action and no interaction', async () => {
    fight('fighter');
    expect(ok(await equipItem(campaignId, p1, fighterId, 'shield', null)).ac).toBe(16);
    expect(spend()).toMatchObject({ action: true, objectInteractions: 0 });
  });

  it('refuses body armour', async () => {
    fight('fighter');
    expect(await equipItem(campaignId, p1, fighterId, 'leather', 'armor')).toEqual({ ok: false, error: ARMOUR });
    expect(item(await data(), 'chain').slot).toBe('armor');
    expect(spend()).toMatchObject({ action: false, objectInteractions: 0 });
  });
});

describe('in a Faithful fight, off the fighter\'s turn', () => {
  it('refuses the swap and changes nothing', async () => {
    fight('goblin');
    expect(await equipItem(campaignId, p1, fighterId, 'great', 'both')).toEqual({ ok: false, error: NOT_YOUR_TURN });
    const s = await data();
    expect(item(s, 'sword').slot).toBe('main');
    expect(s.armorClass).toBe(18);
  });
});

describe('outside a fight, and in Flexible', () => {
  it('lets the armour change out of combat, and the AC follows the formula', async () => {
    const out = ok(await equipItem(campaignId, p1, fighterId, 'leather', 'armor'));
    // 18 − (16) + (11 + Dex 2)
    expect(out).toEqual({ ok: true, ac: 15, acUnknown: false });
    const s = await data();
    expect(item(s, 'leather').slot).toBe('armor');
    expect(item(s, 'leather').equipped).toBe(true);
    expect(item(s, 'chain').slot).toBeUndefined();
    expect(item(s, 'chain').equipped).toBe(false);
    expect(s.armorClass).toBe(15);
  });

  it('makes everything free in a Flexible fight', async () => {
    await detail('FLEXIBLE');
    fight('goblin');
    ok(await equipItem(campaignId, p1, fighterId, 'leather', 'armor'));
    ok(await equipItem(campaignId, p1, fighterId, 'great', 'both'));
    ok(await equipItem(campaignId, p1, fighterId, 'dagger', 'main'));
    const s = await data();
    expect(item(s, 'dagger').slot).toBe('main');
    expect(s.armorClass).toBe(13);
    expect(spend()).toMatchObject({ action: false, objectInteractions: 0 });
  });

  it('refuses an item in a slot it cannot go in', async () => {
    expect(await equipItem(campaignId, p1, fighterId, 'shield', 'main')).toEqual({ ok: false, error: WRONG_SLOT });
    expect(await equipItem(campaignId, p1, fighterId, 'rope', 'main')).toEqual({ ok: false, error: WRONG_SLOT });
  });

  it('puts a two-handed weapon dropped on one hand in both', async () => {
    ok(await equipItem(campaignId, p1, fighterId, 'great', 'off'));
    const s = await data();
    expect(item(s, 'great').slot).toBe('both');
    expect(item(s, 'sword').slot).toBeUndefined();
    expect(item(s, 'shield').slot).toBeUndefined();
  });
});

describe('who may equip', () => {
  it('refuses a stranger player and a spectator, and lets the GM', async () => {
    expect(await equipItem(campaignId, p2, fighterId, 'great', 'both')).toEqual({ ok: false, error: 'Not your token' });
    expect(await equipItem(campaignId, { role: 'SPECTATOR', userId: p1Id }, fighterId, 'great', 'both')).toEqual({ ok: false, error: 'Not your token' });
    expect(await openPack(campaignId, p2, otherId, 'x')).toEqual({ ok: false, error: 'Not your token' });
    expect(item(await data(), 'great').slot).toBeUndefined();
    ok(await equipItem(campaignId, gm, fighterId, 'great', 'both'));
    expect(item(await data(), 'great').slot).toBe('both');
  });
});

describe('two changes at once on one character', () => {
  it('lands both, and the AC reflects both', async () => {
    const [a, b] = await Promise.all([
      equipItem(campaignId, p1, fighterId, 'dagger', 'off'),
      equipItem(campaignId, gm, fighterId, 'leather', 'armor'),
    ]);
    ok(a);
    ok(b);
    const s = await data();
    expect(item(s, 'dagger').slot).toBe('off');
    expect(item(s, 'leather').slot).toBe('armor');
    expect(item(s, 'shield').slot).toBeUndefined();
    // 18 − shield 2 − chain 16 + leather 13
    expect(s.armorClass).toBe(13);
  });
});

describe('a sheet made before body slots', () => {
  it('is given ids and slots once by the backfill, keeps its AC, and reads 20 arrows', async () => {
    await backfillInventory();
    const s = await data(otherId);
    expect(s.armorClass).toBe(18);
    const byName = (name: string) => s.inventory.find((i: any) => i.name === name);
    expect(s.inventory.every((i: any) => typeof i.id === 'string' && i.id.length > 0)).toBe(true);
    expect(byName('Espada longa').slot).toBe('main');
    expect(byName('Escudo').slot).toBe('off');
    expect(byName('Cota de malha').slot).toBe('armor');
    expect(byName('Flechas')).toMatchObject({ quantity: 20 });
    expect(byName('Pacote de Explorador')).toMatchObject({ quantity: 1 });
    expect(s.attacks[0].itemId).toBe(byName('Espada longa').id);

    const before = await prisma.character.findUniqueOrThrow({ where: { id: otherId } });
    await backfillInventory();
    const after = await prisma.character.findUniqueOrThrow({ where: { id: otherId } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.data).toEqual(before.data);
  });

  it('stores an item added in the editor with an id when the sheet is saved', async () => {
    const agent = request.agent(createTestApp());
    expect((await agent.post('/api/auth/login').send({ email: p1Email, password: TEST_PASSWORD })).status).toBe(200);
    const sheet = fighterSheet();
    sheet.inventory.push({ name: 'Corda', quantity: 1 });
    expect((await agent.put(`/api/characters/${fighterId}`).send({ data: sheet })).status).toBe(200);
    const corda = (await data()).inventory.find((i: any) => i.name === 'Corda');
    expect(typeof corda.id).toBe('string');
    expect(corda.id.length).toBeGreaterThan(0);

    const created = await agent.post('/api/characters').send({ name: 'Novo', gameSystem: 'FIFTH_EDITION', campaignId, data: oldSheet() });
    expect(created.status).toBe(201);
    const stored = (await prisma.character.findUniqueOrThrow({ where: { id: created.body.character.id } })).data as any;
    expect(stored.inventory.every((i: any) => typeof i.id === 'string')).toBe(true);
    expect(stored.inventory.find((i: any) => i.name === 'Flechas')).toMatchObject({ quantity: 20 });
    await prisma.character.delete({ where: { id: created.body.character.id } });
  });
});

describe('opening a pack', () => {
  it('replaces the pack by its items, merging what is already there', async () => {
    await setSheet((s) => {
      s.inventory.push({ id: 'pack', name: 'Pacote de Explorador', quantity: 1, compendiumRef: ref('pacote-de-explorador') });
      s.inventory.push({ id: 'arrows', name: 'Flechas', quantity: 5, compendiumRef: ref('flechas-20') });
    });
    ok(await openPack(campaignId, p1, fighterId, 'pack'));
    const s = await data();
    const byName = (name: string) => s.inventory.filter((i: any) => i.name === name);
    expect(item(s, 'pack')).toBeUndefined();
    expect(s.inventory.some((i: any) => i.compendiumRef?.slug === 'pacote-de-explorador')).toBe(false);
    expect(byName('Rações de viagem (1 dia)')).toEqual([expect.objectContaining({ quantity: 10, weight: 2, compendiumRef: ref('racoes-de-viagem-1-dia') })]);
    expect(item(s, 'torch').quantity).toBe(12);
    expect(byName('Corda de cânhamo (15 metros)')).toEqual([expect.objectContaining({ quantity: 1, weight: 10 })]);
    expect(byName('Mochila')).toHaveLength(1);
    expect(byName('Pederneira')).toEqual([expect.objectContaining({ quantity: 1 })]);
    expect(item(s, 'arrows').quantity).toBe(25);
    expect(s.inventory.every((i: any) => typeof i.id === 'string')).toBe(true);
    expect(new Set(s.inventory.map((i: any) => i.id)).size).toBe(s.inventory.length);
  });

  it('weighs each arrow of a bundle it splits as a share of the bundle', async () => {
    await setSheet((s) => {
      s.inventory = s.inventory.filter((i: any) => i.compendiumRef?.slug !== 'flechas-20');
      s.inventory.push({ id: 'pack', name: 'Pacote de Explorador', quantity: 1, compendiumRef: ref('pacote-de-explorador') });
    });
    ok(await openPack(campaignId, p1, fighterId, 'pack'));
    // 0.5 kg for the bundle of 20 is 1 lb, so 0.05 lb an arrow.
    expect((await data()).inventory.filter((i: any) => i.name === 'Flechas')).toEqual([expect.objectContaining({ quantity: 20, weight: 0.05 })]);
  });

  it('opens one of several packs', async () => {
    await setSheet((s) => { s.inventory.push({ id: 'pack', name: 'Pacote de Explorador', quantity: 2, compendiumRef: ref('pacote-de-explorador') }); });
    ok(await openPack(campaignId, p1, fighterId, 'pack'));
    const s = await data();
    expect(item(s, 'pack').quantity).toBe(1);
    expect(item(s, 'torch').quantity).toBe(12);
  });

  it('refuses a pack with no known contents', async () => {
    await setSheet((s) => { s.inventory.push({ id: 'pack', name: 'Pacote sem lista', quantity: 1, compendiumRef: ref('pacote-sem-lista') }); });
    expect(await openPack(campaignId, p1, fighterId, 'pack')).toEqual({ ok: false, error: NO_CONTENTS });
    expect(item(await data(), 'pack')).toBeTruthy();
  });
});
