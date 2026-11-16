/* eslint-disable @typescript-eslint/no-explicit-any -- fixture sheets and token lists are JSON read loosely */
/**
 * The bar's resolver against a real database: who may act through which
 * token, at whom, from how far, what the roll does to hit points and spell
 * slots, the record kept to undo it, and that two actions landing together
 * on one creature both count. The book entries are invented minimal ones
 * (no book text), seeded under a book of this file's own. Requires
 * PostgreSQL at DATABASE_URL.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { resolveAction, listActions, undoAction, rollConcentration, type ActionRequest } from '../actionResolver';
import type { ActionCard, Viewer } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';

const SHEETS = resolve(__dirname, '../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const BOOK = `p5a-res-${randomUUID().slice(0, 8)}`;

/** Rolls these numbers in order, whatever the die. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('ran out of seeded rolls');
    return values[i++];
  };
}

/** The fixture sheet with every compendium pointer moved to this file's book. */
function sheet(name: string): any {
  const raw = readFileSync(resolve(SHEETS, `${name}.json`), 'utf8').replace(/"book-test"/g, JSON.stringify(BOOK));
  return JSON.parse(raw);
}

let gmId: string;
let p1Id: string;
let p2Id: string;
let specId: string;
let campaignId: string;
let mapId: string;
let fighterId: string;
let clericId: string;

let gm: Viewer;
let p1: Viewer;
let p2: Viewer;
let spec: Viewer;

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

function fighterSheet() {
  const s = sheet('guerreiro');
  s.attacks.push({ name: 'Arco curto', attackBonus: 4, damageRoll: '1d6+2', damageType: 'perfurante', compendiumRef: { bookId: BOOK, slug: 'arco-curto' } });
  return s;
}

