/**
 * Darkvision from the 5e sheet: the character's race (and subrace) in the
 * compendium says how far they see in the dark, in metres, and their tokens'
 * `sightRadius` (squares) follows it. A race with no darkvision gives 0. A
 * subrace's own value wins over its race's. A `sightRadius` the GM set by
 * hand (`sightRadiusManual`) is never written by the sheet.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { readTokens, toJson } from '../utils/prisma-json';
import { withMapsLocked } from '../utils/mapTokens';
import logger from '../utils/logger';
import { resendSoonIfCurrent } from '../routes/maps';

/** One metre-to-square step: a square is 1.5 m (5 ft). */
const METRES_PER_SQUARE = 1.5;

type Ref = { bookId: string; slug: string };

function refOf(value: unknown): Ref | null {
  if (typeof value !== 'object' || value === null) return null;
  const { bookId, slug } = value as { bookId?: unknown; slug?: unknown };
  return typeof bookId === 'string' && typeof slug === 'string' ? { bookId, slug } : null;
}

/** The race and subrace a 5e sheet points at, if any. */
export function originRefs(sheet: unknown): { race: Ref | null; subrace: Ref | null } {
  const origin = typeof sheet === 'object' && sheet !== null ? (sheet as { origin?: unknown }).origin : undefined;
  const o = typeof origin === 'object' && origin !== null ? (origin as { race?: unknown; subrace?: unknown }) : {};
  return { race: refOf(o.race), subrace: refOf(o.subrace) };
}

/** True when two sheets name a different race or subrace. */
export function originChanged(before: unknown, after: unknown): boolean {
  const key = (r: Ref | null) => (r ? `${r.bookId}/${r.slug}` : '');
  const a = originRefs(before);
  const b = originRefs(after);
  return key(a.race) !== key(b.race) || key(a.subrace) !== key(b.subrace);
}

async function metresOf(ref: Ref | null, type: 'race' | 'subrace'): Promise<{ found: boolean; metres?: number }> {
  if (!ref) return { found: false };
  const entry = await prisma.compendiumEntry.findFirst({
    where: { bookId: ref.bookId, slug: ref.slug, type },
    select: { data: true },
  });
  if (!entry) return { found: false };
  const metres = (entry.data as { darkvision?: unknown } | null)?.darkvision;
  return { found: true, metres: typeof metres === 'number' && Number.isFinite(metres) ? metres : undefined };
}

/**
 * The squares of darkvision the sheet's race gives, or null when the sheet
 * is not 5e or names no race the compendium knows (its tokens are left alone).
 */
export async function darkvisionSquares(sheet: unknown, gameSystem: string | null): Promise<number | null> {
  if (gameSystem !== 'FIFTH_EDITION') return null;
  const { race, subrace } = originRefs(sheet);
  const raceEntry = await metresOf(race, 'race');
  if (!raceEntry.found) return null;
  const subraceEntry = await metresOf(subrace, 'subrace');
  const metres = subraceEntry.metres ?? raceEntry.metres ?? 0;
  return Math.max(0, Math.floor(metres / METRES_PER_SQUARE));
}

/**
 * Write the character's darkvision on every token of theirs without a manual
 * `sightRadius`, on every map. Returns how many tokens changed. The current
 * map is sent again (the same re-send every token change uses), so each
 * player is told only what they may see of it.
 */
export async function syncDarkvision(characterId: string): Promise<number> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true, gameSystem: true } });
  if (!character) return 0;
  const squares = await darkvisionSquares(character.data, character.gameSystem);
  if (squares === null) return 0;
  const maps = await prisma.$queryRaw<Array<{ id: string; campaignId: string }>>`
    SELECT id, "campaignId" FROM "Map" WHERE tokens @> ${JSON.stringify([{ characterId }])}::jsonb
  `;
  let changed = 0;
  for (const map of maps) {
    const count = await withMapsLocked([map.id], async (tx: Prisma.TransactionClient) => {
      const fresh = await tx.map.findUniqueOrThrow({ where: { id: map.id }, select: { tokens: true } });
      let n = 0;
      const next = readTokens(fresh.tokens).map((t) => {
        if (t?.characterId !== characterId || t.sightRadiusManual === true || (t.sightRadius ?? 0) === squares) return t;
        n++;
        return { ...t, sightRadius: squares, sightRadiusManual: false };
      });
      if (n > 0) await tx.map.update({ where: { id: map.id }, data: { tokens: toJson(next) } });
      return n;
    });
    if (count > 0) {
      changed += count;
      try {
        resendSoonIfCurrent(map.campaignId, map.id);
      } catch (error) {
        logger.warn('Map not re-sent after darkvision changed; the change stands', { err: error, mapId: map.id });
      }
    }
  }
  return changed;
}
