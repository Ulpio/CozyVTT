/* eslint-disable @typescript-eslint/no-explicit-any -- stored tokens and sheets are JSON read loosely */
/**
 * A torch, lamp, lantern or candle in a character's hands lights their tokens
 * (`light` with `source: 'item'`), worked out again on every hand change and
 * when a token is placed; a light set by hand is never touched. The compendium
 * entries are invented minimal ones under a book of this file's own. Requires
 * PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { equipItem } from '../inventory';
import { itemLightFor, syncItemLight } from '../itemLight';
import type { Viewer } from '../../rules/actions/actionCard';

jest.setTimeout(30000);

const app = createTestApp();
const BOOK = `p7-il-${randomUUID().slice(0, 8)}`;
const ref = (slug: string) => ({ bookId: BOOK, slug });

const GEAR = ['tocha', 'lampada', 'lanterna-coberta', 'lanterna-furta-fogo', 'vela', 'corda'];

let gmId: string;
let anaId: string;
let campaignId: string;
let gmAgent: ReturnType<typeof request.agent>;
let ana: Viewer;
const mapIds: string[] = [];
const charIds: string[] = [];

const item = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({ id, name: slug, quantity: 1, compendiumRef: ref(slug), ...extra });
const sheet = (inventory: unknown[]) => ({
  characterName: 'Hero', class: 'Guerreiro', level: 1, race: 'Raça', proficiencyBonus: 2, armorClass: 10, inventory,
  stats: Object.fromEntries(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map((a) => [a, { score: 10, modifier: 0 }])),
});
const newCharacter = async (inventory: unknown[]) => {
  const c = await prisma.character.create({ data: { userId: anaId, campaignId, gameSystem: 'FIFTH_EDITION', name: 'Hero', data: sheet(inventory) as object } });
  charIds.push(c.id);
  return c.id;
};
const newMap = async (tokens: unknown[] = []) => {
  const m = await prisma.map.create({
    data: { campaignId, name: 'M', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x', width: 20, height: 20, gridSize: 50, annotations: [], tokens: tokens as object[] },
  });
  mapIds.push(m.id);
  return m.id;
};
const place = async (mapId: string, characterId: string) => {
  const res = await gmAgent.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({
    characterId, name: 'Hero', imageUrl: '', position: { x: 2, y: 2 }, size: { width: 1, height: 1 }, layer: 'token', type: 'player',
  });
  expect(res.status).toBe(201);
  return res.body.token as any;
};
const stored = async (mapId: string, characterId: string) => {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return (map.tokens as any[]).find((t) => t.characterId === characterId);
};
const equip = async (characterId: string, itemId: string, slot: 'main' | 'off' | 'both' | null) => {
  const out = await equipItem(campaignId, ana, characterId, itemId, slot);
  expect(out.ok).toBe(true);
};
/** Tokens are written to the map's row; count the writes by its row version. */
const touched = async (mapId: string) => (await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).updatedAt.getTime();

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const gm = await createTestUser({ email: `il-gm-${stamp}@test.cozyvtt.local`, displayName: 'IL gm' });
  const a = await createTestUser({ email: `il-ana-${stamp}@test.cozyvtt.local`, displayName: 'IL ana' });
  [gmId, anaId] = [gm.id, a.id];
  ana = { role: 'PLAYER', userId: anaId };
  campaignId = (await createTestCampaign(gmId, { name: `IL ${stamp}`, gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: anaId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: `P7 il ${BOOK}`, gameSystem: 'FIFTH_EDITION' } });
  await prisma.compendiumEntry.createMany({
    data: GEAR.map((slug) => ({ bookId: BOOK, type: 'gear', slug, name: slug, search: slug, text: 'Texto inventado.', data: { cost: '1 po', weight: 1 } })),
  });
  gmAgent = request.agent(app);
  expect((await gmAgent.post('/api/auth/login').send({ email: gm.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { id: { in: mapIds } } });
  await prisma.character.deleteMany({ where: { id: { in: charIds } } });
  await cleanupCampaigns([campaignId]);
  await prisma.compendiumBook.deleteMany({ where: { id: BOOK } });
  await cleanupUsers([gmId, anaId]);
  await prisma.$disconnect();
});