function clericSheet() {
  const s = sheet('clerigo');
  s.spellcasting.spells = [
    { level: 1, name: 'Curar Ferimentos', prepared: true, ritual: false, concentration: false, compendiumRef: { bookId: BOOK, slug: 'curar-ferimentos' } },
    { level: 1, name: 'Bênção', prepared: true, ritual: false, concentration: true, compendiumRef: { bookId: BOOK, slug: 'bencao' } },
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
    token({ id: 'hidden', name: 'Goblin oculto', position: { x: 9, y: 11 }, type: 'npc', visible: false, hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
    token({ id: 'far', name: 'Goblin longe', position: { x: 10, y: 50 }, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
    token({ id: 'bow', name: 'Goblin a 100 pés', position: { x: 30, y: 10 }, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
    token({ id: 'masked', name: 'Goblin mascarado', position: { x: 9, y: 9 }, type: 'npc', obscured: true, hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
    token({ id: 'statue', name: 'Estátua', position: { x: 10, y: 11 }, type: 'object' }),
  ];
}

async function mapTokens(): Promise<any[]> {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return map.tokens as any[];
}
async function tokenHp(id: string) {
  return (await mapTokens()).find((t) => t.id === id).hp;
}
async function setTokenHp(id: string, hp: { current: number; max: number; temp: number }) {
  const list = await mapTokens();
  list.find((t) => t.id === id).hp = hp;
  await prisma.map.update({ where: { id: mapId }, data: { tokens: list } });
}
async function charData(id: string): Promise<any> {
  return (await prisma.character.findUniqueOrThrow({ where: { id } })).data;
}
async function patchChar(id: string, patch: (d: any) => void) {
  const d = await charData(id);
  patch(d);
  await prisma.character.update({ where: { id }, data: { data: d } });
}

const req = (over: Partial<ActionRequest>): ActionRequest => ({
  mapId, actorTokenId: 'fighter', actionId: 'attack:0', targetTokenId: 'goblin', mode: 'normal', ...over,
});

beforeAll(async () => {
  const users = await Promise.all(['GM', 'P1', 'P2', 'Spec'].map((n) => createTestUser({ displayName: `P5a ${n}` })));
  [gmId, p1Id, p2Id, specId] = users.map((u) => u.id);
  gm = { role: 'GM', userId: gmId };
  p1 = { role: 'PLAYER', userId: p1Id };
  p2 = { role: 'PLAYER', userId: p2Id };
  spec = { role: 'SPECTATOR', userId: specId };

  campaignId = (await createTestCampaign(gmId, { name: 'P5a resolver', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: specId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });

  await prisma.compendiumBook.create({ data: { id: BOOK, name: 'P5a test book', gameSystem: 'FIFTH_EDITION' } });
  const entry = (type: string, slug: string, name: string, data: unknown) =>
    ({ bookId: BOOK, type, slug, name, search: name.toLowerCase(), text: '', data: data as object });
  await prisma.compendiumEntry.createMany({
    data: [
      entry('weapon', 'espada-longa', 'Espada longa', { range: 'melee', properties: ['versátil'], damage: { dice: '1d8', type: 'cortante' } }),
      entry('weapon', 'machado-grande', 'Machado grande', { range: 'melee', properties: ['pesada', 'duas mãos'], damage: { dice: '1d12', type: 'cortante' } }),
      entry('weapon', 'arco-curto', 'Arco curto', { range: 'ranged', properties: ['munição'], normalRange: 24, longRange: 96, damage: { dice: '1d6', type: 'perfurante' } }),
      entry('spell', 'curar-ferimentos', 'Curar Ferimentos', { level: 1, range: 'Toque', concentration: false, mechanics: { healing: '1d8', healingAddsModifier: true, scaling: { perSlot: '1d8' } } }),
      { ...entry('spell', 'bencao', 'Bênção', { level: 1, range: '9 metros', concentration: true, mechanics: {} }), text: 'Texto inventado para o teste.' },
      entry('spell', 'escudo-da-fe', 'Escudo da Fé', { level: 1, range: 'Pessoal', concentration: false, mechanics: {} }),
    ],
  });
  await prisma.campaignBook.create({ data: { campaignId, bookId: BOOK } });

  fighterId = (await prisma.character.create({ data: { userId: p1Id, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Guerreira', data: fighterSheet() } })).id;
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
  await prisma.character.update({ where: { id: fighterId }, data: { data: fighterSheet() } });
  await prisma.character.update({ where: { id: clericId }, data: { data: clericSheet() } });
  await prisma.message.deleteMany({ where: { campaignId } });
});

afterAll(async () => {
  await prisma.message.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await prisma.compendiumBook.delete({ where: { id: BOOK } });
  await cleanupUsers([gmId, p1Id, p2Id, specId]);
  await prisma.$disconnect();
});

function ok(out: Awaited<ReturnType<typeof resolveAction>>) {
  if (!out.ok) throw new Error(`expected success, got ${out.error}`);
  return out;
}

describe('hitting a goblin', () => {
  it('applies 1d8+3 to the goblin on a hit and records the GM card', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    const t = out.card.targets[0];
    expect(t).toMatchObject({ tokenId: 'goblin', ac: 15, hpBefore: 7, hpAfter: 3, hpMax: 7, isCharacter: false });
    expect(t.attack).toMatchObject({ d20s: [15], natural: 15, total: 20, hit: true, critical: false });
    expect(t.damage).toEqual([expect.objectContaining({ total: 4, type: 'cortante' })]);
    expect(t.hitChance).toBeCloseTo(0.55);
    expect(out.card.actor).toMatchObject({ tokenId: 'fighter', name: 'Guerreira', userId: p1Id });
    expect(out.card.actionName).toBe('Espada longa');
    expect(await tokenHp('goblin')).toEqual({ current: 3, max: 7, temp: 0 });

    // History safety: what is stored is the GM's card, whole.
    const msg = await prisma.message.findUniqueOrThrow({ where: { id: out.messageId } });
    expect(msg.type).toBe('CHARACTER_ACTION');
    expect(msg.userId).toBe(p1Id);
    expect(msg.content).toBe('Guerreira → Goblin: Espada longa');
    expect(msg.metadata).toEqual(JSON.parse(JSON.stringify(out.card)));
    expect((msg.metadata as any).undo.hp[0]).toMatchObject({ tokenId: 'goblin', before: { current: 7, temp: 0 }, after: { current: 3, temp: 0 } });
  });

  it('leaves HP alone on a miss', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({}), seq(2)));
    expect(out.card.targets[0].attack?.hit).toBe(false);
    expect(out.card.targets[0].damage).toBeUndefined();
    expect(await tokenHp('goblin')).toEqual({ current: 7, max: 7, temp: 0 });
  });

  it('doubles the dice and not the modifier on a natural 20', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({}), seq(20, 1, 1)));
    expect(out.card.targets[0].attack).toMatchObject({ critical: true, hit: true });
    expect(out.card.targets[0].damage?.[0].total).toBe(5);
    expect(await tokenHp('goblin')).toMatchObject({ current: 2 });
  });

  it('uses the two-handed damage when asked', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({ grip: 'two' }), seq(15, 10)));
    expect(out.card.targets[0].damage?.[0].total).toBe(13);
  });

  it('two actions landing together on one goblin both count', async () => {
    await setTokenHp('goblin', { current: 20, max: 20, temp: 0 });
    const [a, b] = await Promise.all([
      resolveAction(campaignId, p1, req({}), seq(15, 1)),
      resolveAction(campaignId, gm, req({ actorTokenId: 'cleric', actionId: 'attack:0', targetTokenId: 'goblin' }), seq(15, 1)),
    ]);
    expect(a.ok && b.ok).toBe(true);
    // 1d8+3 = 4 and the cleric's mace 1d6+1 = 2.
    expect(await tokenHp('goblin')).toEqual({ current: 14, max: 20, temp: 0 });
  });

  it('uses the two-handed line for either grip when it is the only damage', async () => {
    await patchChar(fighterId, (d) => { d.attacks[0].damageRoll = 'muito'; });
    const one = ok(await resolveAction(campaignId, p1, req({ grip: 'one' }), seq(15, 1)));
    expect(one.card.targets[0].damage).toEqual([expect.objectContaining({ total: 4, type: 'cortante' })]);
    expect(await tokenHp('goblin')).toMatchObject({ current: 3 });
  });

  it('two attacks on one character from two maps both count (the sheet, not the map, is locked)', async () => {
    const other = await prisma.map.create({
      data: {
        campaignId, name: 'Outro mapa', imageUrl: '', baseLayerUrl: '', width: 20, height: 20, gridSize: 50, annotations: [],
        tokens: [
          token({ id: 'fighter2', name: 'Guerreira', position: { x: 1, y: 1 }, characterId: fighterId, controlledBy: p1Id, type: 'player' }),
          token({ id: 'goblin2', name: 'Goblin', position: { x: 2, y: 1 }, type: 'npc', hp: { current: 7, max: 7, temp: 0 }, statBlock: goblinStatBlock }),
        ],
      },
    });
    try {
      const [a, b] = await Promise.all([
        resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(15, 1)),
        resolveAction(campaignId, gm, { mapId: other.id, actorTokenId: 'goblin2', actionId: 'npc:actions:0', targetTokenId: 'fighter2', mode: 'normal' }, seq(15, 2)),
      ]);
      expect(a.ok && b.ok).toBe(true);
      expect((await charData(fighterId)).hp.current).toBe(28 - 3 - 4);
    } finally {
      await prisma.map.delete({ where: { id: other.id } });
    }
  });

  it('two goblin attacks landing together on one character both count', async () => {
    const goblinAt = (tokenId: string) => resolveAction(campaignId, gm, { mapId, actorTokenId: tokenId, actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(15, 1));
    const [a, b] = await Promise.all([goblinAt('goblin'), goblinAt('goblin')]);
    expect(a.ok && b.ok).toBe(true);
    const hp = (await charData(fighterId)).hp;
    expect(hp.current).toBe(28 - 3 - 3);
    if (a.ok) {
      expect(a.card.actor.userId).toBeUndefined();
      expect(a.card.targets[0]).toMatchObject({ isCharacter: true, ownerUserId: p1Id, ac: 17 });
    }
  });
});

describe('who may act, and at whom', () => {
  it('refuses a player acting through another player\'s token', async () => {
    expect(await resolveAction(campaignId, p2, req({}), seq(15, 1))).toEqual({ ok: false, error: 'Not your token' });
  });

  it('refuses a spectator', async () => {
    expect(await resolveAction(campaignId, spec, req({}), seq(15, 1))).toEqual({ ok: false, error: 'Not your token' });
  });

  it('refuses a player acting through a monster', async () => {
    expect(await resolveAction(campaignId, p1, req({ actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'fighter' }))).toEqual({ ok: false, error: 'Not your token' });
  });

  it('refuses a hidden target as invalid, the same as a missing one', async () => {
    expect(await resolveAction(campaignId, p1, req({ targetTokenId: 'hidden' }), seq(15, 1))).toEqual({ ok: false, error: 'Invalid target' });
    expect(await resolveAction(campaignId, p1, req({ targetTokenId: 'nope' }), seq(15, 1))).toEqual({ ok: false, error: 'Invalid target' });
    expect(await tokenHp('hidden')).toMatchObject({ current: 7 });
  });

  it('lets the GM act with a hidden goblin, named "something invisible" to players', async () => {
    const out = ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'hidden', actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(15, 1)));
    expect(out.card.actor.maskedName).toBe('something-invisible');
    const msg = await prisma.message.findUniqueOrThrow({ where: { id: out.messageId } });
    expect(msg.content).not.toMatch(/oculto/);
  });

  it('marks an obscured target as "something"', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({ targetTokenId: 'masked' }), seq(2)));
    expect(out.card.targets[0].maskedName).toBe('something');
    const msg = await prisma.message.findUniqueOrThrow({ where: { id: out.messageId } });
    expect(msg.content).not.toMatch(/mascarado/);
  });

  it('refuses an action the actor does not have', async () => {
    expect(await resolveAction(campaignId, p1, req({ actionId: 'attack:9' }))).toEqual({ ok: false, error: 'This action cannot be resolved' });
    expect(await resolveAction(campaignId, p1, req({ actionId: 'npc:actions:0' }))).toEqual({ ok: false, error: 'This action cannot be resolved' });
  });

  it('refuses an attack whose damage cannot be read', async () => {
    await patchChar(fighterId, (d) => { d.attacks[0].damageRoll = 'muito'; d.attacks[0].additionalDamage = []; });
    expect(await resolveAction(campaignId, p1, req({}), seq(15, 1))).toEqual({ ok: false, error: 'This action cannot be resolved' });
  });

  it('reports damage to a token with no hit points and changes nothing', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({ targetTokenId: 'statue' }), seq(15, 1)));
    expect(out.card.targets[0].damage?.[0].total).toBe(4);
    expect(out.card.undo.hp).toEqual([]);
    expect((await mapTokens()).find((t) => t.id === 'statue').hp).toBeUndefined();
  });
});

