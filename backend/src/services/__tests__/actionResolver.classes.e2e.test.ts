/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * One bar turn for each of the 12 classes, against a goblin (AC 15, HP 7)
 * with an ally beside it: the class's first weapon attack, its attack cantrip
 * where it has one, a healing spell where it casts one, and then the goblin's
 * Cimitarra on the fighter. The numbers are checked against the fixture
 * sheets (attack bonus, damage dice) and against the rules (spell attack
 * bonus = proficiency + casting modifier; Curar Ferimentos heals 1d8 + the
 * casting modifier and spends a first-circle slot). The compendium entries
 * are invented minimal ones (no book text), seeded under a book of this
 * file's own. Requires PostgreSQL at DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { resolveAction, listActions, type ActionRequest } from '../actionResolver';
import type { Viewer } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const BOOK = `p5a-cls-${randomUUID().slice(0, 8)}`;

const CLASSES = ['barbaro', 'bardo', 'bruxo', 'clerigo', 'druida', 'feiticeiro', 'guerreiro', 'ladino', 'mago', 'monge', 'paladino', 'patrulheiro'];
/** Classes whose sheet lists Raio de Fogo, which the compendium here gives as an attack cantrip. */
const FIRE_BOLT = ['feiticeiro', 'ladino', 'mago'];
/** Classes whose attack cantrips are only rows of the sheet's attacks (the compendium here holds no entry for them; the bruxo's Rajada Mística is the exception, tested below). */
const SHEET_CANTRIPS = ['bruxo', 'druida'];
/** Classes with a first-circle slot and Curar Ferimentos on their list. */
const HEALERS = ['bardo', 'clerigo', 'druida', 'paladino', 'patrulheiro'];

/** Rolls these numbers in order, whatever the die; throws when asked for more. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('ran out of seeded rolls');
    return values[i++];
  };
}

/** The weapons a fixture sheet lists are held: the bar lists what is in hand. */
function holdWeapons(s: any): any {
  for (const a of s.attacks ?? []) {
    const item = (s.inventory ?? []).find((i: any) => i.name.trim().toLowerCase() === String(a.name).trim().toLowerCase());
    if (item) { item.slot = 'main'; item.equipped = true; }
  }
  return s;
}

function sheet(name: string): any {
  const raw = readFileSync(resolve(SHEETS, `${name}.json`), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK));
  return holdWeapons(JSON.parse(raw));
}

/** `NdM+K` split into its parts. */
function parseRoll(expr: string) {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr.replace(/\s+/g, ''));
  if (!m) throw new Error(`not a simple roll: ${expr}`);
  return { count: parseInt(m[1], 10), flat: m[3] ? parseInt(m[3], 10) : 0, text: expr.replace(/\s+/g, '') };
}

const abilityMod = (score: number) => Math.floor((score - 10) / 2);
/** The casting modifier from the sheet's own ability scores. */
const castingMod = (s: any) => abilityMod(s.stats[s.spellcasting.ability].score);

let gmId: string;
let p1Id: string;
let p2Id: string;
let campaignId: string;
let mapId: string;
let heroId: string;
let allyId: string;
let p1: Viewer;
let gm: Viewer;

