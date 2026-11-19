/**
 * inventoryBackfill.ts
 * Gives every stored 5e sheet the inventory shape body slots need, once.
 *
 * A sheet made before P5d has `equipped` marks and no item ids, slots,
 * attack links or ammunition in units. The normaliser (utils/inventory.ts)
 * turns it into the shape the server and the client both read; this writes
 * that shape to every 5e character whose stored sheet differs from it, so the
 * equip events always find ids. It runs at server start, before anyone
 * connects (server.ts), and is idempotent: a normalised sheet normalises to
 * itself and is not written again. The armour class is not touched: the
 * stored number already counts the armour that was equipped.
 */

import { isDeepStrictEqual } from 'util';
import { prisma } from '../config/database';
import { toJson } from '../utils/prisma-json';
import { normalizedSheet } from './inventory';
import type { SheetLike } from '../utils/inventory';
import logger from '../utils/logger';

export interface InventoryBackfillResult {
  scanned: number;
  changed: number;
}

/** The sheet as it would come back from the database: what is undefined is not stored. */
const asStored = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function normalised(campaignId: string | null, data: unknown): Promise<unknown | null> {
  if (!data || typeof data !== 'object' || !Array.isArray((data as SheetLike).inventory)) return null;
  const next = asStored(await normalizedSheet(campaignId, data as SheetLike));
  return isDeepStrictEqual(next, data) ? null : next;
}

export async function backfillInventory(): Promise<InventoryBackfillResult> {
  const characters = await prisma.character.findMany({
    where: { gameSystem: 'FIFTH_EDITION' },
    select: { id: true, campaignId: true, data: true },
  });
  const result: InventoryBackfillResult = { scanned: characters.length, changed: 0 };

  for (const character of characters) {
    if ((await normalised(character.campaignId, character.data)) === null) continue;
    // Read afresh under the row's lock, so a save landing meanwhile is not undone.
    const wrote = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${character.id} FOR UPDATE`;
      const fresh = await tx.character.findUnique({ where: { id: character.id }, select: { data: true, campaignId: true } });
      const next = fresh ? await normalised(fresh.campaignId, fresh.data) : null;
      if (next === null) return false;
      await tx.character.update({ where: { id: character.id }, data: { data: toJson(next) } });
      return true;
    });
    if (wrote) result.changed += 1;
  }

  logger.info(`Inventory backfill: ${result.changed} of ${result.scanned} 5e characters given item ids and body slots.`);
  return result;
}
