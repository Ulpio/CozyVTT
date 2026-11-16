/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * Saving throws, rays, several targets and areas from the bar, against the
 * database: a level-5 wizard's Fireball over goblins, a hidden goblin and a
 * player's cleric, whose save waits for its player; a red dragon's breath
 * and its recharge; Scorching Ray, Magic Missile and Eldritch Blast; Hold
 * Person; a spider's poisoned bite; and the GM's undo, of one target and of
 * all. The compendium entries are invented minimal ones (mechanics only, no
 * book text), seeded under a book of this file's own; the monsters' actions
 * are reworded in the book's shape. Requires PostgreSQL at DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import {
  resolveAction,
  listActions,
  undoAction,
  undoTarget,
  rollPendingSave,
  rollRemainingSaves,
  listPendingSaves,
  rollRecharge,
  resetRecharge,
  type ActionRequest,
} from '../actionResolver';
import { projectActionCard, type Viewer } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const BOOK = `p5b-sv-${randomUUID().slice(0, 8)}`;
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

function sheet(name: string): any {
  const raw = readFileSync(resolve(SHEETS, `${name}.json`), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK));
  return JSON.parse(raw);
}
const ref = (slug: string) => ({ bookId: BOOK, slug });
const known = (slug: string, level: number, concentration = false) =>
  ({ level, name: slug, prepared: true, ritual: false, concentration, compendiumRef: ref(slug) });

/** A fixture sheet raised to level 5 (proficiency +3), with two third-circle slots and these spells. */
function levelFive(base: string, spells: any[]): any {
  const s = sheet(base);
  s.level = 5;
  s.proficiencyBonus = 3;
  s.spellcasting.slots['3'] = { total: 2, expended: 0 };
  s.spellcasting.spells = spells;
  s.hp = { ...s.hp, maximum: 40, current: 40 };
  return s;
}
const wizard = () => levelFive('mago', [known('bola-de-fogo', 3), known('maos-flamejantes', 1), known('misseis-magicos', 1)]);
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
const dragonBlock = {
  ac: 19,
  hpMax: 256,
  abilities: { str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 21 },
  actions: [{
    name: 'Sopro de Fogo (Recarrega 5–6)',
    description: 'A criatura sopra chamas num cone de 18 metros. Cada criatura na área faz um teste de resistência de Destreza CD 21; em caso de falha sofre 63 (18d6) de dano de fogo, e em caso de sucesso sofre metade desse dano.',
  }],
};
const spiderBlock = {
  ac: 14,
  hpMax: 26,
  abilities: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 },
  actions: [{
    name: 'Picada',
    description: 'Ataque Corpo-a-Corpo com Arma: +5 para atingir, alcance 1,5 m, um alvo. Acerto: 7 (1d8 + 3) de dano perfurante, e o alvo faz um teste de resistência de Constituição CD 11, sofrendo 9 (2d8) de dano de veneno se falhar, ou metade desse dano se passar.',
  }],
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
let gm: Viewer;
let p1: Viewer;
let p2: Viewer;

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
const FIREBALL = () => `spell:${BOOK}/bola-de-fogo`;

function ok<T extends { ok: boolean }>(out: T): Extract<T, { ok: true }> {
  if (!out.ok) throw new Error(`expected success, got ${(out as any).error}`);
  return out as Extract<T, { ok: true }>;
}

