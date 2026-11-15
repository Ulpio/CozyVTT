/**
 * Reading the compendium's data folder: `<dataDir>/<book>/<type>.json`, an
 * array of entries per file, and `<dataDir>/mm/monster.json`, the Monster
 * Manual's monsters. The folder lives out of git (materiais/.compendio/data).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { validateEntries, validateMonsters } from './schemas';
import { isCompendiumType, type Issue, type RawEntry, type RawMonster } from './types';

export type BookEntry = RawEntry & { bookId: string };

export interface CompendiumData {
  entries: BookEntry[];
  monsters: RawMonster[];
}

function readJsonArray(path: string): unknown[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${path} does not hold an array`);
  return parsed;
}

export function loadData(dataDir: string): CompendiumData {
  const entries: BookEntry[] = [];
  let monsters: RawMonster[] = [];
  if (!existsSync(dataDir)) throw new Error(`No data folder at ${dataDir}`);

  for (const bookId of readdirSync(dataDir)) {
    const bookDir = join(dataDir, bookId);
    if (!statSync(bookDir).isDirectory()) continue;
    for (const file of readdirSync(bookDir)) {
      if (!file.endsWith('.json')) continue;
      const type = file.slice(0, -'.json'.length);
      const content = readJsonArray(join(bookDir, file));
      if (type === 'monster') {
        monsters = monsters.concat(content as RawMonster[]);
      } else if (isCompendiumType(type)) {
        for (const entry of content as RawEntry[]) entries.push({ ...entry, type: entry.type ?? type, bookId });
      }
    }
  }
  return { entries, monsters };
}

/** Everything wrong with the data; the class slugs a spell may name are the data's own classes. */
export function validateData(data: CompendiumData): Issue[] {
  const classSlugs = new Set(data.entries.filter((e) => e.type === 'class').map((e) => e.slug));
  const slugs = new Set(data.entries.map((e) => `${e.type}:${e.slug}`));
  const issues: Issue[] = [];
  // Slugs repeat across books, so each book is checked on its own.
  const books = new Set(data.entries.map((e) => e.bookId));
  for (const bookId of books) {
    const own = data.entries.filter((e) => e.bookId === bookId);
    for (const issue of validateEntries(own, { classSlugs, slugs })) issues.push({ ...issue, where: `${bookId}/${issue.where}` });
  }
  return issues.concat(validateMonsters(data.monsters));
}