const goblinStatBlock = {
  ac: 15,
  hpMax: 7,
  speed: '9 m',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  actions: [
    { name: 'Cimitarra', description: 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.' },
    { name: 'Arco Curto', description: 'Ataque à Distância com Arma: +4 para atingir, distância 24/96 m, um alvo. Acerto: 5 (1d6 + 2) de dano perfurante.' },
  ],
};

const token = (over: Record<string, unknown>): any => ({
  imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, ...over,
});

function tokens() {
  return [
    token({ id: 'hero', name: 'Heroína', position: { x: 10, y: 10 }, characterId: heroId, controlledBy: p1Id, type: 'player' }),
    token({ id: 'ally', name: 'Aliado', position: { x: 10, y: 11 }, characterId: allyId, controlledBy: p2Id, type: 'player' }),
    token({ id: 'goblin', name: 'Goblin', position: { x: 11, y: 10 }, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
  ];
}

async function goblinHp() {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return (map.tokens as any[]).find((t) => t.id === 'goblin').hp;
}
async function charData(id: string): Promise<any> {
  return (await prisma.character.findUniqueOrThrow({ where: { id } })).data;
}
const allySheet = () => {
  const s = sheet('guerreiro');
  s.hp = { ...s.hp, current: 10 };
  return s;
};

/** The hero becomes this class's fixture sheet, with the healing spell added where the class casts it. */
async function playAs(cls: string): Promise<any> {
  const s = sheet(cls);
  if (HEALERS.includes(cls)) {
    s.spellcasting.spells = [
      { level: 1, name: 'Curar Ferimentos', prepared: true, ritual: false, concentration: false, compendiumRef: { bookId: BOOK, slug: 'curar-ferimentos' } },
      ...(s.spellcasting.spells ?? []),
    ];
  }
  await prisma.character.update({ where: { id: heroId }, data: { data: s } });
  await prisma.map.update({ where: { id: mapId }, data: { tokens: tokens() } });
  await prisma.character.update({ where: { id: allyId }, data: { data: allySheet() } });
  return s;
}

const hero = (actionId: string, over: Partial<ActionRequest> = {}): ActionRequest => ({
  mapId, actorTokenId: 'hero', actionId, targetTokenId: 'goblin', mode: 'normal', ...over,
});

function ok(out: Awaited<ReturnType<typeof resolveAction>>) {
  if (!out.ok) throw new Error(`expected success, got ${out.error}`);
  return out;
}

beforeAll(async () => {
  const users = await Promise.all(['GM', 'P1', 'P2'].map((n) => createTestUser({ displayName: `P5a classes ${n}` })));
  [gmId, p1Id, p2Id] = users.map((u) => u.id);
  p1 = { role: 'PLAYER', userId: p1Id };
  gm = { role: 'GM', userId: gmId };

  campaignId = (await createTestCampaign(gmId, { name: 'P5a classes', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });

  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5a classes book', gameSystem: 'FIFTH_EDITION' } });
  const entry = (slug: string, name: string, data: unknown) =>
    ({ bookId: BOOK, type: 'spell', slug, name, search: name.toLowerCase(), text: '', data: data as object });
  await prisma.compendiumEntry.createMany({
    data: [
      entry('raio-de-fogo', 'Raio de Fogo', { level: 0, range: '36 metros', concentration: false, mechanics: { attack: 'ranged', damage: [{ dice: '1d10', type: 'fogo' }], scaling: { cantrip: true } } }),
      entry('rajada-mistica', 'Rajada Mística', { level: 0, range: '36 metros', concentration: false, mechanics: { attack: 'ranged', damage: [{ dice: '1d10', type: 'energia' }], scaling: { cantrip: true } } }),
      entry('curar-ferimentos', 'Curar Ferimentos', { level: 1, range: 'Toque', concentration: false, mechanics: { healing: '1d8', healingAddsModifier: true, scaling: { perSlot: '1d8' } } }),
    ],
  });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });

  heroId = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Heroína', data: sheet('guerreiro') } })).id;
  allyId = (await prisma.character.create({ data: { userId: p2Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Aliado', data: allySheet() } })).id;
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Arena', imageUrl: '', baseLayerUrl: '', width: 100, height: 100, gridSize: 50,
      feetPerSquare: 5, diagonalRule: 'flat', annotations: [], tokens: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
});

afterAll(async () => {
  await prisma.message.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await prisma.compendiumBook.delete({ where: { id: BOOK } });
  await cleanupUsers([gmId, p1Id, p2Id]);
  await prisma.$disconnect();
});

/** Resolves a sheet's attack row `i` against the goblin and checks it against the sheet's own numbers. */
async function swingSheetAttack(cls: string, i: number) {
  const s = await playAs(cls);
  const row = s.attacks[i];
  const dmg = parseRoll(row.damageRoll);
  const die = 2;
  const out = ok(await resolveAction(campaignId, p1, hero(`attack:${i}`), seq(15, ...Array(dmg.count).fill(die))));
  const t = out.card.targets[0];
  expect(out.card.actionName).toBe(row.name);
  expect(t.ac).toBe(15);
  // Natural 15 + the sheet's bonus.
  expect(t.attack).toMatchObject({ d20s: [15], natural: 15, hit: row.attackBonus + 15 >= 15, critical: false });
  expect(t.attack!.total - t.attack!.natural).toBe(row.attackBonus);
  expect(t.attack!.hit).toBe(true);
  const expected = Math.max(0, dmg.count * die + dmg.flat);
  expect(t.damage).toEqual([expect.objectContaining({ total: expected, type: row.damageType })]);
  expect(t.damage![0].breakdown.replace(/\s+/g, '')).toContain(dmg.text);
  expect(t).toMatchObject({ hpBefore: 7, hpAfter: Math.max(0, 7 - expected), hpMax: 7 });
  expect(await goblinHp()).toEqual({ current: Math.max(0, 7 - expected), max: 7, temp: 0 });
  return { out, sheet: s };
}

describe('weapon attack, first row of the sheet', () => {
  test.each(CLASSES)('%s hits the goblin with its sheet bonus and damage', async (cls) => {
    await swingSheetAttack(cls, 0);
  });
});

describe('attack cantrip', () => {
  test.each(FIRE_BOLT)('%s casts Raio de Fogo: proficiency + casting modifier, 1d10 fire, no slot spent', async (cls) => {
    const s = await playAs(cls);
    const bonus = s.proficiencyBonus + castingMod(s);
    expect(bonus).toBe(s.spellcasting.spellAttackBonus);
    const out = ok(await resolveAction(campaignId, p1, hero(`spell:${BOOK}/raio-de-fogo`), seq(15, 6)));
    const t = out.card.targets[0];
    expect(out.card.actionName).toBe('Raio de Fogo');
    expect(out.card.slotLevel).toBeUndefined();
    expect(t.attack!.total - t.attack!.natural).toBe(bonus);
    expect(t.attack).toMatchObject({ natural: 15, hit: true, critical: false });
    expect(t.damage).toEqual([expect.objectContaining({ total: 6, type: 'fogo' })]);
    expect(t.damage![0].breakdown.replace(/\s+/g, '')).toContain('1d10');
    expect(t).toMatchObject({ hpBefore: 7, hpAfter: 1 });
    expect(await goblinHp()).toEqual({ current: 1, max: 7, temp: 0 });
    // A cantrip costs no slot.
    const slots = (await charData(heroId)).spellcasting.slots;
    for (const level of Object.keys(slots)) expect(slots[level].expended).toBe(0);
  });

  test.each(FIRE_BOLT)('%s gets the cantrip once on the bar, not also as a weapon row', async (cls) => {
    await playAs(cls);
    const listed = await listActions(campaignId, p1, mapId, 'hero');
    if ('error' in listed) throw new Error('expected a list');
    expect(listed.options.filter((o) => o.name === 'Raio de Fogo')).toHaveLength(1);
  });

  test.each(SHEET_CANTRIPS)('%s rolls the attack cantrip row of its sheet', async (cls) => {
    const s = await playAs(cls);
    const i = s.attacks.findIndex((a: any) => a.name.startsWith('S ') && a.name !== 'S rajada-mistica' && a.attackBonus === s.spellcasting.spellAttackBonus);
    expect(i).toBeGreaterThan(0);
    expect(s.attacks[i].attackBonus).toBe(s.proficiencyBonus + castingMod(s));
    await swingSheetAttack(cls, i);
  });
});

describe('healing spell', () => {
  test.each(HEALERS)('%s heals an ally for 1d8 + casting modifier with a first-circle slot', async (cls) => {
    const s = await playAs(cls);
    const mod = castingMod(s);
    const out = ok(await resolveAction(campaignId, p1, hero(`spell:${BOOK}/curar-ferimentos`, { targetTokenId: 'ally' }), seq(5)));
    const t = out.card.targets[0];
    expect(out.card.slotLevel).toBe(1);
    expect(t).toMatchObject({ tokenId: 'ally', healing: 5 + mod, hpBefore: 10, hpAfter: 10 + 5 + mod, isCharacter: true });
    expect((await charData(allyId)).hp.current).toBe(10 + 5 + mod);
    const slots = (await charData(heroId)).spellcasting.slots;
    expect(slots['1'].expended).toBe(1);
    expect(slots['1'].total).toBe(s.spellcasting.slots['1'].total);
    expect(slots['2'].expended).toBe(0);
  });
});

describe("the goblin's turn", () => {
  it('Cimitarra +4, 1d6+2 against the fighter lowers the sheet HP by the roll', async () => {
    const s = await playAs('guerreiro');
    const out = ok(await resolveAction(campaignId, gm, {
      mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'hero', mode: 'normal',
    }, seq(15, 3)));
    const t = out.card.targets[0];
    expect(out.card.actionName).toBe('Cimitarra');
    expect(t.ac).toBe(s.armorClass);
    expect(t.attack).toMatchObject({ natural: 15, total: 19, hit: true, critical: false });
    expect(t.damage).toEqual([expect.objectContaining({ total: 5, type: 'cortante' })]);
    expect(t.damage![0].breakdown.replace(/\s+/g, '')).toContain('1d6+2');
    expect(t).toMatchObject({ isCharacter: true, hpBefore: s.hp.current, hpAfter: s.hp.current - 5, hpMax: s.hp.maximum });
    expect((await charData(heroId)).hp.current).toBe(s.hp.current - 5);
  });

  it('misses the fighter on a roll that falls short of its armour class', async () => {
    const s = await playAs('guerreiro');
    // 12 + 4 = 16 < 17.
    const out = ok(await resolveAction(campaignId, gm, {
      mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'hero', mode: 'normal',
    }, seq(12)));
    expect(out.card.targets[0].attack).toMatchObject({ total: 16, hit: false });
    expect((await charData(heroId)).hp.current).toBe(s.hp.current);
  });
});

describe('attack cantrip that the sheet also lists as an attack row', () => {
  it("bruxo's Rajada Mística keeps the book's 1d10 and adds the row's +3", async () => {
    const s = await playAs('bruxo');
    const row = s.attacks.find((a: any) => a.name === 'S rajada-mistica');
    expect(row.damageRoll).toBe('1d10+3');
    const out = ok(await resolveAction(campaignId, p1, hero(`spell:${BOOK}/rajada-mistica`), seq(15, 4)));
    const t = out.card.targets[0];
    expect(out.card.actionName).toBe('Rajada Mística');
    expect(t.attack!.total - t.attack!.natural).toBe(row.attackBonus);
    expect(t.damage).toEqual([expect.objectContaining({ total: 7, type: 'energia' })]);
    expect(t.damage![0].breakdown.replace(/\s+/g, '')).toContain('1d10+3');
    expect(await goblinHp()).toEqual({ current: 0, max: 7, temp: 0 });
  });
});