beforeAll(async () => {
  const users = await Promise.all(['GM', 'P1', 'P2'].map((n) => createTestUser({ displayName: `P5b saves ${n}` })));
  [gmId, p1Id, p2Id] = users.map((u) => u.id);
  gm = { role: 'GM', userId: gmId };
  p1 = { role: 'PLAYER', userId: p1Id };
  p2 = { role: 'PLAYER', userId: p2Id };
  campaignId = (await createTestCampaign(gmId, { name: 'P5b saves', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5b saves book', gameSystem: 'FIFTH_EDITION' } });
  const entry = (slug: string, name: string, data: unknown) =>
    ({ bookId: BOOK, type: 'spell', slug, name, search: name.toLowerCase(), text: '', data: data as object });
  await prisma.compendiumEntry.createMany({
    data: [
      entry('bola-de-fogo', 'Bola de Fogo', { level: 3, range: '45 metros', concentration: false, mechanics: { save: 'dex', damage: [{ dice: '8d6', type: 'fogo' }], halfOnSave: true, area: { shape: 'esfera', size: '6 m de raio' }, scaling: { perSlot: '1d6' } } }),
      entry('maos-flamejantes', 'Mãos Flamejantes', { level: 1, range: 'Pessoal (cone de 4,5 metros)', concentration: false, mechanics: { save: 'dex', damage: [{ dice: '3d6', type: 'fogo' }], halfOnSave: true, area: { shape: 'cone', size: '4,5 m' }, scaling: { perSlot: '1d6' } } }),
      entry('raio-ardente', 'Raio Ardente', { level: 2, range: '36 metros', concentration: false, mechanics: { attack: 'ranged', damage: [{ dice: '2d6', type: 'fogo' }], rays: { count: 3, perSlot: 1 } } }),
      entry('misseis-magicos', 'Mísseis Mágicos', { level: 1, range: '36 metros', concentration: false, mechanics: { damage: [{ dice: '1d4+1', type: 'energia' }], rays: { count: 3, perSlot: 1 }, autoHit: true } }),
      entry('rajada-mistica', 'Rajada Mística', { level: 0, range: '36 metros', concentration: false, mechanics: { attack: 'ranged', damage: [{ dice: '1d10', type: 'energia' }], rays: { count: 1, cantripLevels: true } } }),
      entry('imobilizar-pessoa', 'Imobilizar Pessoa', { level: 2, range: '18 metros', concentration: true, mechanics: { save: 'wis', damage: [], targets: 1, targetsPerSlot: 1 } }),
    ],
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

// ---------------------------------------------------------------------------
// Fireball
// ---------------------------------------------------------------------------

/** The wizard at (10,10); two goblins, a hidden one and the cleric around (30,30). */
async function fireballTable() {
  await setTable([
    hero(),
    goblin('g1', 30, 30),
    goblin('g2', 31, 30),
    goblin('hidden-goblin', 30, 31, { visible: false }),
    clericToken(31, 31),
  ]);
}
/** 8d6 of threes (24); g1 rolls 15 (+2, saves: 12), g2 5 and the hidden goblin 10 (fail: 24). */
const fireballRolls = () => seq(...times(8, 3), 15, 5, 10);
const castFireball = () => resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(30, 30) } }), fireballRolls());

describe('Fireball', () => {
  it("catches the goblins, the hidden goblin and the cleric, and leaves the cleric's save pending", async () => {
    await fireballTable();
    const out = ok(await castFireball());
    const { card } = out;
    // DC 8 + proficiency 3 + Intelligence 16 (+3).
    expect(card.save).toEqual({ ability: 'dex', dc: 14, halfOnSave: true });
    expect(card.damageRoll!.reduce((s, d) => s + d.total, 0)).toBe(24);
    expect(card.area).toEqual({ shape: 'sphere', sizeFt: 20 });
    expect(card.targets.map((t) => t.tokenId)).toEqual(['g1', 'g2', 'hidden-goblin', 'cleric']);
    const by = (id: string) => card.targets.find((t) => t.tokenId === id)!;
    expect(by('g1').save).toMatchObject({ bonus: 2, status: 'rolled', d20s: [15], total: 17, success: true, rolledBy: 'auto' });
    expect(by('g2').save).toMatchObject({ total: 7, success: false });
    expect(by('hidden-goblin')).toMatchObject({ concealed: true, maskedName: 'something-invisible', controllerUserIds: [] });
    expect(by('cleric')).toMatchObject({ concealed: false, controllerUserIds: [p2Id], save: { status: 'pending', bonus: 0 } });
    expect(await tokenHp('g1')).toBe(8);
    expect(await tokenHp('g2')).toBe(0);
    expect(await tokenHp('hidden-goblin')).toBe(0);
    expect((await charData(clericId)).hp.current).toBe(30);
    expect((await charData(heroId)).spellcasting.slots['3']).toEqual({ total: 2, expended: 1 });

    // The caster's card: three targets, nothing of the hidden goblin, one save waiting.
    const mine: any = projectActionCard(card, p1);
    expect(mine.targets.map((t: any) => t.tokenId)).toEqual(['g1', 'g2', 'cleric']);
    expect(JSON.stringify(mine)).not.toContain('hidden-goblin');
    expect(mine.pendingSaves).toBe(1);
    const message = await prisma.message.findUniqueOrThrow({ where: { id: out.messageId } });
    expect(message.content).not.toMatch(/Algo|Goblin/);

    // The cleric's player rolls: 10 + 0 fails, 24 damage.
    const theirs: any = projectActionCard(card, p2);
    expect(theirs.targets.find((t: any) => t.tokenId === 'cleric').yourSave).toBe(true);
    const rolled = ok(await rollPendingSave(campaignId, p2, { messageId: out.messageId, targetTokenId: 'cleric', mode: 'normal' }, seq(10)));
    expect(rolled.card.targets.find((t) => t.tokenId === 'cleric')!.save).toMatchObject({ status: 'rolled', total: 10, success: false, rolledBy: 'owner' });
    expect((await charData(clericId)).hp.current).toBe(6);
    expect(rolled.card.targets.find((t) => t.tokenId === 'cleric')).toMatchObject({ hpBefore: 30, hpAfter: 6 });
  });

  it("a player cannot roll another player's pending save", async () => {
    await fireballTable();
    const out = ok(await castFireball());
    expect(await rollPendingSave(campaignId, p1, { messageId: out.messageId, targetTokenId: 'cleric', mode: 'normal' }, seq(10)))
      .toEqual({ ok: false, error: 'Not your token' });
    // The hidden goblin, or no target at all, reads the same to a player.
    for (const targetTokenId of ['hidden-goblin', 'nobody']) {
      expect(await rollPendingSave(campaignId, p1, { messageId: out.messageId, targetTokenId, mode: 'normal' }, seq(10)))
        .toEqual({ ok: false, error: 'Not your token' });
    }
    expect((await charData(clericId)).hp.current).toBe(30);
  });

  it('a save is rolled once', async () => {
    await fireballTable();
    const out = ok(await castFireball());
    ok(await rollPendingSave(campaignId, p2, { messageId: out.messageId, targetTokenId: 'cleric', mode: 'advantage' }, seq(1, 20)));
    // Advantage keeps the 20: 20 saves, half of 24.
    expect((await charData(clericId)).hp.current).toBe(18);
    expect(await rollPendingSave(campaignId, p2, { messageId: out.messageId, targetTokenId: 'cleric', mode: 'normal' }, seq(1)))
      .toEqual({ ok: false, error: 'Already rolled' });
    expect(await rollPendingSave(campaignId, gm, { messageId: out.messageId, targetTokenId: 'g1', mode: 'normal' }, seq(1)))
      .toEqual({ ok: false, error: 'Already rolled' });
    expect((await charData(clericId)).hp.current).toBe(18);
  });

  it('a Fireball centred on the caster catches the caster', async () => {
    await setTable([hero(), clericToken(11, 10)]);
    const out = ok(await resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(10, 10) } }), seq(...times(8, 3))));
    expect(out.card.targets.map((t) => t.tokenId)).toEqual(['hero', 'cleric']);
    expect(out.card.targets[0]).toMatchObject({ controllerUserIds: [p1Id], save: { status: 'pending' } });
  });

  it('two owners roll their saves at once and both damages land', async () => {
    await setTable([hero(), clericToken(11, 10)]);
    const out = ok(await resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(10, 10) } }), seq(...times(8, 3))));
    const [a, b] = await Promise.all([
      rollPendingSave(campaignId, p1, { messageId: out.messageId, targetTokenId: 'hero', mode: 'normal' }, seq(1)),
      rollPendingSave(campaignId, p2, { messageId: out.messageId, targetTokenId: 'cleric', mode: 'normal' }, seq(1)),
    ]);
    ok(a);
    ok(b);
    // Both fail (1 + 3 and 1 + 0 against 14): 24 each.
    expect((await charData(heroId)).hp.current).toBe(16);
    expect((await charData(clericId)).hp.current).toBe(6);
    const stored = (await prisma.message.findUniqueOrThrow({ where: { id: out.messageId } })).metadata as any;
    expect(stored.targets.map((t: any) => t.save.status)).toEqual(['rolled', 'rolled']);
    expect(stored.undo.hp.map((h: any) => h.tokenId).sort()).toEqual(['cleric', 'hero']);
  });

  it('roll the rest is GM only and finishes the card', async () => {
    await setTable([hero(), clericToken(11, 10)]);
    const out = ok(await resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(10, 10) } }), seq(...times(8, 3))));
    expect(await rollRemainingSaves(campaignId, p1, { messageId: out.messageId }, seq(20, 20))).toEqual({ ok: false, error: 'GM only' });
    const done = ok(await rollRemainingSaves(campaignId, gm, { messageId: out.messageId }, seq(20, 20)));
    expect(done.card.targets.every((t) => t.save?.status === 'rolled' && t.save.rolledBy === 'gm' && t.save.success)).toBe(true);
    expect((await charData(heroId)).hp.current).toBe(28);
    expect((await charData(clericId)).hp.current).toBe(18);
    expect((projectActionCard(done.card, p1) as any).pendingSaves).toBe(0);
    expect(await rollRemainingSaves(campaignId, gm, { messageId: out.messageId }, seq(20))).toEqual({ ok: false, error: 'Already rolled' });
  });

  it("gives a Magic Resistance advantage against a character's spell, and a player's familiar waits for its player", async () => {
    const resistant = { ...goblinBlock, traits: [{ name: 'Resistência à Magia', description: 'Vantagem.' }] };
    await setTable([hero(), goblin('mage-goblin', 30, 30, { statBlock: resistant }), goblin('pet', 31, 30, { controlledBy: p2Id })]);
    // The resistant goblin rolls two d20 and keeps the 12 (+2 saves).
    const out = ok(await resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(30, 30) } }), seq(...times(8, 3), 3, 12)));
    const by = (id: string) => out.card.targets.find((t) => t.tokenId === id)!;
    expect(by('mage-goblin').save).toMatchObject({ mode: 'advantage', advantageReason: 'magic-resistance', d20s: [3, 12], success: true });
    expect((projectActionCard(out.card, p1) as any).targets[0].save.mode).toBeUndefined();
    expect(by('pet')).toMatchObject({ isCharacter: false, controllerUserIds: [p2Id], save: { status: 'pending' } });
    expect(await tokenHp('pet')).toBe(20);
    // The familiar's player rolls it, with disadvantage: the two cancel only for a resistant one.
    ok(await rollPendingSave(campaignId, p2, { messageId: out.messageId, targetTokenId: 'pet', mode: 'disadvantage' }, seq(20, 1)));
    expect(await tokenHp('pet')).toBe(0);
  });

  it('an area request with targetTokenIds is refused', async () => {
    await fireballTable();
    expect(await resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(30, 30) }, targetTokenIds: ['g1'] }), seq()))
      .toEqual({ ok: false, error: 'Invalid target' });
    expect(await resolveAction(campaignId, p1, cast(FIREBALL(), { targetTokenIds: ['g1'] }), seq())).toEqual({ ok: false, error: 'Invalid target' });
    expect((await charData(heroId)).spellcasting.slots['3'].expended).toBe(0);
  });

  it('an anchor beyond 150 ft is out of range', async () => {
    await setTable([hero(), goblin('g1', 41, 10)]);
    expect(await resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(41, 10) } }), seq())).toEqual({ ok: false, error: 'Out of range' });
    expect((await charData(heroId)).spellcasting.slots['3'].expended).toBe(0);
    // Thirty squares away is 150 ft: in range.
    ok(await resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(40, 10) } }), seq(...times(8, 3), 10)));
  });

  it('a token on the spirit layer is not caught by a token-layer caster', async () => {
    await setTable([hero(), goblin('g1', 30, 30), goblin('ghost', 31, 30, { layer: 'spirit' })]);
    const out = ok(await resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(30, 30) } }), seq(...times(8, 3), 10)));
    expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1']);
    expect(await tokenHp('ghost')).toBe(20);
  });

  it('an object token is not caught', async () => {
    await setTable([hero(), goblin('g1', 30, 30), goblin('statue', 31, 30, { type: 'object' }), token({ id: 'crate', name: 'Caixote', position: { x: 30, y: 31 } })]);
    const out = ok(await resolveAction(campaignId, p1, cast(FIREBALL(), { area: { anchor: px(30, 30) } }), seq(...times(8, 3), 10)));
    expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1']);
  });
});