describe('range', () => {
  it('refuses a longsword at 200 ft', async () => {
    expect(await resolveAction(campaignId, p1, req({ targetTokenId: 'far' }), seq(15, 1))).toEqual({ ok: false, error: 'Out of range' });
  });

  it('rolls a shortbow at 100 ft with disadvantage, saying why', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({ actionId: 'attack:2', targetTokenId: 'bow' }), seq(18, 6, 1)));
    expect(out.card.mode).toBe('disadvantage');
    expect(out.card.disadvantageReason).toBe('long-range');
    expect(out.card.targets[0].attack).toMatchObject({ d20s: [18, 6], natural: 6, total: 10, hit: false });
  });

  it('cancels advantage against long-range disadvantage', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({ actionId: 'attack:2', targetTokenId: 'bow', mode: 'advantage' }), seq(18, 1)));
    expect(out.card.mode).toBe('normal');
    expect(out.card.disadvantageReason).toBe('long-range');
    expect(out.card.targets[0].attack?.d20s).toEqual([18]);
  });

  it('refuses a self spell aimed at someone else', async () => {
    const id = `spell:${BOOK}/escudo-da-fe`;
    await patchChar(clericId, (d) => d.spellcasting.spells.push({ level: 1, name: 'Escudo da Fé', prepared: true, ritual: false, concentration: false, compendiumRef: { bookId: BOOK, slug: 'escudo-da-fe' } }));
    expect(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: id, targetTokenId: 'fighter', mode: 'normal' })).toEqual({ ok: false, error: 'Invalid target' });
    const out = ok(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: id, mode: 'normal' }));
    expect(out.card.slotLevel).toBe(1);
    expect((await charData(clericId)).spellcasting.slots['1'].expended).toBe(1);
  });
});

