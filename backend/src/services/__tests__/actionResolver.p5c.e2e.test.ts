/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * The P5c "done when" round, played end to end against the real curated data
 * (materiais/.compendio/data, git-ignored; the file skips when it is absent):
 * the twelve level-3 sheets of the guided-creation fixtures and two goblins
 * in one fight. The GM runs the order over the socket (add, start, next,
 * end), each player walks over the socket, and each character takes its turn
 * from the bar: an action, a bonus action where the class has one, at least
 * one class feature, a walk within its budget. The server restarts in the
 * middle of the fight; then a short and a long rest. The class, subclass,
 * weapon and spell entries are read from the data files and seeded under a
 * book of this file's own; the rolls are fixed and the numbers worked out by
 * hand from the Player's Handbook (Rage, Sneak Attack, Divine Smite, Second
 * Wind, Flurry of Blows, Bardic Inspiration, Font of Magic, Wild Shape,
 * Channel Divinity, rests). Requires PostgreSQL at DATABASE_URL.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { resolveAction, listActions, type ActionRequest } from '../actionResolver';
import { takeRest } from '../rest';
import {
  clearState,
  flushCombatWrites,
  forgetCombatMemory,
  freshSpend,
  getState,
  hydrateCombatStates,
} from '../../websocket/initiativeState';
import type { Viewer } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';

jest.setTimeout(60000);

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const DATA = resolve(__dirname, '../../../../materiais/.compendio/data/phb');
const FILES = ['class', 'subclass', 'weapon', 'spell'].map((t) => resolve(DATA, `${t}.json`));
const present = FILES.every((f) => existsSync(f));
if (!present) console.warn(`actionResolver.p5c.e2e: ${DATA} not found (the compendium data is private); skipping.`);
const describeIf = present ? describe : describe.skip;

const BOOK = `p5c-e2e-${randomUUID().slice(0, 8)}`;
const SPELL_SLUGS = ['imobilizar-pessoa', 'palavra-curativa', 'raio-de-fogo', 'rajada-mistica'];

const readRows = (file: string): any[] => (present ? JSON.parse(readFileSync(file, 'utf8')) : []);
const [classRows, subclassRows, weaponRows, allSpells] = FILES.map(readRows);
const spellRows = allSpells.filter((e) => SPELL_SLUGS.includes(e.slug));

/** Rolls these numbers in order, whatever the die; throws when asked for more, and no numbers means nothing may be rolled. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('ran out of seeded rolls');
    return values[i++];
  };
}

/** Turn order: the twelve classes as the fixtures name them, then the goblins. */
const CLASSES = ['barbaro', 'bardo', 'bruxo', 'clerigo', 'druida', 'feiticeiro', 'guerreiro', 'ladino', 'mago', 'monge', 'paladino', 'patrulheiro'];
const ORDER = [...CLASSES, 'g1', 'g2'];

/** Where each stands: the melee fighters round goblin g1 at (20,20), the rest a little off. */
const AT: Record<string, { x: number; y: number }> = {
  barbaro: { x: 19, y: 19 },
  bardo: { x: 21, y: 19 },
  guerreiro: { x: 19, y: 20 },
  ladino: { x: 21, y: 20 },
  monge: { x: 19, y: 21 },
  paladino: { x: 20, y: 21 },
  clerigo: { x: 21, y: 21 },
  bruxo: { x: 14, y: 14 },
  druida: { x: 15, y: 14 },
  feiticeiro: { x: 16, y: 14 },
  mago: { x: 17, y: 14 },
  patrulheiro: { x: 18, y: 14 },
  g1: { x: 20, y: 20 },
  g2: { x: 25, y: 25 },
};

const known = (slug: string, level: number, concentration = false) =>
  ({ level, name: slug, prepared: true, ritual: false, concentration, compendiumRef: { bookId: BOOK, slug } });


/** The weapons a fixture sheet lists are held: the bar lists what is in hand. */
function holdWeapons(s: any): any {
  for (const a of s.attacks ?? []) {
    const item = (s.inventory ?? []).find((i: any) => i.name.trim().toLowerCase() === String(a.name).trim().toLowerCase());
    if (item) { item.slot = 'main'; item.equipped = true; }
  }
  return s;
}