describe('Burning Hands', () => {
  it('from the caster does not catch the caster', async () => {
    await setTable([hero(), goblin('g1', 11, 10), goblin('far', 20, 10)]);
    const out = ok(await resolveAction(campaignId, p1, cast(`spell:${BOOK}/maos-flamejantes`, { area: { anchor: px(12, 10) } }), seq(3, 3, 3, 1)));
    expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1']);
    expect(await tokenHp('g1')).toBe(11);
    expect((await charData(heroId)).hp.current).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// A monster's breath and its recharge
// ---------------------------------------------------------------------------

describe("the red dragon's breath", () => {
  /** A Large dragon at (50,50), goblins east of it, the cleric well behind it. */
  async function breathTable() {
    await setTable([
      hero(),
      token({ id: 'dragon', name: 'Dragão Vermelho', position: { x: 50, y: 50 }, size: { width: 2, height: 2 }, type: 'npc', hp: { current: 256, max: 256, temp: 0 }, statBlock: dragonBlock }),
      goblin('g1', 54, 50),
      goblin('g2', 57, 51),
      clericToken(40, 50),
    ]);
  }
  const breathe = (rolls: Rng) =>
    resolveAction(campaignId, gm, { mapId, actorTokenId: 'dragon', actionId: 'npc:actions:0', mode: 'normal', area: { anchor: { x: 3500, y: 2450 } } }, rolls);

  it('in a cone: monsters roll, the option becomes spent, recharge 5 brings it back', async () => {
    await breathTable();
    // 18d6 of ones (18); g1 rolls 1 (+2: fails, 18), g2 20 (22: saves, 9).
    const out = ok(await breathe(seq(...times(18, 1), 1, 20)));
    expect(out.card.save).toEqual({ ability: 'dex', dc: 21, halfOnSave: true });
    expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1', 'g2']);
    // A monster's breath is no spell: Magic Resistance would not count.
    expect(out.card.targets.every((t) => t.save?.advantageReason === undefined && t.save?.mode === 'normal')).toBe(true);
    expect(await tokenHp('g1')).toBe(2);
    expect(await tokenHp('g2')).toBe(11);
    expect(await tokenHp('dragon')).toBe(256);
    expect(out.card.recharge).toEqual({ tokenId: 'dragon', optionId: 'npc:actions:0' });
    expect((await tokenOf('dragon')).rechargeSpent).toEqual(['npc:actions:0']);
    const listed = await listActions(campaignId, gm, mapId, 'dragon');
    expect((listed as any[])[0].recharge).toEqual({ min: 5, spent: true });
    expect(JSON.stringify(projectActionCard(out.card, p1))).not.toContain('recharge');

    expect(await breathe(seq())).toEqual({ ok: false, error: 'This action is spent until it recharges' });
    expect(await rollRecharge(campaignId, p1, { mapId, tokenId: 'dragon', optionId: 'npc:actions:0' }, seq(5))).toEqual({ ok: false, error: 'GM only' });
    const back = ok(await rollRecharge(campaignId, gm, { mapId, tokenId: 'dragon', optionId: 'npc:actions:0' }, seq(5)));
    expect(back).toMatchObject({ recharged: true, d6: 5, card: { kind: 'recharge', name: 'Dragão Vermelho', min: 5, d6: 5, recharged: true } });
    expect((await tokenOf('dragon')).rechargeSpent).toEqual([]);
    const posted = await prisma.message.findUniqueOrThrow({ where: { id: back.messageId } });
    expect(posted.content).toMatch(/recarga.*5/);
  });

  it('recharge 4 keeps it spent', async () => {
    await breathTable();
    ok(await breathe(seq(...times(18, 1), 1, 20)));
    const kept = ok(await rollRecharge(campaignId, gm, { mapId, tokenId: 'dragon', optionId: 'npc:actions:0' }, seq(4)));
    expect(kept.recharged).toBe(false);
    expect((await tokenOf('dragon')).rechargeSpent).toEqual(['npc:actions:0']);
    // The GM may bring it back by hand, and the undo of a breath gives it back too.
    ok(await resetRecharge(campaignId, gm, { mapId, tokenId: 'dragon', optionId: 'npc:actions:0' }));
    expect((await tokenOf('dragon')).rechargeSpent).toEqual([]);
    expect(await resetRecharge(campaignId, gm, { mapId, tokenId: 'dragon', optionId: 'npc:actions:0' })).toEqual({ ok: false, error: 'This action is not spent' });
    const again = ok(await breathe(seq(...times(18, 1), 1, 20)));
    ok(await undoAction(campaignId, gm, again.messageId));
    expect((await tokenOf('dragon')).rechargeSpent).toEqual([]);
    expect(await tokenHp('g1')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rays and darts
// ---------------------------------------------------------------------------

describe('rays', () => {
  const rayTable = (heroSheet: any) => setTable([hero(), goblin('g1', 12, 10), goblin('g2', 13, 10), goblin('g3', 14, 10)], heroSheet);

  it('Scorching Ray at 3rd level needs four target ids and rolls four attacks; one target twice', async () => {
    await rayTable(sorcerer());
    const ray = `spell:${BOOK}/raio-ardente`;
    expect(await resolveAction(campaignId, p1, cast(ray, { slotLevel: 3, targetTokenIds: ['g1', 'g2', 'g3'] }), seq())).toEqual({ ok: false, error: 'Invalid target' });
    // +6 (proficiency 3, Charisma 16) against AC 15: 10 hits, 1 misses.
    const out = ok(await resolveAction(campaignId, p1, cast(ray, { slotLevel: 3, targetTokenIds: ['g1', 'g1', 'g2', 'g3'] }), seq(10, 2, 2, 10, 3, 3, 1, 10, 1, 1)));
    const by = (id: string) => out.card.targets.find((t) => t.tokenId === id)!;
    expect(out.card.targets.map((t) => t.tokenId)).toEqual(['g1', 'g2', 'g3']);
    expect(by('g1')).toMatchObject({ rays: 2, hpBefore: 20, hpAfter: 10 });
    expect(by('g1').attacks!.map((a) => a.total)).toEqual([16, 16]);
    expect(by('g2')).toMatchObject({ rays: 1, hpAfter: 20 });
    expect(by('g2').attacks![0].hit).toBe(false);
    expect(by('g2').damage).toBeUndefined();
    expect(await tokenHp('g1')).toBe(10);
    expect(await tokenHp('g3')).toBe(18);
    expect((await charData(heroId)).spellcasting.slots['3'].expended).toBe(1);
  });

  it('Magic Missile darts always hit', async () => {
    await rayTable(wizard());
    // Three darts of 1d4+1, no d20 drawn.
    const out = ok(await resolveAction(campaignId, p1, cast(`spell:${BOOK}/misseis-magicos`, { targetTokenIds: ['g1', 'g2', 'g2'] }), seq(1, 2, 3)));
    expect(out.card.targets.find((t) => t.tokenId === 'g2')).toMatchObject({ rays: 2 });
    expect(out.card.targets.every((t) => t.attacks === undefined && t.attack === undefined)).toBe(true);
    expect(await tokenHp('g1')).toBe(18);
    expect(await tokenHp('g2')).toBe(13);
  });

  it("Eldritch Blast at level 5 adds the sheet's +3 to each beam", async () => {
    await rayTable(warlock());
    const blast = `spell:${BOOK}/rajada-mistica`;
    expect(await resolveAction(campaignId, p1, cast(blast, { targetTokenIds: ['g1'] }), seq())).toEqual({ ok: false, error: 'Invalid target' });
    const out = ok(await resolveAction(campaignId, p1, cast(blast, { targetTokenIds: ['g1', 'g2'] }), seq(10, 5, 10, 1)));
    const g1 = out.card.targets.find((t) => t.tokenId === 'g1')!;
    expect(g1.damage![0].breakdown.replace(/\s+/g, '')).toContain('1d10+3');
    expect(await tokenHp('g1')).toBe(12);
    expect(await tokenHp('g2')).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// A save with no damage, and a save on a hit
// ---------------------------------------------------------------------------

describe('Hold Person', () => {
  it('posts pass/fail and no damage', async () => {
    await setTable([hero(40, 40), clericToken(10, 10), goblin('g1', 12, 10)]);
    // DC 8 + proficiency 2 + Wisdom 16 (+3) = 13; the goblin's Wisdom save is -1.
    const out = ok(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: `spell:${BOOK}/imobilizar-pessoa`, mode: 'normal', targetTokenIds: ['g1'] }, seq(10)));
    expect(out.card.save).toEqual({ ability: 'wis', dc: 13, halfOnSave: false });
    expect(out.card.damageRoll).toBeUndefined();
    expect(out.card.targets[0].save).toMatchObject({ total: 9, success: false });
    expect(out.card.targets[0].damage).toBeUndefined();
    expect(await tokenHp('g1')).toBe(20);
    expect((await charData(clericId)).concentratingOn).toMatchObject({ name: 'Imobilizar Pessoa' });
    // One target at the second circle.
    expect(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: `spell:${BOOK}/imobilizar-pessoa`, mode: 'normal', targetTokenIds: ['g1', 'hero'], replaceConcentration: true }, seq()))
      .toEqual({ ok: false, error: 'Invalid target' });
  });
});

describe('a monster attack with a save on the hit', () => {
  it('a spider bite that hits leaves the poison save pending on a character', async () => {
    await setTable([hero(40, 40), token({ id: 'spider', name: 'Aranha', position: { x: 10, y: 10 }, type: 'npc', hp: { current: 26, max: 26, temp: 0 }, statBlock: spiderBlock }), clericToken(11, 10)]);
    // 15 + 5 hits AC 18; bite 1d8 + 3 = 7; poison 2d8 = 6, rolled now.
    const out = ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'spider', actionId: 'npc:actions:0', mode: 'normal', targetTokenId: 'cleric' }, seq(15, 4, 3, 3)));
    const t = out.card.targets[0];
    expect(t.attack).toMatchObject({ hit: true, total: 20 });
    expect(t.save).toMatchObject({ ability: 'con', dc: 11, status: 'pending' });
    expect(out.card.damageRoll!.reduce((s, d) => s + d.total, 0)).toBe(6);
    expect((await charData(clericId)).hp.current).toBe(23);
    // Constitution +3: 2 + 3 fails, 6 more.
    const rolled = ok(await rollPendingSave(campaignId, p2, { messageId: out.messageId, targetTokenId: 'cleric', mode: 'normal' }, seq(2)));
    expect((await charData(clericId)).hp.current).toBe(17);
    expect(rolled.card.targets[0]).toMatchObject({ hpBefore: 30, hpAfter: 17 });
    expect(rolled.card.undo.hp).toEqual([expect.objectContaining({ tokenId: 'cleric', before: { current: 30, temp: 0 }, after: { current: 17, temp: 0 } })]);
    ok(await undoAction(campaignId, gm, out.messageId));
    expect((await charData(clericId)).hp.current).toBe(30);
  });
});

describe('a single attack on a hidden token', () => {
  it("leaves players' cards and the stored chat line", async () => {
    await setTable([hero(), goblin('g1', 30, 30), goblin('hidden-goblin', 31, 30, { visible: false })]);
    const out = ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'g1', actionId: 'npc:actions:0', mode: 'normal', targetTokenId: 'hidden-goblin' }, seq(15, 3)));
    expect(out.card.targets[0]).toMatchObject({ tokenId: 'hidden-goblin', concealed: true, controllerUserIds: [], hpAfter: 15 });
    const theirs: any = projectActionCard(out.card, p1);
    expect(theirs.targets).toEqual([]);
    expect(JSON.stringify(theirs)).not.toContain('hidden-goblin');
    const message = await prisma.message.findUniqueOrThrow({ where: { id: out.messageId } });
    expect(message.content).toBe('Goblin g1: Cimitarra');
  });
});

// ---------------------------------------------------------------------------
// Undo, and the pending list
// ---------------------------------------------------------------------------

describe('undo', () => {
  it('undo one target, then undo all: no double restore, the pending prompt is gone', async () => {
    await fireballTable();
    const out = ok(await castFireball());
    expect(await undoTarget(campaignId, p1, { messageId: out.messageId, targetTokenId: 'g1' })).toEqual({ ok: false, error: 'GM only' });
    const one = ok(await undoTarget(campaignId, gm, { messageId: out.messageId, targetTokenId: 'g1' }));
    expect(one.partial).toBe(false);
    expect(await tokenHp('g1')).toBe(20);
    expect(await tokenHp('g2')).toBe(0);
    expect(await undoTarget(campaignId, gm, { messageId: out.messageId, targetTokenId: 'g1' })).toEqual({ ok: false, error: 'Already undone' });
    // Something heals g1 since: the undo of all must not touch it again.
    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
    await prisma.map.update({ where: { id: mapId }, data: { tokens: (map.tokens as any[]).map((t) => (t.id === 'g1' ? { ...t, hp: { ...t.hp, current: 15 } } : t)) } });

    const all = ok(await undoAction(campaignId, gm, out.messageId));
    expect(all.partial).toBe(false);
    expect(await tokenHp('g1')).toBe(15);
    expect(await tokenHp('g2')).toBe(20);
    expect(await tokenHp('hidden-goblin')).toBe(20);
    expect((await charData(heroId)).spellcasting.slots['3'].expended).toBe(0);
    expect(all.card.targets.every((t) => t.undoneAt)).toBe(true);
    expect(await listPendingSaves(campaignId, p2)).toEqual([]);
    expect(await rollPendingSave(campaignId, p2, { messageId: out.messageId, targetTokenId: 'cleric', mode: 'normal' }, seq(10)))
      .toEqual({ ok: false, error: 'Already undone' });
    expect((await charData(clericId)).hp.current).toBe(30);
  });

  it('a target whose hit points changed since is left, and only the GM hears it was partial when it is hidden', async () => {
    await fireballTable();
    const out = ok(await castFireball());
    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
    await prisma.map.update({ where: { id: mapId }, data: { tokens: (map.tokens as any[]).map((t) => (t.id === 'hidden-goblin' ? { ...t, hp: { ...t.hp, current: 3 } } : t)) } });
    const all = ok(await undoAction(campaignId, gm, out.messageId));
    expect(all.partial).toBe(true);
    expect(await tokenHp('hidden-goblin')).toBe(3);
    expect(await tokenHp('g2')).toBe(20);
    expect(all.card.undoPartial).toBe(true);
    expect((projectActionCard(all.card, p1) as any).undoPartial).toBeUndefined();
  });
});

describe('listPendingSaves', () => {
  it('gives the owner their pending card', async () => {
    await fireballTable();
    const out = ok(await castFireball());
    const theirs = await listPendingSaves(campaignId, p2);
    expect(theirs.map((p) => p.messageId)).toEqual([out.messageId]);
    const card: any = theirs[0].card;
    expect(card.undo).toBeUndefined();
    expect(JSON.stringify(card)).not.toContain('hidden-goblin');
    expect(card.targets.find((t: any) => t.tokenId === 'cleric').yourSave).toBe(true);
    expect(await listPendingSaves(campaignId, p1)).toEqual([]);
    const gms = await listPendingSaves(campaignId, gm);
    expect((gms[0].card as any).undo).toBeDefined();
    ok(await rollPendingSave(campaignId, p2, { messageId: out.messageId, targetTokenId: 'cleric', mode: 'normal' }, seq(10)));
    expect(await listPendingSaves(campaignId, p2)).toEqual([]);
  });
});
