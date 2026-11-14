/**
 * Write the compendium's data files into the database.
 *
 * Entries are created or updated by (book, type, slug); monsters are global
 * creatures of the Monster Manual (source 'mm'), found by name. An entry or a
 * creature the admin corrected in the app (editedAt set) is left as it is and
 * named in the report, unless the import is forced, which also clears the
 * mark. Data that fails validation is refused whole, before anything is written.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../config/database';
import { loadData, validateData } from './dataFiles';
import { searchKey } from './searchKey';
import type { RawMonster } from './types';

export interface ImportReport {
  created: number;
  updated: number;
  /** `<book>/<type>/<slug>` of each entry left as the admin corrected it. */
  skippedEdited: string[];
  monstersCreated: number;
  monstersUpdated: number;
  /** Names of the monsters left as the admin corrected them. */
  monstersSkippedEdited: string[];
}

const MONSTER_SOURCE = 'mm';

/** A creature's footprint on the map, in squares, from its size. */
function footprint(creatureType: string | undefined): { width: number; height: number } {
  const type = creatureType ?? '';
  if (/\bGrande\b/.test(type)) return { width: 2, height: 2 };
  if (/\bEnorme\b/.test(type)) return { width: 3, height: 3 };
  if (/\bImens[oa]\b/.test(type)) return { width: 4, height: 4 };
  return { width: 1, height: 1 };
}

function monsterFields(monster: RawMonster) {
  return {
    gameSystem: 'FIFTH_EDITION' as const,
    challengeRating: monster.challengeRating ?? null,
    creatureType: monster.creatureType ?? null,
    alignment: monster.alignment ?? null,
    statBlock: monster.statBlock as Prisma.InputJsonValue,
    size: footprint(monster.creatureType),
  };
}

export async function importCompendium(
  dataDir: string,
  opts: { force?: boolean },
  prisma: PrismaClient = defaultPrisma
): Promise<ImportReport> {
  const data = loadData(dataDir);
  const issues = validateData(data);
  if (issues.length > 0) {
    const shown = issues.slice(0, 20).map((i) => `  ${i.where}: ${i.message}`).join('\n');
    throw new Error(`The data has ${issues.length} problem(s); nothing was imported.\n${shown}`);
  }

  const report: ImportReport = { created: 0, updated: 0, skippedEdited: [], monstersCreated: 0, monstersUpdated: 0, monstersSkippedEdited: [] };

  for (const entry of data.entries) {
    const where = { bookId_type_slug: { bookId: entry.bookId, type: entry.type, slug: entry.slug } };
    const fields = {
      name: entry.name,
      nameEn: entry.nameEn ?? null,
      search: searchKey(entry.name, entry.nameEn),
      text: entry.text,
      data: entry.data as Prisma.InputJsonValue,
    };
    const existing = await prisma.compendiumEntry.findUnique({ where, select: { editedAt: true } });
    if (!existing) {
      await prisma.compendiumEntry.create({ data: { bookId: entry.bookId, type: entry.type, slug: entry.slug, ...fields } });
      report.created++;
    } else if (existing.editedAt && !opts.force) {
      report.skippedEdited.push(`${entry.bookId}/${entry.type}/${entry.slug}`);
    } else {
      await prisma.compendiumEntry.update({ where, data: { ...fields, editedAt: null, editedById: null } });
      report.updated++;
    }
  }

  for (const monster of data.monsters) {
    const existing = await prisma.creatureTemplate.findFirst({
      where: { source: MONSTER_SOURCE, name: monster.name, campaignId: null },
      select: { id: true, editedAt: true },
    });
    if (!existing) {
      await prisma.creatureTemplate.create({ data: { name: monster.name, source: MONSTER_SOURCE, ...monsterFields(monster) } });
      report.monstersCreated++;
    } else if (existing.editedAt && !opts.force) {
      report.monstersSkippedEdited.push(monster.name);
    } else {
      await prisma.creatureTemplate.update({
        where: { id: existing.id },
        data: { ...monsterFields(monster), editedAt: null, editedById: null },
      });
      report.monstersUpdated++;
    }
  }
  return report;
}