describe('itemLightFor', () => {
  it('reads the table by slug and by hand-typed name, and ignores what is not in a hand', () => {
    expect(itemLightFor([item('a', 'tocha', { slot: 'main' })])).toEqual({ brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'item', itemId: 'a' });
    expect(itemLightFor([item('a', 'lampada', { slot: 'off' })])).toMatchObject({ brightRadius: 3, dimRadius: 6 });
    expect(itemLightFor([item('a', 'vela', { slot: 'both' })])).toMatchObject({ brightRadius: 1, dimRadius: 2 });
    expect(itemLightFor([item('a', 'tocha')])).toBeNull();
    expect(itemLightFor([item('a', 'tocha', { slot: 'armor' })])).toBeNull();
    expect(itemLightFor([{ id: 'n', name: 'Tocha velha', quantity: 1, slot: 'main' } as any])).toMatchObject({ brightRadius: 4, dimRadius: 8 });
    expect(itemLightFor([{ id: 'n', name: 'LAMPIÃO de latão', quantity: 1, slot: 'main' } as any])).toMatchObject({ brightRadius: 3, dimRadius: 6 });
    expect(itemLightFor([{ id: 'n', name: 'Lantern', quantity: 1, slot: 'off' } as any])).toMatchObject({ brightRadius: 6, dimRadius: 12 });
    expect(itemLightFor([item('a', 'lanterna-furta-fogo', { slot: 'main' })])).toBeNull();
  });

  it('takes the biggest light of the hands', () => {
    const light = itemLightFor([item('t', 'tocha', { slot: 'main' }), item('l', 'lanterna-coberta', { slot: 'off' })]);
    expect(light).toMatchObject({ brightRadius: 6, dimRadius: 12, itemId: 'l' });
  });
});

describe('a torch in hand lights the token', () => {
  it('lights on main, keeps the light moving to the off hand with no write, and puts it out on stow', async () => {
    const id = await newCharacter([item('torch', 'tocha'), item('rope', 'corda')]);
    const map = await newMap();
    await place(map, id);
    expect((await stored(map, id)).light ?? null).toBeNull();

    await equip(id, 'torch', 'main');
    expect((await stored(map, id)).light).toEqual({ brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'item', itemId: 'torch' });

    const version = await touched(map);
    await equip(id, 'torch', 'off');
    expect((await stored(map, id)).light).toMatchObject({ source: 'item', brightRadius: 4 });
    expect(await touched(map)).toBe(version);
    expect(await syncItemLight(id)).toBe(0);

    await equip(id, 'torch', null);
    expect((await stored(map, id)).light).toBeNull();
  });

  it('lights every token of the character on every map', async () => {
    const id = await newCharacter([item('torch', 'tocha')]);
    const [m1, m2] = [await newMap(), await newMap()];
    await place(m1, id);
    await place(m2, id);
    await equip(id, 'torch', 'main');
    expect((await stored(m1, id)).light).toMatchObject({ source: 'item', dimRadius: 8 });
    expect((await stored(m2, id)).light).toMatchObject({ source: 'item', dimRadius: 8 });
  });

  it('lights with the hooded lantern over the torch, and back to the torch when it is stowed', async () => {
    const id = await newCharacter([item('torch', 'tocha'), item('lantern', 'lanterna-coberta')]);
    const map = await newMap();
    await place(map, id);
    await equip(id, 'torch', 'main');
    await equip(id, 'lantern', 'off');
    expect((await stored(map, id)).light).toMatchObject({ brightRadius: 6, dimRadius: 12, itemId: 'lantern' });
    await equip(id, 'lantern', null);
    expect((await stored(map, id)).light).toMatchObject({ brightRadius: 4, dimRadius: 8, itemId: 'torch' });
  });

  it('lights for a hand-typed "Tocha velha" and not for the bullseye lantern', async () => {
    const id = await newCharacter([{ id: 'old', name: 'Tocha velha', quantity: 1, equippable: true }, item('bull', 'lanterna-furta-fogo')]);
    const map = await newMap();
    await place(map, id);
    await equip(id, 'old', 'main');
    expect((await stored(map, id)).light).toMatchObject({ brightRadius: 4, dimRadius: 8, source: 'item' });
    const out = await equipItem(campaignId, ana, id, 'bull', 'off');
    expect(out.ok).toBe(false);
    expect((await stored(map, id)).light).toMatchObject({ brightRadius: 4, dimRadius: 8 });
  });

  it('never touches a light set by hand (Review Focus 3)', async () => {
    const id = await newCharacter([item('torch', 'tocha')]);
    const manual = { brightRadius: 2, dimRadius: 5, color: '#88aaff', source: 'manual' };
    const map = await newMap([{ id: 'tk', characterId: id, name: 'Hero', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, light: manual }]);
    await equip(id, 'torch', 'main');
    expect((await stored(map, id)).light).toEqual(manual);
    await equip(id, 'torch', 'off');
    await equip(id, 'torch', null);
    expect((await stored(map, id)).light).toEqual(manual);
  });

  it('lights a token placed while the torch is already in hand', async () => {
    const id = await newCharacter([item('torch', 'tocha', { slot: 'main' })]);
    const map = await newMap();
    const placed = await place(map, id);
    expect(placed.light).toEqual({ brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'item', itemId: 'torch' });
    expect((await stored(map, id)).light).toMatchObject({ source: 'item' });
  });

  it('leaves a token with nothing in hand unlit when placed', async () => {
    const id = await newCharacter([item('torch', 'tocha')]);
    const map = await newMap();
    expect((await place(map, id)).light ?? null).toBeNull();
  });
});
