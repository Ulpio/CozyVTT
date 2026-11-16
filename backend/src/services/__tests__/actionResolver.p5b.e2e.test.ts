/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * The P5b "done when" turn, played end to end against the real compendium
 * data (materiais/.compendio/data, git-ignored; the file skips when it is
 * absent): a level-5 wizard's Fireball over goblins and a player's cleric,
 * an Adult Red Dragon's breath and its recharge, Hold Person, Scorching Ray,
 * Eldritch Blast, and a sample of the 3rd-to-9th circle save spells. The
 * entries are read from the data files and seeded under a book of this file's
 * own; the rolls are fixed, the numbers checked by hand against the books
 * (Player's Handbook spell descriptions; Monster Manual, Adult Red Dragon).
 * Requires PostgreSQL at DATABASE_URL.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import {
  resolveAction,
  listActions,
  undoAction,
  rollPendingSave,
  rollRecharge,
  type ActionRequest,
} from '../actionResolver';
import type { Rng } from '../../rules/actions/types';

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const DATA = resolve(__dirname, '../../../../materiais/.compendio/data');
const SPELLS_FILE = resolve(DATA, 'phb/spell.json');
const MONSTERS_FILE = resolve(DATA, 'mm/monster.json');
const present = existsSync(SPELLS_FILE) && existsSync(MONSTERS_FILE);
if (!present) console.warn(`actionResolver.p5b.e2e: ${DATA} not found (the compendium data is private); skipping.`);
const describeIf = present ? describe : describe.skip;

const BOOK = `p5b-e2e-${randomUUID().slice(0, 8)}`;
const GRID = 50;
const MAP_ROWS = 100;

/** Rolls these numbers in order, whatever the die; throws when asked for more. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('ran out of seeded rolls');
    return values[i++];
  };
}
const times = (n: number, v: number) => Array(n).fill(v);

const SPELL_SLUGS = [
  'bola-de-fogo', 'imobilizar-pessoa', 'raio-ardente', 'rajada-mistica',
  'relampago', 'cone-de-frio', 'tempestade-de-gelo', 'corrente-de-relampagos', 'curar-ferimentos-em-massa',
];
const spellRows: any[] = present
  ? (JSON.parse(readFileSync(SPELLS_FILE, 'utf8')) as any[]).filter((e) => SPELL_SLUGS.includes(e.slug))
  : [];
const dragon: any = present
  ? (JSON.parse(readFileSync(MONSTERS_FILE, 'utf8')) as any[]).find((m) => m.name === 'Dragão Vermelho Adulto')
  : undefined;
const dragonBlock = dragon?.statBlock;
const BREATH_INDEX: number = dragonBlock ? dragonBlock.actions.findIndex((a: any) => a.name.startsWith('Sopro')) : -1;

function sheet(name: string): any {
  const raw = readFileSync(resolve(SHEETS, `${name}.json`), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK));
  return JSON.parse(raw);
}
const known = (slug: string, level: number, concentration = false) =>
  ({ level, name: slug, prepared: true, ritual: false, concentration, compendiumRef: { bookId: BOOK, slug } });

/** A fixture sheet raised to level 5 (proficiency +3) with slots of the 3rd to 6th circle and these spells. */
function levelFive(base: string, spells: any[]): any {
  const s = sheet(base);
  s.level = 5;
  s.proficiencyBonus = 3;
  for (const l of ['3', '4', '5', '6']) s.spellcasting.slots[l] = { total: 2, expended: 0 };
  s.spellcasting.spells = spells;
  s.hp = { ...s.hp, maximum: 40, current: 40 };
  return s;
}
const wizard = () =>
  levelFive('mago', [
    known('bola-de-fogo', 3), known('relampago', 3), known('tempestade-de-gelo', 4), known('cone-de-frio', 5),
    known('corrente-de-relampagos', 6), known('curar-ferimentos-em-massa', 5),
  ]);
const sorcerer = () => levelFive('feiticeiro', [known('raio-ardente', 2)]);
const warlock = () => levelFive('bruxo', []);
const cleric = () => {
  const s = sheet('clerigo');
  s.spellcasting.spells = [known('imobilizar-pessoa', 2, true)];
  return s;
};

/** The centre of a grid square in map pixels; rows count from the bottom, pixels from the top. */
const px = (col: number, row: number) => ({ x: (col + 0.5) * GRID, y: (MAP_ROWS - row - 0.5) * GRID });

const goblinBlock = {
  ac: 15,
  hpMax: 7,
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  actions: [{ name: 'Cimitarra', description: 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.' }],
};
const token = (over: Record<string, unknown>): any => ({
  imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, ...over,
});
const goblin = (id: string, col: number, row: number, over: Record<string, unknown> = {}) =>
  token({ id, name: `Goblin ${id}`, position: { x: col, y: row }, type: 'npc', hp: { current: 20, max: 20, temp: 0 }, statBlock: goblinBlock, ...over });

let gmId: string;
let p1Id: string;
let p2Id: string;
let campaignId: string;
let mapId: string;
let heroId: string;
let clericId: string;
let gm: any;
let p1: any;
let p2: any;

const hero = (col = 10, row = 10) => token({ id: 'hero', name: 'Heroína', position: { x: col, y: row }, characterId: heroId, controlledBy: p1Id, type: 'player' });
const clericToken = (col: number, row: number) => token({ id: 'cleric', name: 'Clérigo', position: { x: col, y: row }, characterId: clericId, controlledBy: p2Id, type: 'player' });

async function setTable(tokens: any[], heroSheet: any = wizard()) {
  await prisma.map.update({ where: { id: mapId }, data: { tokens } });
  await prisma.character.update({ where: { id: heroId }, data: { data: heroSheet } });
  await prisma.character.update({ where: { id: clericId }, data: { data: cleric() } });
}
async function tokenHp(id: string) {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return (map.tokens as any[]).find((t) => t.id === id).hp.current;
}
async function tokenOf(id: string) {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return (map.tokens as any[]).find((t) => t.id === id);
}
async function charData(id: string): Promise<any> {
  return (await prisma.character.findUniqueOrThrow({ where: { id } })).data;
}
const cast = (actionId: string, over: Partial<ActionRequest> = {}): ActionRequest => ({ mapId, actorTokenId: 'hero', actionId, mode: 'normal', ...over });
const spell = (slug: string) => `spell:${BOOK}/${slug}`;

function ok<T extends { ok: boolean }>(out: T): Extract<T, { ok: true }> {
  if (!out.ok) throw new Error(`expected success, got ${(out as any).error}`);
  return out as Extract<T, { ok: true }>;
}
const damageOf = (card: any) => card.damageRoll.reduce((s: number, d: any) => s + d.total, 0);

describeIf('the P5b done-when turn, against the real compendium', () => {
  beforeAll(async () => {
    const users = await Promise.all(['GM', 'P1', 'P2'].map((n) => createTestUser({ displayName: `P5b e2e ${n}` })));
    [gmId, p1Id, p2Id] = users.map((u) => u.id);
    gm = { role: 'GM', userId: gmId };
    p1 = { role: 'PLAYER', userId: p1Id };
    p2 = { role: 'PLAYER', userId: p2Id };
    campaignId = (await createTestCampaign(gmId, { name: 'P5b e2e', gameSystem: 'FIFTH_EDITION' })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: gmId, campaignId, role: 'GM', characterIds: [] },
        { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
        { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
      ],
    });
    await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5b e2e book', gameSystem: 'FIFTH_EDITION' } });
    await prisma.compendiumEntry.createMany({
      data: spellRows.map((e) => ({ bookId: BOOK, type: 'spell', slug: e.slug, name: e.name, search: String(e.name).toLowerCase(), text: '', data: e.data as object })),
    });
    await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });
    heroId = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Heroína', data: wizard() } })).id;
    clericId = (await prisma.character.create({ data: { userId: p2Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Clérigo', data: cleric() } })).id;
    mapId = (await prisma.map.create({
      data: {
        campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: MAP_ROWS, gridSize: GRID,
        feetPerSquare: 5, diagonalRule: 'flat', annotations: [], tokens: [],
      },
    })).id;
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  });

  afterEach(async () => {
    await prisma.message.deleteMany({ where: { campaignId } });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await prisma.compendiumBook.delete({ where: { id: BOOK } });
    await cleanupUsers([gmId, p1Id, p2Id]);
    await prisma.$disconnect();
  });

  it('reads every spell and the dragon from the data', () => {
    expect(spellRows.map((e) => e.slug).sort()).toEqual([...SPELL_SLUGS].sort());
    expect(BREATH_INDEX).toBeGreaterThanOrEqual(0);
  });

  // Fireball: 8d6 fire, Dexterity save for half, a 20-foot radius, +1d6 per slot above the 3rd.
  it('a level-5 wizard throws Fireball at goblins and a cleric; the cleric rolls by the prompt; the GM undoes it all', async () => {
    await setTable([
      hero(),
      goblin('g1', 30, 30),
      goblin('g2', 31, 30),
      goblin('g3', 30, 31),
      clericToken(31, 31),
    ]);
    // 8d6 of threes (24); g1 rolls 15 (+2: 17, saves), g2 5 (7) and g3 10 (12) fail.
    const out = ok(await resolveAction(campaignId, p1, cast(spell('bola-de-fogo'), { area: { anchor: px(30, 30) } }), seq(...times(8, 3), 15, 5, 10)));
    const { card } = out;
    // DC 8 + proficiency 3 + Intelligence 16 (+3) = 14.
    expect(card.save).toEqual({ ability: 'dex', dc: 14, halfOnSave: true });
    expect(card.area).toEqual({ shape: 'sphere', sizeFt: 20 });
    expect(damageOf(card)).toBe(24);
    expect(card.targets.map((t) => t.tokenId)).toEqual(['g1', 'g2', 'g3', 'cleric']);
    const by = (id: string) => card.targets.find((t) => t.tokenId === id)!;
    expect(by('g1').save).toMatchObject({ total: 17, success: true, rolledBy: 'auto' });
    expect(by('g2').save).toMatchObject({ total: 7, success: false });
    expect(by('cleric').save).toMatchObject({ status: 'pending' });
    // A success takes half (12), a failure all (24).
    expect(await tokenHp('g1')).toBe(8);
    expect(await tokenHp('g2')).toBe(0);
    expect(await tokenHp('g3')).toBe(0);
    expect((await charData(clericId)).hp.current).toBe(30);
    expect((await charData(heroId)).spellcasting.slots['3']).toEqual({ total: 2, expended: 1 });

    // The cleric's player rolls their own save: 10 + 0 fails, all 24.
    const rolled = ok(await rollPendingSave(campaignId, p2, { messageId: out.messageId, targetTokenId: 'cleric', mode: 'normal' }, seq(10)));
    expect(rolled.card.targets.find((t) => t.tokenId === 'cleric')!.save).toMatchObject({ total: 10, success: false, rolledBy: 'owner' });
    expect((await charData(clericId)).hp.current).toBe(6);

    // The GM undoes it all at once.
    ok(await undoAction(campaignId, gm, out.messageId));
    expect(await tokenHp('g1')).toBe(20);
    expect(await tokenHp('g2')).toBe(20);
    expect(await tokenHp('g3')).toBe(20);
    expect((await charData(clericId)).hp.current).toBe(30);
    expect((await charData(heroId)).spellcasting.slots['3']).toEqual({ total: 2, expended: 0 });
  });

  it('Fireball cast from a 4th-circle slot rolls 9d6', async () => {
    await setTable([hero(), goblin('g1', 30, 30)]);
    // 9d6 of twos (18), the goblin rolls 1 (+2) and fails.
    const out = ok(await resolveAction(campaignId, p1, cast(spell('bola-de-fogo'), { slotLevel: 4, area: { anchor: px(30, 30) } }), seq(...times(9, 2), 1)));
    expect(damageOf(out.card)).toBe(18);
    expect(await tokenHp('g1')).toBe(2);
    expect((await charData(heroId)).spellcasting.slots['4']).toEqual({ total: 2, expended: 1 });
  });

  // Adult Red Dragon, Fire Breath: Dexterity DC 21, 18d6 fire, half on success, 60-foot cone, recharge 5-6.
  it("the dragon breathes in a cone from the GM's bar, the button is spent, a recharge of 6 brings it back", async () => {
    await setTable([
      hero(),
      token({ id: 'dragon', name: 'Dragão Vermelho Adulto', position: { x: 50, y: 50 }, size: { width: 3, height: 3 }, type: 'npc', hp: { current: 256, max: 256, temp: 0 }, statBlock: dragonBlock }),
      goblin('g1', 55, 51),
      goblin('g2', 58, 52),
      clericToken(40, 51),
    ]);
    const id = `npc:actions:${BREATH_INDEX}`;
    const listed: any[] = (await listActions(campaignId, gm, mapId, 'dragon')) as any[];
    expect(listed.find((a) => a.id === id)!.recharge).toEqual({ min: 5, spent: false });
    // 18d6 of twos (36); g1 rolls 1 (+2) and fails, g2 20 (+2) and saves.
    const out = ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'dragon', actionId: id, mode: 'normal', area: { anchor: px(65, 51) } }, seq(...times(18, 2), 1, 20)));
    expect(out.card.save).toEqual({ ability: 'dex', dc: 21, halfOnSave: true });
    expect(out.card.area).toMatchObject({ shape: 'cone', sizeFt: 60 });
    expect(damageOf(out.card)).toBe(36);
    // The cone catches the goblins, not the cleric behind the dragon, nor the dragon.
    expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1', 'g2']);
    expect(await tokenHp('g1')).toBe(0);
    expect(await tokenHp('g2')).toBe(2);
    expect(await tokenHp('dragon')).toBe(256);
    expect((await tokenOf('dragon')).rechargeSpent).toEqual([id]);
    expect(((await listActions(campaignId, gm, mapId, 'dragon')) as any[]).find((a) => a.id === id)!.recharge).toEqual({ min: 5, spent: true });
    expect(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'dragon', actionId: id, mode: 'normal', area: { anchor: px(65, 51) } }, seq())).toEqual({ ok: false, error: 'This action is spent until it recharges' });

    const back = ok(await rollRecharge(campaignId, gm, { mapId, tokenId: 'dragon', optionId: id }, seq(6)));
    expect(back).toMatchObject({ recharged: true, d6: 6 });
    expect((await tokenOf('dragon')).rechargeSpent).toEqual([]);
  });

  // Hold Person: a Wisdom save, nothing else rolled.
  it('the cleric holds a goblin: the card says who passed and who failed, with no damage', async () => {
    await setTable([hero(40, 40), clericToken(10, 10), goblin('g1', 12, 10)]);
    const holdId = spell('imobilizar-pessoa');
    const hold = (targetTokenIds: string[], roll: number) =>
      resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: holdId, mode: 'normal', targetTokenIds }, seq(roll));
    // DC 8 + proficiency 2 + Wisdom 16 (+3) = 13; the goblin's Wisdom 8 saves at -1.
    const failed = ok(await hold(['g1'], 10));
    expect(failed.card.save).toEqual({ ability: 'wis', dc: 13, halfOnSave: false });
    expect(failed.card.damageRoll).toBeUndefined();
    expect(failed.card.targets[0].save).toMatchObject({ total: 9, success: false });
    expect(await tokenHp('g1')).toBe(20);
    // A 14 (13 total) meets the DC: a pass. Holding again replaces the concentration.
    const passed = ok(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: holdId, mode: 'normal', targetTokenIds: ['g1'], replaceConcentration: true }, seq(14)));
    expect(passed.card.targets[0].save).toMatchObject({ total: 13, success: true });
    expect(passed.card.targets[0].damage).toBeUndefined();
    expect(await tokenHp('g1')).toBe(20);
  });

  // Scorching Ray: three rays of 2d6 fire, one more per slot above the 2nd.
  it('the sorcerer fires three Scorching Rays, one target twice, 2d6 each', async () => {
    await setTable([hero(), goblin('g1', 12, 10), goblin('g2', 13, 10)], sorcerer());
    // Attack +6 (proficiency 3, Charisma 16) against AC 15. Rolls in order: g1 hits (10), 2d6 of 2+3; g1 hits (12), 2d6 of 1+1; g2 hits (10), 2d6 of 3+3.
    const out = ok(await resolveAction(campaignId, p1, cast(spell('raio-ardente'), { slotLevel: 3, targetTokenIds: ['g1', 'g1', 'g2', 'g2'] }), seq(10, 2, 3, 12, 1, 1, 10, 3, 3, 4, 10, 1, 1)));
    const by = (id: string) => out.card.targets.find((t) => t.tokenId === id)!;
    expect(by('g1')).toMatchObject({ rays: 2 });
    expect(by('g2')).toMatchObject({ rays: 2 });
    expect(out.card.targets.reduce((n, t) => n + (t.rays ?? 0), 0)).toBe(4);
    expect((await charData(heroId)).spellcasting.slots['3'].expended).toBe(1);
  });

  it('at the 2nd circle Scorching Ray fires exactly three rays', async () => {
    await setTable([hero(), goblin('g1', 12, 10), goblin('g2', 13, 10)], sorcerer());
    const ray = spell('raio-ardente');
    expect(await resolveAction(campaignId, p1, cast(ray, { slotLevel: 2, targetTokenIds: ['g1', 'g1'] }), seq())).toEqual({ ok: false, error: 'Invalid target' });
    // Rolls in order: g1 hits (10) for 2+3 = 5; g1 hits (12) for 1+1 = 2; g2 misses (1).
    const out = ok(await resolveAction(campaignId, p1, cast(ray, { slotLevel: 2, targetTokenIds: ['g1', 'g1', 'g2'] }), seq(10, 2, 3, 12, 1, 1, 1)));
    const g1 = out.card.targets.find((t) => t.tokenId === 'g1')!;
    expect(g1).toMatchObject({ rays: 2 });
    expect(g1.attacks!.map((a) => a.total)).toEqual([16, 18]);
    expect(await tokenHp('g1')).toBe(13);
    expect(await tokenHp('g2')).toBe(20);
  });

  // Eldritch Blast: 1d10 force per beam, two beams at level 5.
  it('the warlock fires two Eldritch Blast beams, each with its +3', async () => {
    await setTable([hero(), goblin('g1', 12, 10), goblin('g2', 13, 10)], warlock());
    const blast = spell('rajada-mistica');
    expect(await resolveAction(campaignId, p1, cast(blast, { targetTokenIds: ['g1'] }), seq())).toEqual({ ok: false, error: 'Invalid target' });
    // Attack +6 against AC 15: both beams hit on a 10; the d10s are 5 and 8, each plus 3.
    const out = ok(await resolveAction(campaignId, p1, cast(blast, { targetTokenIds: ['g1', 'g2'] }), seq(10, 5, 10, 8)));
    const g1 = out.card.targets.find((t) => t.tokenId === 'g1')!;
    expect(g1.damage![0].breakdown.replace(/\s+/g, '')).toContain('1d10+3');
    expect(await tokenHp('g1')).toBe(12);
    expect(await tokenHp('g2')).toBe(9);
  });

  // The sample of 3rd-to-9th circle spells from the curated catalogue resolves without refusal.
  describe('a sample of the 3rd to 9th circle', () => {
    const always = (n: number): Rng => () => n;

    it('Lightning Bolt, a line from the caster', async () => {
      await setTable([hero(), goblin('g1', 13, 10), goblin('g2', 18, 10), goblin('off', 13, 14)]);
      const out = ok(await resolveAction(campaignId, p1, cast(spell('relampago'), { area: { anchor: px(25, 10) } }), always(4)));
      expect(out.card.save).toMatchObject({ ability: 'dex', dc: 14 });
      expect(out.card.area).toMatchObject({ shape: 'line' });
      expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1', 'g2']);
      expect(damageOf(out.card)).toBe(32);
    });

    it('Cone of Cold, a cone from the caster', async () => {
      await setTable([hero(), goblin('g1', 12, 10), goblin('g2', 14, 11)]);
      const out = ok(await resolveAction(campaignId, p1, cast(spell('cone-de-frio'), { area: { anchor: px(20, 10) } }), always(4)));
      expect(out.card.save).toMatchObject({ ability: 'con', dc: 14 });
      expect(out.card.area).toMatchObject({ shape: 'cone' });
      expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1', 'g2']);
      expect(damageOf(out.card)).toBe(32);
    });

    it('Ice Storm, a cylinder', async () => {
      await setTable([hero(), goblin('g1', 30, 30), goblin('g2', 31, 31)]);
      const out = ok(await resolveAction(campaignId, p1, cast(spell('tempestade-de-gelo'), { area: { anchor: px(30, 30) } }), always(3)));
      expect(out.card.area).toMatchObject({ shape: 'cylinder' });
      expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1', 'g2']);
      // 2d8 bludgeoning and 4d6 cold, as two lines.
      expect(out.card.damageRoll!.map((d: any) => d.total)).toEqual([6, 12]);
    });

    it('Chain Lightning, four picked targets', async () => {
      await setTable([hero(), goblin('g1', 20, 10), goblin('g2', 21, 10), goblin('g3', 22, 10), goblin('g4', 23, 10)]);
      const out = ok(await resolveAction(campaignId, p1, cast(spell('corrente-de-relampagos'), { slotLevel: 6, targetTokenIds: ['g1', 'g2', 'g3', 'g4'] }), always(4)));
      expect(out.card.save).toMatchObject({ ability: 'dex', dc: 14 });
      expect(out.card.targets).toHaveLength(4);
      expect(damageOf(out.card)).toBe(40);
      expect((await charData(heroId)).spellcasting.slots['6'].expended).toBe(1);
    });

    it('Mass Cure Wounds, up to six picked creatures', async () => {
      await setTable([hero(), goblin('g1', 12, 10, { hp: { current: 5, max: 20, temp: 0 } }), clericToken(13, 10)]);
      const out = ok(await resolveAction(campaignId, p1, cast(spell('curar-ferimentos-em-massa'), { targetTokenIds: ['g1', 'cleric'] }), always(4)));
      expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1', 'cleric']);
      // 3d8 of fours (12) plus Intelligence +3.
      expect(out.card.targets[0]).toMatchObject({ healing: 15, hpBefore: 5, hpAfter: 20 });
    });
  });
});
