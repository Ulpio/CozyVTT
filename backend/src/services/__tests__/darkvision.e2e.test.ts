/* eslint-disable @typescript-eslint/no-explicit-any -- stored tokens and sheets are JSON read loosely */
/**
 * Darkvision from the 5e sheet's race onto the character's tokens: when the
 * token is placed, when the sheet's race changes, and never over a range the
 * GM set by hand. The compendium entries are invented minimal ones under a
 * book of this file's own. Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers } from '../../__tests__/helpers/db';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { TEST_PASSWORD } from '../../__tests__/helpers/db';
import { darkvisionSquares, syncDarkvision } from '../darkvision';

jest.setTimeout(30000);

const app = createTestApp();
const BOOK = `p7-dv-${randomUUID().slice(0, 8)}`;
const ref = (slug: string) => ({ bookId: BOOK, slug });

const ENTRIES = [
  { type: 'race', slug: 'anao', name: 'Anão', data: { size: 'Médio', speed: 7.5, darkvision: 18 } },
  { type: 'race', slug: 'elfo', name: 'Elfo', data: { size: 'Médio', speed: 9, darkvision: 18 } },
  { type: 'subrace', slug: 'drow', name: 'Drow', data: { parent: 'elfo', darkvision: 36 } },
  { type: 'subrace', slug: 'alto-elfo', name: 'Alto Elfo', data: { parent: 'elfo' } },
  { type: 'race', slug: 'humano', name: 'Humano', data: { size: 'Médio', speed: 9 } },
];

let gmId: string;
let anaId: string;
let campaignId: string;
let gmAgent: ReturnType<typeof request.agent>;
let anaAgent: ReturnType<typeof request.agent>;
const mapIds: string[] = [];
const charIds: string[] = [];

const sheet = (origin?: Record<string, unknown>) => ({
  characterName: 'Hero', class: 'Guerreiro', level: 1, race: 'Raça', proficiencyBonus: 2,
  stats: Object.fromEntries(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map((a) => [a, { score: 10, modifier: 0 }])),
  ...(origin ? { origin } : {}),
});
const newCharacter = async (data: unknown, name = 'Hero') => {
  const c = await prisma.character.create({ data: { userId: anaId, campaignId, gameSystem: 'FIFTH_EDITION', name, data: data as object } });
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
const place = async (mapId: string, characterId: string, extra: Record<string, unknown> = {}) => {
  const res = await gmAgent.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({
    characterId, name: 'Hero', imageUrl: '', position: { x: 2, y: 2 }, size: { width: 1, height: 1 }, layer: 'token', type: 'player', ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.token as any;
};
const stored = async (mapId: string, characterId: string) => {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return (map.tokens as any[]).find((t) => t.characterId === characterId);
};
const setRace = (agent: typeof gmAgent, id: string, origin: Record<string, unknown>) =>
  agent.put(`/api/characters/${id}`).send({ data: sheet(origin) });

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const gm = await createTestUser({ email: `dv-gm-${stamp}@test.cozyvtt.local`, displayName: 'DV gm' });
  const ana = await createTestUser({ email: `dv-ana-${stamp}@test.cozyvtt.local`, displayName: 'DV ana' });
  [gmId, anaId] = [gm.id, ana.id];
  campaignId = (await createTestCampaign(gmId, { name: `DV ${stamp}`, gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: anaId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  await prisma.compendiumBook.create({ data: { id: BOOK, name: `P7 dv ${BOOK}`, gameSystem: 'FIFTH_EDITION' } });
  await prisma.compendiumEntry.createMany({
    data: ENTRIES.map((e) => ({ bookId: BOOK, type: e.type, slug: e.slug, name: e.name, search: e.name.toLowerCase(), text: 'Texto inventado.', data: e.data as object })),
  });
  gmAgent = request.agent(app);
  expect((await gmAgent.post('/api/auth/login').send({ email: gm.email, password: TEST_PASSWORD })).status).toBe(200);
  anaAgent = request.agent(app);
  expect((await anaAgent.post('/api/auth/login').send({ email: ana.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { id: { in: mapIds } } });
  await prisma.character.deleteMany({ where: { id: { in: charIds } } });
  await cleanupCampaigns([campaignId]);
  await prisma.compendiumBook.deleteMany({ where: { id: BOOK } });
  await cleanupUsers([gmId, anaId]);
  await prisma.$disconnect();
});

describe('darkvisionSquares', () => {
  it('turns metres into squares of 1.5 m, a subrace\'s own value first', async () => {
    expect(await darkvisionSquares(sheet({ race: ref('anao') }), 'FIFTH_EDITION')).toBe(12);
    expect(await darkvisionSquares(sheet({ race: ref('elfo'), subrace: ref('drow') }), 'FIFTH_EDITION')).toBe(24);
    expect(await darkvisionSquares(sheet({ race: ref('elfo'), subrace: ref('alto-elfo') }), 'FIFTH_EDITION')).toBe(12);
    expect(await darkvisionSquares(sheet({ race: ref('humano') }), 'FIFTH_EDITION')).toBe(0);
  });

  it('is null for another system, no race, or a race the compendium lacks', async () => {
    expect(await darkvisionSquares(sheet({ race: ref('anao') }), 'PATHFINDER')).toBeNull();
    expect(await darkvisionSquares(sheet({ race: ref('anao') }), null)).toBeNull();
    expect(await darkvisionSquares(sheet(), 'FIFTH_EDITION')).toBeNull();
    expect(await darkvisionSquares(sheet({ race: ref('desconhecido') }), 'FIFTH_EDITION')).toBeNull();
  });
});

describe('placing a token', () => {
  it('gives a dwarf 12, a drow 24 and a human 0', async () => {
    const map = await newMap();
    const dwarf = await newCharacter(sheet({ race: ref('anao') }));
    const drow = await newCharacter(sheet({ race: ref('elfo'), subrace: ref('drow') }));
    const human = await newCharacter(sheet({ race: ref('humano') }));
    expect((await place(map, dwarf)).sightRadius).toBe(12);
    expect((await place(map, drow)).sightRadius).toBe(24);
    expect((await place(map, human)).sightRadius).toBe(0);
    expect((await stored(map, dwarf)).sightRadius).toBe(12);
  });

  it('leaves a sheet with no compendium race at 0, and a range the GM typed as theirs', async () => {
    const map = await newMap();
    const none = await newCharacter(sheet());
    const dwarf = await newCharacter(sheet({ race: ref('anao') }));
    expect((await place(map, none)).sightRadius).toBe(0);
    const typed = await place(map, dwarf, { sightRadius: 5 });
    expect(typed.sightRadius).toBe(5);
    expect(typed.sightRadiusManual).toBe(true);
  });

  it('does not freeze a range echoed from a copy: 12 for a dwarf follows the sheet, 6 is the GM own', async () => {
    const [m1, m2] = [await newMap(), await newMap()];
    const id = await newCharacter(sheet({ race: ref('anao') }));
    const echoed = await place(m1, id, { sightRadius: 12 });
    expect(echoed.sightRadius).toBe(12);
    expect(echoed.sightRadiusManual).not.toBe(true);
    const typed = await place(m2, id, { sightRadius: 6 });
    expect(typed.sightRadiusManual).toBe(true);
    expect((await setRace(anaAgent, id, { race: ref('humano') })).status).toBe(200);
    expect((await stored(m1, id)).sightRadius).toBe(0);
    expect((await stored(m2, id)).sightRadius).toBe(6);
  });
});

describe('a race change on the sheet', () => {
  it('updates every token of the character, on two maps: dwarf to human is 0', async () => {
    const [m1, m2] = [await newMap(), await newMap()];
    const id = await newCharacter(sheet({ race: ref('anao') }));
    await place(m1, id);
    await place(m2, id);
    expect((await setRace(anaAgent, id, { race: ref('humano') })).status).toBe(200);
    expect((await stored(m1, id)).sightRadius).toBe(0);
    expect((await stored(m2, id)).sightRadius).toBe(0);
    expect((await setRace(anaAgent, id, { race: ref('elfo'), subrace: ref('drow') })).status).toBe(200);
    expect((await stored(m1, id)).sightRadius).toBe(24);
    expect((await stored(m2, id)).sightRadius).toBe(24);
  });

  it('leaves tokens alone when the new sheet names no compendium race', async () => {
    const map = await newMap();
    const id = await newCharacter(sheet({ race: ref('anao') }));
    await place(map, id);
    expect((await setRace(anaAgent, id, {})).status).toBe(200);
    expect((await stored(map, id)).sightRadius).toBe(12);
  });

  it('keeps a range the GM set by hand when the player changes the race (Review Focus 2)', async () => {
    const map = await newMap();
    const id = await newCharacter(sheet({ race: ref('anao') }));
    const token = await place(map, id);
    const put = await gmAgent.put(`/api/campaigns/${campaignId}/maps/${map}/tokens/${token.id}`).send({ sightRadius: 6 });
    expect(put.status).toBe(200);
    expect((await stored(map, id)).sightRadiusManual).toBe(true);
    expect((await setRace(anaAgent, id, { race: ref('humano') })).status).toBe(200);
    expect((await stored(map, id)).sightRadius).toBe(6);
    expect(await syncDarkvision(id)).toBe(0);
    expect((await stored(map, id)).sightRadius).toBe(6);
  });

  it('does not mark the range manual when the GM saves the value it already has', async () => {
    const map = await newMap();
    const id = await newCharacter(sheet({ race: ref('anao') }));
    const token = await place(map, id);
    expect((await gmAgent.put(`/api/campaigns/${campaignId}/maps/${map}/tokens/${token.id}`).send({ sightRadius: 12, name: 'Renamed' })).status).toBe(200);
    expect((await stored(map, id)).sightRadiusManual).not.toBe(true);
    expect((await setRace(anaAgent, id, { race: ref('humano') })).status).toBe(200);
    expect((await stored(map, id)).sightRadius).toBe(0);
  });

  it('refuses a player changing a token\'s sightRadius (still GM only)', async () => {
    const map = await newMap();
    const id = await newCharacter(sheet({ race: ref('anao') }));
    const token = await place(map, id, { controlledBy: anaId });
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map } });
    expect((await anaAgent.put(`/api/campaigns/${campaignId}/maps/${map}/tokens/${token.id}`).send({ sightRadius: 40 })).status).toBe(403);
    expect((await stored(map, id)).sightRadius).toBe(12);
  });
});
