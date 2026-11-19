/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * The P5d "done when" session (inventory, ammunition, rations), played end to
 * end against the real curated data (materiais/.compendio/data, git-ignored;
 * the file skips when it is absent): a Faithful campaign with a ranger built
 * the guided-creation way (longbow in both hands, twenty arrows, the explorer's
 * pack opened) and a fighter (longsword, shield, chain mail). Three shots, the
 * GM's undo, "Sem flechas.", picking arrows up after the fight, the fighter's
 * greatsword and armour swaps, the armour refused in a fight, a group long
 * rest eating rations (and whispering the GM for who had none), its undo, and
 * the same steps in a Flexible campaign, where nothing is counted. Requires
 * PostgreSQL at DATABASE_URL.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { listActions, resolveAction, undoAction, type ActionRequest } from '../actionResolver';
import { equipItem, normalizedSheet, openPack, recoverAmmo, ARMOUR_IN_COMBAT } from '../inventory';
import { takeRest } from '../rest';
import { beginTurn, clearState, flushCombatWrites, getState, setState, type CombatantEntry } from '../../websocket/initiativeState';
import type { Viewer } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';

jest.setTimeout(60000);

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const DATA = resolve(__dirname, '../../../../materiais/.compendio/data/phb');
const TYPES = ['class', 'subclass', 'weapon', 'armor', 'gear', 'pack'];
const FILES = TYPES.map((t) => resolve(DATA, `${t}.json`));
const present = FILES.every((f) => existsSync(f));
if (!present) console.warn(`actionResolver.p5d.e2e: ${DATA} not found (the compendium data is private); skipping.`);
const describeIf = present ? describe : describe.skip;

const BOOK = `p5d-e2e-${randomUUID().slice(0, 8)}`;
const HIT: Rng = (sides) => sides;
const rows: any[] = present ? FILES.flatMap((f) => JSON.parse(readFileSync(f, 'utf8'))) : [];

const ref = (slug: string) => ({ bookId: BOOK, slug });
const sheetOf = (cls: string): any => JSON.parse(readFileSync(resolve(SHEETS, `${cls}.json`), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK)));

let campaignId: string;
let mapId: string;
let gmId: string;
let p1Id: string;
let gm: Viewer;
let p1: Viewer;
const ids: Record<string, string> = {};

const data = async (who: string): Promise<any> => (await prisma.character.findUniqueOrThrow({ where: { id: ids[who] } })).data;
const put = (who: string, s: any) => prisma.character.update({ where: { id: ids[who] }, data: { data: s } });
const item = async (who: string, name: string): Promise<any> => (await data(who)).inventory.find((i: any) => i.name === name);
const qty = async (who: string, name: string): Promise<number | undefined> => (await item(who, name))?.quantity;
const detail = (detailLevel: 'FAITHFUL' | 'FLEXIBLE') => prisma.campaign.update({ where: { id: campaignId }, data: { detailLevel } });

function ok<T extends { ok: boolean }>(out: T): Extract<T, { ok: true }> {
  if (!out.ok) throw new Error(`expected success, got ${(out as any).error}`);
  return out as Extract<T, { ok: true }>;
}

/** The ranger the way the guided creation stores it: no item ids, attacks not yet linked, then the server's normaliser. */
async function rangerSheet(): Promise<any> {
  const s = sheetOf('patrulheiro');
  s.inventory = [
    { name: 'Arco longo', quantity: 1, slot: 'both', equipped: true, compendiumRef: ref('arco-longo') },
    { name: 'Flechas', quantity: 20, slot: 'ammo', equipped: true, compendiumRef: ref('flechas-20') },
    { name: 'Pacote de Explorador', quantity: 1, compendiumRef: ref('pacote-de-explorador') },
  ];
  s.attacks = [{ name: 'Arco longo', attackBonus: 20, damageRoll: '1d8', damageType: 'perfurante', compendiumRef: ref('arco-longo') }];
  delete s.ammoToRecover;
  return normalizedSheet(campaignId, s);
}

async function fighterSheet(): Promise<any> {
  const s = sheetOf('guerreiro');
  s.inventory = [
    { name: 'Espada longa', quantity: 1, slot: 'main', equipped: true, compendiumRef: ref('espada-longa') },
    { name: 'Escudo', quantity: 1, slot: 'off', equipped: true, compendiumRef: ref('escudo') },
    { name: 'Cota de Malha', quantity: 1, slot: 'armor', equipped: true, compendiumRef: ref('cota-de-malha') },
    { name: 'Espada Grande', quantity: 1, compendiumRef: ref('espada-grande') },
    { name: 'Couro Batido', quantity: 1, compendiumRef: ref('couro-batido') },
  ];
  s.attacks = [
    { name: 'Espada longa', attackBonus: 20, damageRoll: '1d8', damageType: 'cortante', compendiumRef: ref('espada-longa') },
    { name: 'Espada Grande', attackBonus: 20, damageRoll: '2d6', damageType: 'cortante', compendiumRef: ref('espada-grande') },
  ];
  s.armorClass = 18; // chain mail 16 + shield 2
  return normalizedSheet(campaignId, s);
}