describe('spells', () => {
  const cure = () => `spell:${BOOK}/curar-ferimentos`;
  const bless = () => `spell:${BOOK}/bencao`;

  it('heals 2d8+WIS with Curar Ferimentos at circle 2 and spends a circle-2 slot', async () => {
    await patchChar(fighterId, (d) => { d.hp.current = 5; });
    const out = ok(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: cure(), targetTokenId: 'fighter', mode: 'normal', slotLevel: 2 }, seq(3, 4)));
    expect(out.card.targets[0]).toMatchObject({ healing: 10, hpBefore: 5, hpAfter: 15, isCharacter: true });
    expect(out.card.slotLevel).toBe(2);
    const cleric = await charData(clericId);
    expect(cleric.spellcasting.slots['2'].expended).toBe(1);
    expect(cleric.spellcasting.slots['1'].expended).toBe(0);
    expect((await charData(fighterId)).hp.current).toBe(15);
  });

  it('heals no higher than the maximum', async () => {
    await patchChar(fighterId, (d) => { d.hp.current = 27; });
    ok(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: cure(), targetTokenId: 'fighter', mode: 'normal' }, seq(8)));
    expect((await charData(fighterId)).hp.current).toBe(28);
  });

  it('refuses a circle with no slot left, or below the spell', async () => {
    await patchChar(clericId, (d) => { d.spellcasting.slots['2'].expended = 2; });
    const base = { mapId, actorTokenId: 'cleric', actionId: cure(), targetTokenId: 'fighter', mode: 'normal' as const };
    expect(await resolveAction(campaignId, p2, { ...base, slotLevel: 2 }, seq(3, 4))).toEqual({ ok: false, error: 'No spell slot of that level' });
    expect(await resolveAction(campaignId, p2, { ...base, slotLevel: 3 }, seq(3, 4))).toEqual({ ok: false, error: 'No spell slot of that level' });
  });

  it('asks before dropping concentration, then takes it up', async () => {
    await patchChar(clericId, (d) => { d.concentratingOn = { name: 'Outra magia' }; });
    const base = { mapId, actorTokenId: 'cleric', actionId: bless(), mode: 'normal' as const };
    expect(await resolveAction(campaignId, p2, base)).toEqual({ ok: false, error: expect.any(String), code: 'needs-concentration-confirm' });
    expect((await charData(clericId)).spellcasting.slots['1'].expended).toBe(0);

    const out = ok(await resolveAction(campaignId, p2, { ...base, replaceConcentration: true }));
    const after = await charData(clericId);
    expect(after.concentratingOn).toEqual({ name: 'Bênção', compendiumRef: { bookId: BOOK, slug: 'bencao' } });
    expect(after.spellcasting.slots['1'].expended).toBe(1);
    expect(out.card.undo.concentration).toEqual({ characterId: clericId, before: { name: 'Outra magia' }, after: { name: 'Bênção', compendiumRef: { bookId: BOOK, slug: 'bencao' } } });
  });

  it('casts a spell with no book entry: spends the slot, takes up concentration, names no one', async () => {
    await patchChar(clericId, (d) => { d.spellcasting.spells.push({ level: 1, name: 'Magia caseira', prepared: true, ritual: false, concentration: true }); });
    const out = ok(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: 'spell:sheet:2', mode: 'normal' }));
    expect(out.card).toMatchObject({ actionName: 'Magia caseira', slotLevel: 1, targets: [] });
    const after = await charData(clericId);
    expect(after.spellcasting.slots['1'].expended).toBe(1);
    expect(after.concentratingOn).toEqual({ name: 'Magia caseira' });
  });

  it('posts the book text of a spell with nothing to roll', async () => {
    const out = ok(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: bless(), mode: 'normal' }));
    expect(out.card.extraText).toBe('Texto inventado para o teste.');
  });

  it('gives a concentrating character who takes damage a concentration DC, and the roll can break it', async () => {
    await patchChar(fighterId, (d) => { d.concentratingOn = { name: 'Algo' }; });
    const out = ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(15, 1)));
    expect(out.card.targets[0].concentrationCheckDc).toBe(10);

    expect(await rollConcentration(campaignId, p2, out.messageId, 'fighter', seq(5))).toEqual({ ok: false, error: 'Not your token' });
    const roll = await rollConcentration(campaignId, p1, out.messageId, 'fighter', seq(5));
    expect(roll).toMatchObject({ ok: true, total: 9, dc: 10, kept: false });
    expect((await charData(fighterId)).concentratingOn).toBeNull();
    const msg = await prisma.message.findUniqueOrThrow({ where: { id: out.messageId } });
    expect((msg.metadata as unknown as ActionCard).targets[0].concentrationRolledAt).toEqual(expect.any(String));
  });

  it('allows one concentration roll per card', async () => {
    await patchChar(fighterId, (d) => { d.concentratingOn = { name: 'Algo' }; });
    const out = ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(15, 1)));
    expect(await rollConcentration(campaignId, p1, out.messageId, 'fighter', seq(18))).toMatchObject({ ok: true, kept: true });
    expect(await rollConcentration(campaignId, gm, out.messageId, 'fighter', seq(1))).toEqual({ ok: false, error: 'Already rolled' });
    expect((await charData(fighterId)).concentratingOn).toEqual({ name: 'Algo' });
    expect(await prisma.message.count({ where: { campaignId } })).toBe(2);
  });

  it('refuses a concentration roll on an undone card', async () => {
    await patchChar(fighterId, (d) => { d.concentratingOn = { name: 'Algo' }; });
    const out = ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(15, 1)));
    expect(await undoAction(campaignId, gm, out.messageId)).toMatchObject({ ok: true });
    expect(await rollConcentration(campaignId, p1, out.messageId, 'fighter', seq(1))).toEqual({ ok: false, error: 'Already undone' });
    expect((await charData(fighterId)).concentratingOn).toEqual({ name: 'Algo' });
  });
});

