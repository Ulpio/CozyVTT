/**
 * Which compendium books a campaign uses: the default for a new one, setting
 * them, reading them, and the filter that keeps a disabled book's creatures
 * out of the library. The creatures are invented. Requires PostgreSQL at
 * DATABASE_URL.
 */

import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
} from '../../__tests__/helpers/db';
import {
  CampaignBooksError,
  campaignBookList,
  creatureBookScope,
  defaultBookIds,
  enabledBookIds,
  setCampaignBooks,
} from '../campaignBooks';

let ownerId: string;
let campaignId: string;
let systemlessId: string;

beforeAll(async () => {
  ownerId = (await createTestUser()).id;
  campaignId = (await createTestCampaign(ownerId, { name: 'P3T Campanha', gameSystem: 'FIFTH_EDITION' })).id;
  systemlessId = (await createTestCampaign(ownerId, { name: 'P3T Sem sistema', gameSystem: null })).id;
});

afterEach(async () => {
  await prisma.creatureTemplate.deleteMany({ where: { name: { startsWith: 'P3T ' } } });
  await prisma.campaignBook.deleteMany({ where: { campaignId: { in: [campaignId, systemlessId] } } });
});

afterAll(async () => {
  await cleanupCampaigns([campaignId, systemlessId]);
  await cleanupUsers([ownerId]);
  await prisma.$disconnect();
});

it('gives a 5e campaign every 5e book but the English SRD', async () => {
  expect(await defaultBookIds('FIFTH_EDITION')).toEqual(['dmg', 'mm', 'phb']);
});

it('gives a campaign with no system no books', async () => {
  expect(await defaultBookIds(null)).toEqual([]);
});

it('keeps the books it is given', async () => {
  await setCampaignBooks(campaignId, ['phb', 'mm']);
  expect(await enabledBookIds(campaignId)).toEqual(['mm', 'phb']);
});

it('refuses a book that does not exist, and keeps the ones it had', async () => {
  await setCampaignBooks(campaignId, ['phb']);
  await expect(setCampaignBooks(campaignId, ['nope'])).rejects.toThrow(CampaignBooksError);
  await expect(setCampaignBooks(campaignId, ['nope'])).rejects.toThrow(/nope/);
  expect(await enabledBookIds(campaignId)).toEqual(['phb']);
});

it('refuses any book for a campaign with no system', async () => {
  await expect(setCampaignBooks(systemlessId, ['phb'])).rejects.toThrow(CampaignBooksError);
});

it('lists the books of the campaign system, marking the enabled ones', async () => {
  await setCampaignBooks(campaignId, ['phb']);
  const list = await campaignBookList(campaignId);
  expect(list.map((b) => b.id).sort()).toEqual(['dmg', 'mm', 'phb', 'srd']);
  expect(list.filter((b) => b.enabled).map((b) => b.id)).toEqual(['phb']);
});

it('lists no books for a campaign with no system', async () => {
  expect(await campaignBookList(systemlessId)).toEqual([]);
});

it('keeps a disabled book out of the creature library, but not the campaign or homemade ones', async () => {
  await setCampaignBooks(campaignId, ['phb']);
  await prisma.creatureTemplate.createMany({
    data: [
      { name: 'P3T Lobo', source: 'mm', statBlock: {} },
      { name: 'P3T Urso', source: 'custom', statBlock: {} },
      { name: 'P3T Cópia', source: 'mm', statBlock: {}, campaignId },
    ],
  });
  const scope = await creatureBookScope(campaignId);
  const found = await prisma.creatureTemplate.findMany({
    where: { AND: [scope, { name: { startsWith: 'P3T ' } }, { OR: [{ campaignId: null }, { campaignId }] }] },
    orderBy: { name: 'asc' },
  });
  expect(found.map((c) => c.name)).toEqual(['P3T Cópia', 'P3T Urso']);
});