const scoutSheet = (): any => ({ ...sheetOf('guerreiro'), inventory: [{ name: 'Corda', quantity: 1 }], attacks: [] });

const goblin = { ac: 12, hpMax: 700, speed: '9 m', abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, actions: [] };
const token = (over: Record<string, unknown>): any => ({
  imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, ...over,
});
const combatant = (tokenId: string, characterId: string | null): CombatantEntry => ({
  tokenId, mapId, name: tokenId, imageUrl: '', initiative: 10, hp: null, type: 'player', disposition: null, characterId,
});
const fight = (current: 'ranger' | 'fighter') =>
  setState(campaignId, beginTurn({ active: true, round: 1, currentTokenId: null, combatants: [combatant('ranger', ids.ranger), combatant('fighter', ids.fighter), combatant('goblin', null)] }, current));
const nextTurn = (who: 'ranger' | 'fighter') => {
  // A new turn of the same fight: the spend starts over.
  const state = getState(campaignId);
  setState(campaignId, beginTurn(state, who));
};
const endFight = async () => { clearState(campaignId); await flushCombatWrites(campaignId); };

const shoot = (rng: Rng = HIT) => resolveAction(campaignId, p1, { mapId, actorTokenId: 'ranger', actionId: 'attack:0', targetTokenId: 'goblin', mode: 'normal' } as ActionRequest, rng);
const barAttacks = async (tokenId: string): Promise<string[]> => {
  const listed = await listActions(campaignId, p1, mapId, tokenId);
  if ('error' in listed) throw new Error(listed.error);
  return listed.options.filter((o) => o.id.startsWith('attack:')).map((o) => o.name);
};
const whispers = () => prisma.message.findMany({ where: { campaignId, type: 'WHISPER' } });

async function reset() {
  clearState(campaignId);
  await flushCombatWrites(campaignId);
  await prisma.message.deleteMany({ where: { campaignId } });
  await put('ranger', await rangerSheet());
  await put('fighter', await fighterSheet());
  await put('scout', scoutSheet());
}