describe('undo', () => {
  it('restores the goblin, once, and only for the GM', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    expect(await undoAction(campaignId, p1, out.messageId)).toEqual({ ok: false, error: 'GM only' });
    const undone = await undoAction(campaignId, gm, out.messageId);
    expect(undone).toMatchObject({ ok: true, partial: false });
    if (undone.ok) expect(undone.card.undoneAt).toEqual(expect.any(String));
    expect(await tokenHp('goblin')).toEqual({ current: 7, max: 7, temp: 0 });
    const msg = await prisma.message.findUniqueOrThrow({ where: { id: out.messageId } });
    expect((msg.metadata as unknown as ActionCard).undoneAt).toEqual(expect.any(String));
    expect(await undoAction(campaignId, gm, out.messageId)).toEqual({ ok: false, error: 'Already undone' });
  });

  it('leaves HP that changed since, and gives the slot back', async () => {
    await patchChar(fighterId, (d) => { d.hp.current = 5; });
    const out = ok(await resolveAction(campaignId, p2, { mapId, actorTokenId: 'cleric', actionId: `spell:${BOOK}/curar-ferimentos`, targetTokenId: 'fighter', mode: 'normal' }, seq(3)));
    await patchChar(fighterId, (d) => { d.hp.current = 20; });
    const undone = await undoAction(campaignId, gm, out.messageId);
    expect(undone).toMatchObject({ ok: true, partial: true });
    expect((await charData(fighterId)).hp.current).toBe(20);
    expect((await charData(clericId)).spellcasting.slots['1'].expended).toBe(0);
  });

  it('gives concentration back, unless a newer one has replaced it since', async () => {
    const bless = { mapId, actorTokenId: 'cleric', actionId: `spell:${BOOK}/bencao`, mode: 'normal' as const, replaceConcentration: true };
    await patchChar(clericId, (d) => { d.concentratingOn = { name: 'Outra magia' }; });
    const first = ok(await resolveAction(campaignId, p2, bless));
    expect(await undoAction(campaignId, gm, first.messageId)).toMatchObject({ ok: true, partial: false });
    expect((await charData(clericId)).concentratingOn).toEqual({ name: 'Outra magia' });

    const second = ok(await resolveAction(campaignId, p2, bless));
    await patchChar(clericId, (d) => { d.concentratingOn = { name: 'Magia mais nova' }; });
    expect(await undoAction(campaignId, gm, second.messageId)).toMatchObject({ ok: true });
    const after = await charData(clericId);
    expect(after.concentratingOn).toEqual({ name: 'Magia mais nova' });
    expect(after.spellcasting.slots['1'].expended).toBe(0);
  });

  it('is partial after a manual change to the goblin', async () => {
    const out = ok(await resolveAction(campaignId, p1, req({}), seq(15, 1)));
    await setTokenHp('goblin', { current: 1, max: 7, temp: 0 });
    expect(await undoAction(campaignId, gm, out.messageId)).toMatchObject({ ok: true, partial: true });
    expect(await tokenHp('goblin')).toEqual({ current: 1, max: 7, temp: 0 });
  });

  it('restores a character sheet', async () => {
    const out = ok(await resolveAction(campaignId, gm, { mapId, actorTokenId: 'goblin', actionId: 'npc:actions:0', targetTokenId: 'fighter', mode: 'normal' }, seq(15, 1)));
    expect((await charData(fighterId)).hp.current).toBe(25);
    expect(await undoAction(campaignId, gm, out.messageId)).toMatchObject({ ok: true, partial: false });
    expect((await charData(fighterId)).hp.current).toBe(28);
  });
});