/** A fixture sheet with its origin in this file's book, and what each turn below starts from. */
function sheet(cls: string): any {
  const s = holdWeapons(JSON.parse(readFileSync(resolve(SHEETS, `${cls}.json`), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK))));
  if (cls === 'bruxo') {
    // The Archfey patron, for a feature button at 3rd level (Fey Presence).
    s.origin.subclass = { bookId: BOOK, slug: 'a-arquifada' };
    s.spellcasting.spells = [known('imobilizar-pessoa', 2, true)];
  }
  // The Divination school, for a feature button at 3rd level (Portent).
  if (cls === 'mago') s.origin.subclass = { bookId: BOOK, slug: 'escola-de-adivinhacao' };
  if (cls === 'druida') {
    s.spellcasting.spells = [known('palavra-curativa', 1)];
    s.hp.current = 14;
  }
  if (cls === 'guerreiro') {
    s.hp.current = 10;
    s.hitDice[0].remaining = 1;
  }
  if (cls === 'barbaro') s.hitDice[0].remaining = 0;
  return s;
}

const goblinBlock = {
  ac: 15,
  hpMax: 7,
  speed: '9 m',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  actions: [{ name: 'Cimitarra', description: 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.' }],
};
const token = (over: Record<string, unknown>): any => ({
  imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, ...over,
});

const fid = (owner: string, key: string) => `feature:${BOOK}/${owner}/${key}`;
const RAGE = fid('barbaro', 'rage');
const INSPIRATION = fid('bardo', 'bardic-inspiration');
const PRESERVE_LIFE = fid('dominio-da-vida', 'preserve-life');
const WILD_SHAPE = fid('druida', 'wild-shape');
const FONT = fid('feiticeiro', 'font-of-magic');
const SECOND_WIND = fid('guerreiro', 'second-wind');
const SURGE = fid('guerreiro', 'action-surge');
const SNEAK = fid('ladino', 'sneak-attack');
const FLURRY = fid('monge', 'flurry-of-blows');
const SMITE = fid('paladino', 'divine-smite');
const HUNTERS_PREY = fid('conclave-do-cacador', 'hunters-prey');
const FEY_PRESENCE = fid('a-arquifada', 'fey-presence');
const PORTENT = fid('escola-de-adivinhacao', 'portent');
const spell = (slug: string) => `spell:${BOOK}/${slug}`;

let server: WsTestServer;
let gmId: string;
let p1Id: string;
let campaignId: string;
let mapId: string;
let gm: Viewer;
let p1: Viewer;
let gmSocket: ClientSocket;
let p1Socket: ClientSocket;
const ids: Record<string, string> = {};

const charData = async (cls: string): Promise<any> => (await prisma.character.findUniqueOrThrow({ where: { id: ids[cls] } })).data;
async function mapToken(id: string): Promise<any> {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return (map.tokens as any[]).find((t) => t.id === id);
}
const spent = (id: string) => getState(campaignId).spend[id];
const req = (actorTokenId: string, actionId: string, over: Partial<ActionRequest> = {}): ActionRequest => ({ mapId, actorTokenId, actionId, mode: 'normal', ...over });
const used = (data: any, key: string): number => data.featureUses?.[key] ?? 0;

function ok(out: Awaited<ReturnType<typeof resolveAction>>) {
  if (!out.ok) throw new Error(`expected success, got ${out.error}`);
  return out;
}
async function options(tokenId: string) {
  const listed = await listActions(campaignId, tokenId.startsWith('g') ? gm : p1, mapId, tokenId);
  if ('error' in listed) throw new Error(listed.error);
  return listed;
}
const option = async (tokenId: string, id: string) => (await options(tokenId)).options.find((o) => o.id === id);

/** A GM event over the socket, waiting for the order it re-sends. */
async function gmEmit(event: string, payload?: unknown) {
  const sent = waitForEvent(gmSocket, 'initiative.state');
  gmSocket.emit(event, payload);
  await sent;
}

/** The player drags a token to a square; the walk is counted once the move is announced. */
async function walk(tokenId: string, x: number, y: number, feet: number) {
  const before = spent(tokenId).movedFeet;
  const moved = waitForEvent(p1Socket, 'token.moved');
  p1Socket.emit('token.move.end', { tokenId, mapId, x, y });
  await moved;
  for (let i = 0; i < 40 && spent(tokenId).movedFeet < before + feet; i++) await new Promise((r) => setTimeout(r, 50));
  expect(spent(tokenId).movedFeet).toBe(before + feet);
}

/** Within the turn's budget: the walk counted, and the GM not told. */
async function walkWithinBudget(tokenId: string, x: number, y: number, feet: number) {
  await walk(tokenId, x, y, feet);
  const { combat } = await options(tokenId);
  expect(spent(tokenId).movedFeet).toBeLessThanOrEqual(combat!.budgetFeet);
  expect(spent(tokenId).overBudgetWarned).toBe(false);
}

/** The GM passes the turn; the next combatant starts it fresh. */
async function next(expected: string) {
  await gmEmit('initiative.next');
  expect(getState(campaignId).currentTokenId).toBe(expected);
  expect(spent(expected)).toEqual(freshSpend());
}

describeIf('the P5c done-when round, against the real curated data', () => {
  beforeAll(async () => {
    const users = await Promise.all(['GM', 'P1'].map((n) => createTestUser({ displayName: `P5c e2e ${n}` })));
    [gmId, p1Id] = users.map((u) => u.id);
    gm = { role: 'GM', userId: gmId };
    p1 = { role: 'PLAYER', userId: p1Id };
    campaignId = (await createTestCampaign(gmId, { name: 'P5c e2e', gameSystem: 'FIFTH_EDITION' })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: gmId, campaignId, role: 'GM', characterIds: [] },
        { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      ],
    });
    await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5c e2e book', gameSystem: 'FIFTH_EDITION' } });
    await prisma.compendiumEntry.createMany({
      data: [...classRows, ...subclassRows, ...weaponRows, ...spellRows].map((e) => ({
        bookId: BOOK, type: e.type, slug: e.slug, name: e.name, search: String(e.name).toLowerCase(), text: '', data: e.data as object,
      })),
    });
    await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
    for (const cls of CLASSES) {
      ids[cls] = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: cls, data: sheet(cls) } })).id;
    }
    mapId = (await prisma.map.create({
      data: {
        campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: 100, gridSize: 50,
        feetPerSquare: 5, diagonalRule: 'flat', annotations: [],
        tokens: [
          ...CLASSES.map((cls) => token({ id: cls, name: cls, position: AT[cls], characterId: ids[cls], controlledBy: p1Id, type: 'player' })),
          ...['g1', 'g2'].map((id) => token({ id, name: `Goblin ${id}`, position: AT[id], type: 'npc', hp: { current: 200, max: 200, temp: 0 }, statBlock: goblinBlock })),
        ],
      },
    })).id;
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
    server = await createWsTestServer();
    const [gmCookie, p1Cookie] = await Promise.all([server.loginAs(gmId), server.loginAs(p1Id)]);
    gmSocket = await server.connectAndAuth(gmCookie, campaignId);
    p1Socket = await server.connectAndAuth(p1Cookie, campaignId);
  });

  afterAll(async () => {
    gmSocket?.disconnect();
    p1Socket?.disconnect();
    clearState(campaignId);
    await flushCombatWrites(campaignId);
    await server?.close();
    await prisma.message.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await prisma.compendiumBook.delete({ where: { id: BOOK } });
    await cleanupUsers([gmId, p1Id]);
    await prisma.$disconnect();
  });

  it('reads every class, the subclasses the sheets name, the weapons and the spells from the data', () => {
    expect(classRows.map((r) => r.slug).sort()).toEqual([...CLASSES].sort());
    const subclasses = new Set(subclassRows.map((r) => r.slug));
    for (const cls of CLASSES) expect(subclasses.has(sheet(cls).origin.subclass.slug)).toBe(true);
    expect(spellRows.map((r) => r.slug).sort()).toEqual([...SPELL_SLUGS].sort());
    expect(weaponRows.length).toBeGreaterThan(0);
  });

  it('plays a round for every class from the bar, survives a restart, then rests', async () => {
    // The GM puts everyone in the order and starts: the barbarian goes first.
    for (const id of ORDER) await gmEmit('initiative.add', { tokenId: id, mapId });
    await gmEmit('initiative.start');
    let state = getState(campaignId);
    expect(state.combatants.map((c) => c.tokenId)).toEqual(ORDER);
    expect(state).toMatchObject({ active: true, round: 1, currentTokenId: 'barbaro' });

    // --- Barbarian: Rage (bonus action, 1 of 3), then the greataxe with +2. ---
    expect(await resolveAction(campaignId, p1, req('bardo', INSPIRATION), seq())).toEqual({ ok: false, error: 'Não é a sua vez.' });
    expect(await option('barbaro', RAGE)).toMatchObject({ cost: 'bonus', uses: { left: 3, max: 3 } });
    ok(await resolveAction(campaignId, p1, req('barbaro', RAGE), seq()));
    expect(await option('barbaro', RAGE)).toMatchObject({ active: true, uses: { left: 2, max: 3 } });
    expect((await mapToken('barbaro')).conditions).toEqual(['Fúria']);
    expect(spent('barbaro').bonus).toBe(true);
    // Greataxe +5: 15 hits AC 15; 1d12+3 (6) = 9, +2 Rage.
    const axe = ok(await resolveAction(campaignId, p1, req('barbaro', 'attack:0', { targetTokenId: 'g1' }), seq(15, 6)));
    expect(axe.card.targets[0].attack?.hit).toBe(true);
    expect(axe.card.targets[0].damage?.[0].total).toBe(11);
    expect(spent('barbaro').action).toBe(true);
    await walkWithinBudget('barbaro', 17, 19, 10);
    await next('bardo');

    // --- Bard: the rapier, and Bardic Inspiration as a bonus action (Charisma +3 uses). ---
    ok(await resolveAction(campaignId, p1, req('bardo', 'attack:0', { targetTokenId: 'g1' }), seq(15, 4)));
    expect(await option('bardo', INSPIRATION)).toMatchObject({ cost: 'bonus', uses: { left: 3, max: 3 } });
    ok(await resolveAction(campaignId, p1, req('bardo', INSPIRATION), seq()));
    expect(used(await charData('bardo'), 'bardic-inspiration')).toBe(1);
    expect(spent('bardo')).toMatchObject({ action: true, bonus: true });
    expect(await resolveAction(campaignId, p1, req('bardo', INSPIRATION), seq())).toEqual({ ok: false, error: 'Você já usou a ação bônus neste turno.' });
    await walkWithinBudget('bardo', 23, 19, 10);
    await next('bruxo');

    // --- Warlock (Archfey): Fey Presence as the action, 1 of 1; no bonus action at 3rd level. ---
    // (Hold Person from a pact slot comes on the warlock's next turn, in round 2.)
    expect(await option('bruxo', FEY_PRESENCE)).toMatchObject({ cost: 'action', uses: { left: 1, max: 1 } });
    const fey = ok(await resolveAction(campaignId, p1, req('bruxo', FEY_PRESENCE), seq()));
    expect(fey.messageId).toEqual(expect.any(String));
    expect(fey.card.actor.tokenId).toBe('bruxo');
    expect(await option('bruxo', FEY_PRESENCE)).toMatchObject({ uses: { left: 0, max: 1 } });
    expect(used(await charData('bruxo'), 'fey-presence')).toBe(1);
    expect(spent('bruxo').action).toBe(true);
    await walkWithinBudget('bruxo', 14, 16, 10);
    await next('clerigo');

    // --- Cleric (Life): Channel Divinity, Preserve Life, as the action; no bonus action. ---
    expect(await option('clerigo', PRESERVE_LIFE)).toMatchObject({ cost: 'action', uses: { left: 1, max: 1 } });
    ok(await resolveAction(campaignId, p1, req('clerigo', PRESERVE_LIFE), seq()));
    expect(used(await charData('clerigo'), 'channel-divinity')).toBe(1);
    expect(spent('clerigo').action).toBe(true);
    await walkWithinBudget('clerigo', 20, 19, 10);
    await next('druida');

    // --- Druid: Healing Word on itself (bonus), then Wild Shape (action, 1 of 2). ---
    // 1d4 (2) + Wisdom 3 = 5: 14 -> 19.
    const word = ok(await resolveAction(campaignId, p1, req('druida', spell('palavra-curativa'), { targetTokenId: 'druida' }), seq(2)));
    expect(word.card.targets[0]).toMatchObject({ tokenId: 'druida', healing: 5 });
    expect((await charData('druida')).hp.current).toBe(19);
    expect((await charData('druida')).spellcasting.slots['1']).toEqual({ total: 4, expended: 1 });
    expect(await option('druida', WILD_SHAPE)).toMatchObject({ cost: 'action', uses: { left: 2, max: 2 } });
    ok(await resolveAction(campaignId, p1, req('druida', WILD_SHAPE), seq()));
    expect(used(await charData('druida'), 'wild-shape')).toBe(1);
    expect(spent('druida')).toMatchObject({ action: true, bonus: true });
    await walkWithinBudget('druida', 15, 17, 15);
    await next('feiticeiro');

    // --- Sorcerer: Fire Bolt, and Font of Magic (bonus action, 1 sorcery point of 3). ---
    // Spell attack +5: 15 hits; 1d10 (7).
    const bolt = ok(await resolveAction(campaignId, p1, req('feiticeiro', spell('raio-de-fogo'), { targetTokenId: 'g1' }), seq(15, 7)));
    expect(bolt.card.targets[0].damage?.[0]).toMatchObject({ total: 7, type: 'fogo' });
    expect(await option('feiticeiro', FONT)).toMatchObject({ cost: 'bonus', uses: { left: 3, max: 3 } });
    ok(await resolveAction(campaignId, p1, req('feiticeiro', FONT, { amount: 1 }), seq()));
    expect(used(await charData('feiticeiro'), 'sorcery-points')).toBe(1);
    expect(spent('feiticeiro')).toMatchObject({ action: true, bonus: true });
    await walkWithinBudget('feiticeiro', 16, 12, 10);
    await next('guerreiro');

    // --- Fighter: the longsword, Action Surge for a second action, Second Wind as the bonus action. ---
    const sword = req('guerreiro', 'attack:0', { targetTokenId: 'g1' });
    ok(await resolveAction(campaignId, p1, sword, seq(15, 4)));
    expect(await resolveAction(campaignId, p1, sword, seq())).toEqual({ ok: false, error: 'Você já usou a ação neste turno.' });
    ok(await resolveAction(campaignId, p1, req('guerreiro', SURGE), seq()));
    expect(spent('guerreiro').extraActions).toBe(1);
    expect(used(await charData('guerreiro'), 'action-surge')).toBe(1);
    // The second action: another swing, 1d8+3 (5) = 8.
    const second = ok(await resolveAction(campaignId, p1, sword, seq(16, 5)));
    expect(second.card.targets[0].damage?.[0].total).toBe(8);
    expect(spent('guerreiro').extraActions).toBe(0);
    // Second Wind: 1d10 (6) + fighter level 3 = 9: 10 -> 19.
    const wind = ok(await resolveAction(campaignId, p1, req('guerreiro', SECOND_WIND), seq(6)));
    expect(wind.card.targets[0]).toMatchObject({ tokenId: 'guerreiro', healing: 9, hpBefore: 10, hpAfter: 19 });
    expect((await charData('guerreiro')).hp.current).toBe(19);
    expect(spent('guerreiro').bonus).toBe(true);
    await walkWithinBudget('guerreiro', 17, 20, 10);
    await next('ladino');

    // --- Rogue: the rapier with Sneak Attack (2d6 at 3rd level), the second try refused, then Cunning Action: Dash. ---
    // +5: 15 hits; 1d8+3 (4) = 7; 2d6 (3, 2) = 5.
    const stab = ok(await resolveAction(campaignId, p1, req('ladino', 'attack:0', { targetTokenId: 'g1', riders: [{ featureId: SNEAK }] }), seq(15, 4, 3, 2)));
    expect(stab.card.targets[0].damage).toEqual([
      { total: 7, type: 'perfurante', breakdown: expect.any(String) },
      { total: 5, type: 'perfurante', label: expect.any(String), breakdown: expect.stringContaining('2d6') },
    ]);
    expect(spent('ladino').oncePerTurn).toEqual([SNEAK]);
    expect(await resolveAction(campaignId, p1, req('ladino', 'attack:1', { targetTokenId: 'g1', riders: [{ featureId: SNEAK }] }), seq())).toEqual({ ok: false, error: 'Uma vez por turno.' });
    ok(await resolveAction(campaignId, p1, req('ladino', 'common:dash:bonus'), seq()));
    expect(spent('ladino')).toMatchObject({ action: true, bonus: true, dashes: 1 });
    // Speed 35 ft doubled by the Dash: a 50-foot run is within the 70.
    expect((await options('ladino')).combat?.budgetFeet).toBe(70);
    await walkWithinBudget('ladino', 31, 20, 50);
    await next('mago');

    // --- Wizard (Divination): Portent, which costs nothing of the turn (1 of 2), then Fire Bolt; no bonus action. ---
    expect(await option('mago', PORTENT)).toMatchObject({ cost: 'none', uses: { left: 2, max: 2 } });
    const portent = ok(await resolveAction(campaignId, p1, req('mago', PORTENT), seq()));
    expect(portent.card.actor.tokenId).toBe('mago');
    expect(await option('mago', PORTENT)).toMatchObject({ uses: { left: 1, max: 2 } });
    expect(used(await charData('mago'), 'portent')).toBe(1);
    expect(spent('mago')).toMatchObject({ action: false, bonus: false });
    ok(await resolveAction(campaignId, p1, req('mago', spell('raio-de-fogo'), { targetTokenId: 'g1' }), seq(15, 3)));
    expect(spent('mago').action).toBe(true);
    await walkWithinBudget('mago', 17, 12, 10);
    await next('monge');

    // --- Monk: the shortsword, then Flurry of Blows: 1 ki of 3, two unarmed strikes. ---
    ok(await resolveAction(campaignId, p1, req('monge', 'attack:0', { targetTokenId: 'g1' }), seq(15, 3)));
    expect(await option('monge', FLURRY)).toMatchObject({ cost: 'bonus', uses: { left: 3, max: 3 } });
    // +5 each: 15 and 16 hit; 1d4+3 (2, 3) = 5 and 6.
    const flurry = ok(await resolveAction(campaignId, p1, req('monge', FLURRY, { targetTokenIds: ['g1', 'g1'] }), seq(15, 2, 16, 3)));
    expect(flurry.card.targets[0].attacks?.map((a) => a.hit)).toEqual([true, true]);
    expect(flurry.card.targets[0].damage?.map((d) => d.total)).toEqual([5, 6]);
    expect(used(await charData('monge'), 'ki')).toBe(1);
    expect(spent('monge')).toMatchObject({ action: true, bonus: true });
    await walkWithinBudget('monge', 17, 21, 10);

    // --- The server restarts in the middle of the fight. ---
    const before = structuredClone(getState(campaignId));
    await flushCombatWrites(campaignId);
    forgetCombatMemory();
    expect(getState(campaignId).active).toBe(false);
    await hydrateCombatStates();
    state = getState(campaignId);
    expect(state.round).toBe(before.round);
    expect(state.currentTokenId).toBe('monge');
    expect(state.combatants.map((c) => c.tokenId)).toEqual(ORDER);
    expect(state.spend).toEqual(before.spend);
    await next('paladino');

    // --- Paladin: the longsword with Divine Smite from a 1st-circle slot: 2d8 more, the slot spent. ---
    // +5: 15 hits; 1d8+5 (4) = 9; 2d8 (3, 5) = 8.
    const smite = ok(await resolveAction(campaignId, p1, req('paladino', 'attack:0', { targetTokenId: 'g1', riders: [{ featureId: SMITE, slotLevel: 1 }] }), seq(15, 4, 3, 5)));
    expect(smite.card.targets[0].damage?.[0].total).toBe(9);
    expect(smite.card.targets[0].damage?.[1]).toMatchObject({ total: 8, breakdown: expect.stringContaining('2d8') });
    expect((await charData('paladino')).spellcasting.slots['1']).toEqual({ total: 3, expended: 1 });
    await walkWithinBudget('paladino', 20, 23, 10);
    await next('patrulheiro');

    // --- Ranger: the longbow at the far goblin, and the Hunter's Prey button. ---
    ok(await resolveAction(campaignId, p1, req('patrulheiro', 'attack:0', { targetTokenId: 'g2' }), seq(15, 5)));
    ok(await resolveAction(campaignId, p1, req('patrulheiro', HUNTERS_PREY), seq()));
    expect(spent('patrulheiro').action).toBe(true);
    await walkWithinBudget('patrulheiro', 18, 16, 10);
    await next('g1');

    // --- The goblins: g1 cuts the cleric, g2 is held and passes. ---
    const goblinAttack = (await options('g1')).options.find((o) => o.name === 'Cimitarra')!;
    expect(goblinAttack.cost).toBe('attack');
    // +4: 18 hits; 1d6+2 (3) = 5.
    const cut = ok(await resolveAction(campaignId, gm, req('g1', goblinAttack.id, { targetTokenId: 'clerigo' }), seq(18, 3)));
    expect(cut.card.targets[0].hpAfter).toBe(25);
    await next('g2');

    // A new round: the barbarian is fresh again, and still raging.
    await next('barbaro');
    expect(getState(campaignId).round).toBe(2);
    expect((await charData('barbaro')).activeStates).toEqual([RAGE]);
    await next('bardo');
    await next('bruxo');

    // --- Warlock, round 2: Hold Person from a pact slot (2nd circle). ---
    // Wisdom save DC 13; the goblin rolls 5 - 1 and fails.
    const hold = ok(await resolveAction(campaignId, p1, req('bruxo', spell('imobilizar-pessoa'), { targetTokenId: 'g2', slotLevel: 2 }), seq(5)));
    expect(hold.card.save).toMatchObject({ ability: 'wis', dc: 13 });
    expect((await charData('bruxo')).spellcasting.slots['2']).toEqual({ total: 2, expended: 1 });
    expect(spent('bruxo').action).toBe(true);

    // --- The GM ends the fight: every spend record goes, and Rage ends. ---
    const ended = waitForEvent(gmSocket, 'initiative.state');
    gmSocket.emit('initiative.end');
    await ended;
    for (let i = 0; i < 40 && ((await charData('barbaro')).activeStates ?? []).length > 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(getState(campaignId)).toMatchObject({ active: false, spend: {} });
    expect((await charData('barbaro')).activeStates).toEqual([]);
    expect((await mapToken('barbaro')).conditions).toEqual([]);
    await flushCombatWrites(campaignId);
    expect(await prisma.combatState.findUnique({ where: { campaignId } })).toBeNull();

    // --- A short rest: Action Surge, Second Wind, ki, Wild Shape, Channel Divinity and the warlock's slots come back. ---
    const all = CLASSES.map((cls) => ids[cls]);
    ok(await takeRest(campaignId, gm, all, 'short') as any);
    let d = await charData('guerreiro');
    expect([used(d, 'action-surge'), used(d, 'second-wind')]).toEqual([0, 0]);
    expect(used(await charData('monge'), 'ki')).toBe(0);
    expect(used(await charData('druida'), 'wild-shape')).toBe(0);
    expect(used(await charData('clerigo'), 'channel-divinity')).toBe(0);
    expect((await charData('bruxo')).spellcasting.slots['2']).toEqual({ total: 2, expended: 0 });
    expect(used(await charData('bruxo'), 'fey-presence')).toBe(0);
    // Not what only a long rest gives back.
    expect(used(await charData('mago'), 'portent')).toBe(1);
    expect(used(await charData('barbaro'), 'rage')).toBe(1);
    expect(used(await charData('bardo'), 'bardic-inspiration')).toBe(1);
    expect(used(await charData('feiticeiro'), 'sorcery-points')).toBe(1);
    expect((await charData('paladino')).spellcasting.slots['1']).toEqual({ total: 3, expended: 1 });
    expect((await charData('druida')).spellcasting.slots['1']).toEqual({ total: 4, expended: 1 });
    expect((await charData('guerreiro')).hp.current).toBe(19);

    // --- A long rest: Rage, the slots, the hit points and half the hit dice (at least one). ---
    ok(await takeRest(campaignId, gm, all, 'long') as any);
    expect(used(await charData('barbaro'), 'rage')).toBe(0);
    expect(used(await charData('bardo'), 'bardic-inspiration')).toBe(0);
    expect(used(await charData('feiticeiro'), 'sorcery-points')).toBe(0);
    expect(used(await charData('mago'), 'portent')).toBe(0);
    expect((await charData('paladino')).spellcasting.slots['1']).toEqual({ total: 3, expended: 0 });
    expect((await charData('druida')).spellcasting.slots['1']).toEqual({ total: 4, expended: 0 });
    d = await charData('guerreiro');
    expect(d.hp.current).toBe(28);
    expect(d.hitDice[0].remaining).toBe(2);
    expect((await charData('clerigo')).hp.current).toBe(30);
    expect((await charData('druida')).hp.current).toBe(24);
    expect((await charData('barbaro')).hitDice[0].remaining).toBe(1);
  });
});
