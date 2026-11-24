/**
 * The compendium books a campaign uses. Its creature library and, from P4,
 * its character creation offer only what comes from these books; creatures
 * that come from no book (the GM's own) are always offered. Turning a book off
 * removes nothing already on a map or a sheet.
 *
 * A new campaign gets every book of its system but the English SRD; one with
 * no system gets none. A book of another system is refused.
 */

import type { GameSystem, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';

type Db = PrismaClient | Prisma.TransactionClient;

/** The book left off a new campaign: the English SRD the app shipped with. */
const OFF_BY_DEFAULT = ['srd'];

/** A book list the campaign cannot take; the message names the book. */
export class CampaignBooksError extends Error {}

/** The books a new campaign of this system starts with, sorted. */
export async function defaultBookIds(gameSystem: GameSystem | null, db: Db = prisma): Promise<string[]> {
  if (!gameSystem) return [];
  const books = await db.compendiumBook.findMany({
    where: { gameSystem, id: { notIn: OFF_BY_DEFAULT } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return books.map((b) => b.id);
}

/** Replace the campaign's books. Refuses an unknown book or one of another system. */
export async function setCampaignBooks(campaignId: string, bookIds: string[], db: Db = prisma): Promise<void> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { gameSystem: true } });
  if (!campaign) throw new CampaignBooksError('Campanha não encontrada.');
  const wanted = [...new Set(bookIds)];
  const valid = campaign.gameSystem
    ? new Set(
        (await db.compendiumBook.findMany({ where: { gameSystem: campaign.gameSystem }, select: { id: true } })).map((b) => b.id)
      )
    : new Set<string>();
  const refused = wanted.filter((id) => !valid.has(id));
  if (refused.length > 0) {
    throw new CampaignBooksError(`Esta campanha não pode usar o livro ${refused.join(', ')}.`);
  }
  const write = async (tx: Prisma.TransactionClient) => {
    await tx.campaignBook.deleteMany({ where: { campaignId } });
    if (wanted.length > 0) await tx.campaignBook.createMany({ data: wanted.map((bookId) => ({ campaignId, bookId })) });
  };
  if ('$transaction' in db) await db.$transaction(write);
  else await write(db);
}

/** The ids of the campaign's books, sorted. */
export async function enabledBookIds(campaignId: string, db: Db = prisma): Promise<string[]> {
  const rows = await db.campaignBook.findMany({ where: { campaignId }, select: { bookId: true }, orderBy: { bookId: 'asc' } });
  return rows.map((r) => r.bookId);
}

/** The books of the campaign's system by name, each marked enabled or not. */
export async function campaignBookList(
  campaignId: string,
  db: Db = prisma
): Promise<Array<{ id: string; name: string; enabled: boolean }>> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { gameSystem: true } });
  if (!campaign?.gameSystem) return [];
  const [books, enabled] = await Promise.all([
    db.compendiumBook.findMany({ where: { gameSystem: campaign.gameSystem }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    enabledBookIds(campaignId, db),
  ]);
  return books.map((b) => ({ ...b, enabled: enabled.includes(b.id) }));
}

/**
 * The creatures a campaign's library may offer, as far as books go: its own,
 * those from no book, and those from a book it uses.
 */
export async function creatureBookScope(campaignId: string, db: Db = prisma): Promise<Prisma.CreatureTemplateWhereInput> {
  const [campaign, all, enabled] = await Promise.all([
    db.campaign.findUnique({ where: { id: campaignId }, select: { gameSystem: true } }),
    db.compendiumBook.findMany({ select: { id: true } }),
    enabledBookIds(campaignId, db),
  ]);
  // A campaign with no system has no books to turn on, so its library keeps
  // every creature, as it did before books were chosen per campaign.
  if (!campaign?.gameSystem) return {};
  return {
    OR: [{ campaignId }, { source: { notIn: all.map((b) => b.id) } }, { source: { in: enabled } }],
  };
}