describeIf('the P5d done-when session, against the real curated data', () => {
  beforeAll(async () => {
    const users = await Promise.all(['GM', 'P1'].map((n) => createTestUser({ displayName: `P5d e2e ${n}` })));
    [gmId, p1Id] = users.map((u) => u.id);
    gm = { role: 'GM', userId: gmId };
    p1 = { role: 'PLAYER', userId: p1Id };
    campaignId = (await createTestCampaign(gmId, { name: 'P5d e2e', gameSystem: 'FIFTH_EDITION' })).id;
    await prisma.campaign.update({ where: { id: campaignId }, data: { detailLevel: 'FAITHFUL' } });
    await prisma.campaignMembership.createMany({
      data: [
        { userId: gmId, campaignId, role: 'GM', characterIds: [] },
        { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      ],
    });
    await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5d e2e book', gameSystem: 'FIFTH_EDITION' } });
    await prisma.compendiumEntry.createMany({
      data: rows.map((e) => ({ bookId: BOOK, type: e.type, slug: e.slug, name: e.name, search: String(e.name).toLowerCase(), text: '', data: e.data as object })),
      skipDuplicates: true,
    });
    await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
    for (const [who, cls] of [['ranger', 'patrulheiro'], ['fighter', 'guerreiro'], ['scout', 'guerreiro']] as const) {
      ids[who] = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: who, data: sheetOf(cls) } })).id;
    }
    mapId = (await prisma.map.create({
      data: {
        campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: 100, gridSize: 50, feetPerSquare: 5, diagonalRule: 'flat', annotations: [],
        tokens: [
          token({ id: 'ranger', name: 'Patrulheira', position: { x: 10, y: 10 }, characterId: ids.ranger, controlledBy: p1Id, type: 'player' }),
          token({ id: 'fighter', name: 'Guerreiro', position: { x: 12, y: 10 }, characterId: ids.fighter, controlledBy: p1Id, type: 'player' }),
          token({ id: 'goblin', name: 'Goblin', position: { x: 11, y: 10 }, type: 'npc', hp: { current: 700, max: 700, temp: 0 }, statBlock: goblin }),
        ],
      },
    })).id;
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
    await reset();
  });

  afterAll(async () => {
    clearState(campaignId);
    await flushCombatWrites(campaignId);
    await prisma.message.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await prisma.compendiumBook.delete({ where: { id: BOOK } });
    await cleanupUsers([gmId, p1Id]);
    await prisma.$disconnect();
  });

  it('reads the entries the session needs from the data', () => {
    const slugs = new Set(rows.map((r) => `${r.type}/${r.slug}`));
    for (const s of ['weapon/arco-longo', 'weapon/espada-longa', 'weapon/espada-grande', 'armor/cota-de-malha', 'armor/couro-batido', 'armor/escudo', 'gear/flechas-20', 'pack/pacote-de-explorador']) {
      expect(slugs.has(s)).toBe(true);
    }
  });

  describe('in a Faithful campaign', () => {
    beforeAll(reset);

    it('has the ranger\'s sheet in slots with the attack linked to the bow, and the pack opens into items', async () => {
      let s = await data('ranger');
      const bow = s.inventory.find((i: any) => i.name === 'Arco longo');
      expect(bow).toMatchObject({ slot: 'both', id: expect.any(String) });
      expect(s.inventory.find((i: any) => i.name === 'Flechas')).toMatchObject({ slot: 'ammo', quantity: 20 });
      expect(s.attacks[0].itemId).toBe(bow.id);
      const pack = s.inventory.find((i: any) => i.name === 'Pacote de Explorador');
      ok(await openPack(campaignId, p1, ids.ranger, pack.id));
      s = await data('ranger');
      expect(s.inventory.find((i: any) => i.name === 'Pacote de Explorador')).toBeUndefined();
      const rations = s.inventory.find((i: any) => i.compendiumRef?.slug === 'racoes-de-viagem-1-dia');
      expect(rations?.quantity).toBe(10);
      expect(s.inventory.find((i: any) => i.compendiumRef?.slug === 'tocha')?.quantity).toBe(10);
      expect(s.inventory.find((i: any) => i.compendiumRef?.slug === 'corda-de-canhamo-15-metros')?.quantity).toBe(1);
      expect(s.inventory.length).toBeGreaterThan(5);
      expect(s.inventory.find((i: any) => i.name === 'Flechas')).toMatchObject({ slot: 'ammo', quantity: 20 });
    });

    it('shoots three arrows, takes one back on the GM\'s undo, and refuses with no arrows', async () => {
      fight('ranger');
      ok(await shoot());
      nextTurn('ranger');
      ok(await shoot());
      nextTurn('ranger');
      const third = ok(await shoot());
      expect(await qty('ranger', 'Flechas')).toBe(17);
      expect((await data('ranger')).ammoToRecover).toEqual({ 'flechas-20': 3 });
      ok(await undoAction(campaignId, gm, third.messageId));
      expect(await qty('ranger', 'Flechas')).toBe(18);
      expect((await data('ranger')).ammoToRecover).toEqual({ 'flechas-20': 2 });
      // One more shot: an odd 3 pending, so the pickup below shows the rounding down.
      nextTurn('ranger');
      ok(await shoot());
      expect(await qty('ranger', 'Flechas')).toBe(17);
      expect((await data('ranger')).ammoToRecover).toEqual({ 'flechas-20': 3 });

      const s = await data('ranger');
      s.inventory.find((i: any) => i.name === 'Flechas').quantity = 0;
      await put('ranger', s);
      nextTurn('ranger');
      expect(await shoot()).toEqual({ ok: false, error: 'Sem flechas.' });
    });

    it('picks half of the shots up after the fight, refusing during it', async () => {
      expect(await recoverAmmo(campaignId, p1, ids.ranger)).toEqual({ ok: false, error: 'Não dá para recolher munição durante o combate.' });
      await endFight();
      const out = ok(await recoverAmmo(campaignId, p1, ids.ranger));
      expect(out.recovered).toEqual({ 'flechas-20': 1 });
      expect(await qty('ranger', 'Flechas')).toBe(1);
      expect((await data('ranger')).ammoToRecover).toBeUndefined();
    });

    it('swaps the fighter to the greatsword: two hands, AC down 2, the bar shows only that sword', async () => {
      expect((await data('fighter')).armorClass).toBe(18);
      expect(await barAttacks('fighter')).toEqual(['Espada longa']);
      const greatsword = await item('fighter', 'Espada Grande');
      const out = ok(await equipItem(campaignId, p1, ids.fighter, greatsword.id, 'both'));
      expect(out.ac).toBe(16);
      const s = await data('fighter');
      expect(s.armorClass).toBe(16);
      expect(s.inventory.find((i: any) => i.name === 'Espada Grande').slot).toBe('both');
      expect(s.inventory.find((i: any) => i.name === 'Espada longa').slot).toBeUndefined();
      expect(s.inventory.find((i: any) => i.name === 'Escudo').slot).toBeUndefined();
      expect(await barAttacks('fighter')).toEqual(['Espada Grande']);
    });

    it('changes chain mail for studded leather outside a fight with the AC by the book, and refuses it in a fight', async () => {
      const chain = await item('fighter', 'Cota de Malha');
      const studded = await item('fighter', 'Couro Batido');
      ok(await equipItem(campaignId, p1, ids.fighter, chain.id, null));
      const out = ok(await equipItem(campaignId, p1, ids.fighter, studded.id, 'armor'));
      // Studded leather 12 + Dexterity 2, no shield in hand.
      expect(out.ac).toBe(14);
      expect((await data('fighter')).armorClass).toBe(14);

      fight('fighter');
      expect(await equipItem(campaignId, p1, ids.fighter, chain.id, 'armor')).toEqual({ ok: false, error: ARMOUR_IN_COMBAT });
      expect(await equipItem(campaignId, p1, ids.fighter, studded.id, null)).toEqual({ ok: false, error: ARMOUR_IN_COMBAT });
      expect((await data('fighter')).armorClass).toBe(14);
      await endFight();
    });

    it('eats one ration of each on a group long rest, whispers the GM for who had none, and the undo gives it back', async () => {
      const f = await data('fighter');
      f.inventory.push({ name: 'Rações de viagem (1 dia)', quantity: 4, compendiumRef: ref('racoes-de-viagem-1-dia') });
      await put('fighter', f);
      const out = ok(await takeRest(campaignId, gm, [ids.ranger, ids.fighter, ids.scout], 'long'));
      expect((await data('ranger')).inventory.find((i: any) => i.compendiumRef?.slug === 'racoes-de-viagem-1-dia').quantity).toBe(9);
      expect(await qty('fighter', 'Rações de viagem (1 dia)')).toBe(3);
      expect((await data('scout')).inventory).toEqual([{ name: 'Corda', quantity: 1 }]);
      const sent = await whispers();
      expect(sent).toHaveLength(1);
      expect(sent[0].content).toBe('Sem ração no descanso: scout.');

      ok(await undoAction(campaignId, gm, out.messageId));
      expect((await data('ranger')).inventory.find((i: any) => i.compendiumRef?.slug === 'racoes-de-viagem-1-dia').quantity).toBe(10);
      expect(await qty('fighter', 'Rações de viagem (1 dia)')).toBe(4);
      expect((await data('scout')).inventory).toEqual([{ name: 'Corda', quantity: 1 }]);
      expect(await whispers()).toHaveLength(1);
    });
  });

  describe('in a Flexible campaign', () => {
    beforeAll(async () => {
      await detail('FLEXIBLE');
      await reset();
    });
    afterAll(async () => { await detail('FAITHFUL'); });

    it('counts no arrow, recovers nothing, and eats no ration', async () => {
      const pack = await item('ranger', 'Pacote de Explorador');
      ok(await openPack(campaignId, p1, ids.ranger, pack.id));
      fight('ranger');
      ok(await shoot());
      nextTurn('ranger');
      ok(await shoot());
      expect(await qty('ranger', 'Flechas')).toBe(20);
      expect((await data('ranger')).ammoToRecover).toBeUndefined();
      await endFight();
      expect(ok(await recoverAmmo(campaignId, p1, ids.ranger)).recovered).toEqual({});
      expect(await qty('ranger', 'Flechas')).toBe(20);

      const s = await data('ranger');
      s.spellcasting.slots['1'] = { total: 3, expended: 2 };
      await put('ranger', s);
      ok(await takeRest(campaignId, gm, [ids.ranger, ids.scout], 'long'));
      const after = await data('ranger');
      expect(after.inventory.find((i: any) => i.compendiumRef?.slug === 'racoes-de-viagem-1-dia').quantity).toBe(10);
      expect(after.spellcasting.slots['1'].expended).toBe(0);
      expect(await whispers()).toHaveLength(0);
    });

    it('still swaps the greatsword and the armour, and the AC follows', async () => {
      const greatsword = await item('fighter', 'Espada Grande');
      expect(ok(await equipItem(campaignId, p1, ids.fighter, greatsword.id, 'both')).ac).toBe(16);
      expect(await barAttacks('fighter')).toEqual(['Espada Grande']);
      const chain = await item('fighter', 'Cota de Malha');
      const studded = await item('fighter', 'Couro Batido');
      ok(await equipItem(campaignId, p1, ids.fighter, chain.id, null));
      expect(ok(await equipItem(campaignId, p1, ids.fighter, studded.id, 'armor')).ac).toBe(14);
      // Even in a fight: nothing is charged in a Flexible campaign.
      fight('fighter');
      expect(ok(await equipItem(campaignId, p1, ids.fighter, chain.id, 'armor')).ac).toBe(16);
      await endFight();
    });
  });
});
