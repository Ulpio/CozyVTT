/**
 * The compendium (rules data from the owner's books, src/compendium):
 *
 *   GET   /api/compendium/books          the books
 *   GET   /api/compendium/entries        search: ?type= &book= &q= &page= &pageSize=
 *   GET   /api/compendium/entries/:id    one entry, whole
 *   PATCH /api/compendium/entries/:id    the admin corrects an entry
 *
 * Every signed-in account reads it, except magic items, which only the admin
 * finds until the GM can hand one over (P6). `q` is compared with the
 * entry's name and English name, without accents or case. A correction is
 * checked against its type's schema and marked, so an import leaves it alone.
 */

import { Router, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/rbac';
import { adminOnly, authenticated } from '../middleware/compose';
import { prisma } from '../config/database';
import { issueMessages } from '../validators/issueMessages';
import { searchKey } from '../compendium/searchKey';
import { validateEntries } from '../compendium/schemas';
import { isCompendiumType } from '../compendium/types';
import { enabledBookIds } from '../compendium/campaignBooks';
import logger from '../utils/logger';

const router = Router();

const ADMIN_ONLY_TYPES = ['magicItem'];
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const isAdmin = (req: AuthenticatedRequest) => req.session.platformRole === 'ADMIN';

const SearchQuery = z.object({
  type: z.string().optional(),
  book: z.string().optional(),
  // Search only the books this campaign uses; members only.
  campaignId: z.string().max(100).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const Correction = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    nameEn: z.string().trim().max(200).nullable().optional(),
    text: z.string().max(100_000).optional(),
    data: z.unknown().optional(),
  })
  .strict();

router.get('/books', authenticated, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const books = await prisma.compendiumBook.findMany({ orderBy: { name: 'asc' } });
    return res.json(books);
  } catch (error) {
    logger.error('Error listing compendium books', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list the books' });
  }
});

router.get('/entries', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = SearchQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Validation Error', message: issueMessages(parsed.error) });
  const { type, book, campaignId, q, page, pageSize } = parsed.data;

  const where: Prisma.CompendiumEntryWhereInput = {};
  if (type) where.type = type;
  if (book) where.bookId = book;
  if (!isAdmin(req)) where.NOT = { type: { in: ADMIN_ONLY_TYPES } };
  const key = q ? searchKey(q) : '';
  if (key) where.search = { contains: key };

  try {
    if (campaignId) {
      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId: req.session.userId!, campaignId } },
        select: { userId: true },
      });
      if (!membership) {
        return res.status(403).json({ error: 'Forbidden', message: "Only a member can search a campaign's books" });
      }
      const enabled = await enabledBookIds(campaignId);
      where.bookId = { in: book ? enabled.filter((id) => id === book) : enabled };
    }

    const [items, total] = await Promise.all([
      prisma.compendiumEntry.findMany({
        where,
        select: { id: true, bookId: true, type: true, slug: true, name: true, nameEn: true },
        orderBy: [{ name: 'asc' }, { type: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.compendiumEntry.count({ where }),
    ]);
    return res.json({ items, total });
  } catch (error) {
    logger.error('Error searching the compendium', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to search the compendium' });
  }
});

router.get('/entries/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entry = await prisma.compendiumEntry.findUnique({ where: { id: req.params.id } });
    if (!entry || (ADMIN_ONLY_TYPES.includes(entry.type) && !isAdmin(req))) {
      return res.status(404).json({ error: 'Not Found', message: 'Entry not found' });
    }
    return res.json(entry);
  } catch (error) {
    logger.error('Error reading a compendium entry', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to read the entry' });
  }
});

router.patch('/entries/:id', adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = Correction.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation Error', message: issueMessages(parsed.error) });

  try {
    const entry = await prisma.compendiumEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: 'Not Found', message: 'Entry not found' });
    if (!isCompendiumType(entry.type)) {
      return res.status(409).json({ error: 'Conflict', message: `Entries of type "${entry.type}" cannot be corrected` });
    }

    const next = {
      name: parsed.data.name ?? entry.name,
      nameEn: parsed.data.nameEn === undefined ? entry.nameEn : parsed.data.nameEn || null,
      text: parsed.data.text ?? entry.text,
      data: parsed.data.data === undefined ? entry.data : parsed.data.data,
    };

    // A spell may name only the classes the compendium has.
    const classes = await prisma.compendiumEntry.findMany({ where: { type: 'class' }, select: { slug: true } });
    const issues = validateEntries(
      [{ type: entry.type, slug: entry.slug, name: next.name, nameEn: next.nameEn ?? undefined, text: next.text, data: next.data }],
      { classSlugs: new Set(classes.map((c) => c.slug)) }
    );
    if (issues.length > 0) {
      return res.status(400).json({ error: 'Validation Error', message: issues.map((i) => i.message).join('; ') });
    }

    const updated = await prisma.compendiumEntry.update({
      where: { id: entry.id },
      data: {
        name: next.name,
        nameEn: next.nameEn,
        text: next.text,
        data: next.data as Prisma.InputJsonValue,
        search: searchKey(next.name, next.nameEn ?? undefined),
        editedAt: new Date(),
        editedById: req.session.userId,
      },
    });
    return res.json(updated);
  } catch (error) {
    logger.error('Error correcting a compendium entry', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to correct the entry' });
  }
});

export default router;