describe('other game systems', () => {
  it('lists and resolves nothing outside a 5e campaign', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { gameSystem: 'FANTASY_D20' } });
    try {
      expect(await listActions(campaignId, p1, mapId, 'fighter')).toEqual({ error: 'This action cannot be resolved' });
      expect(await resolveAction(campaignId, p1, req({}), seq(15, 1))).toEqual({ ok: false, error: 'This action cannot be resolved' });
      expect(await tokenHp('goblin')).toEqual({ current: 7, max: 7, temp: 0 });
    } finally {
      await prisma.campaign.update({ where: { id: campaignId }, data: { gameSystem: 'FIFTH_EDITION' } });
    }
  });
});

describe('listActions', () => {
  it('lists the fighter\'s weapons for its owner', async () => {
    const out = await listActions(campaignId, p1, mapId, 'fighter');
    expect(Array.isArray(out)).toBe(true);
    if (Array.isArray(out)) expect(out.map((o) => o.id)).toEqual(['attack:0', 'attack:1', 'attack:2']);
  });

  it('refuses another player\'s token', async () => {
    expect(await listActions(campaignId, p2, mapId, 'fighter')).toEqual({ error: 'Not your token' });
  });

  it('gives the GM the goblin\'s summary and a player controlling it none', async () => {
    const forGm = await listActions(campaignId, gm, mapId, 'goblin');
    if (!Array.isArray(forGm)) throw new Error('expected a list');
    expect(forGm[0].summary).toBe('+4, 1d6 + 2 cortante');
    const list = await mapTokens();
    list.find((t) => t.id === 'goblin').controlledBy = p1Id;
    await prisma.map.update({ where: { id: mapId }, data: { tokens: list } });
    const forPlayer = await listActions(campaignId, p1, mapId, 'goblin');
    if (!Array.isArray(forPlayer)) throw new Error('expected a list');
    expect(forPlayer.some((o) => 'summary' in o)).toBe(false);
  });
});
