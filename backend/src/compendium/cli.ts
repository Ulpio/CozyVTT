/**
 * The compendium's commands (docs/superpowers/plans/2026-11-14-p2-compendio-5e.md):
 *
 *   npm run compendium:parse -- <dir> [--fresh]
 *       Reads <dir>/raw/{phb,mm,dmg}.txt (made by scripts/compendium-extract.sh)
 *       and writes <dir>/data/phb/spell.json, <dir>/data/dmg/magicItem.json and
 *       <dir>/data/mm/monster.json. An entry already in the file (curated) is
 *       kept as it is; --fresh replaces the files with what the parsers read.
 *       What a parser could not read goes to <dir>/raw/unrecognized.json.
 *   npm run compendium:validate -- <dir>
 *       Lists every problem in <dir>/data; exits 1 when there is one.
 *   npm run compendium:import -- <dataDir> [--force]
 *       Writes <dataDir> into the database (src/compendium/importer.ts).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadData, validateData } from './dataFiles';
import { importCompendium } from './importer';
import { parseMagicItems } from './parse/magicItems';
import { parseMonsters } from './parse/monsters';
import { parseSpells } from './parse/spells';

type Keyed = { slug?: string; name?: string };

/** Write `parsed` to `path`, keeping any entry already there with the same key. */
function writeMerged<T extends Keyed>(path: string, parsed: T[], key: (item: T) => string, fresh: boolean): number {
  const existing: T[] = !fresh && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  const byKey = new Map(existing.map((item) => [key(item), item]));
  const merged = parsed.map((item) => byKey.get(key(item)) ?? item);
  // Curated entries the parser does not produce (written by hand) stay too.
  const parsedKeys = new Set(parsed.map(key));
  for (const item of existing) if (!parsedKeys.has(key(item))) merged.push(item);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
  return merged.length;
}

function parse(dir: string, fresh: boolean): void {
  const raw = (book: string) => readFileSync(join(dir, 'raw', `${book}.txt`), 'utf8');
  const data = (book: string, type: string) => join(dir, 'data', book, `${type}.json`);

  const spells = parseSpells(raw('phb'));
  const monsters = parseMonsters(raw('mm'));
  const items = parseMagicItems(raw('dmg'));

  const counts = {
    spells: writeMerged(data('phb', 'spell'), spells.entries, (e) => e.slug, fresh),
    monsters: writeMerged(data('mm', 'monster'), monsters.monsters, (m) => m.name, fresh),
    magicItems: writeMerged(data('dmg', 'magicItem'), items.entries, (e) => e.slug, fresh),
  };
  const unrecognized = { spells: spells.unrecognized, monsters: monsters.unrecognized, magicItems: items.unrecognized };
  writeFileSync(join(dir, 'raw', 'unrecognized.json'), `${JSON.stringify(unrecognized, null, 2)}\n`);
  console.log('Written:', counts);
  console.log('Not recognized:', Object.fromEntries(Object.entries(unrecognized).map(([k, v]) => [k, v.length])));
}

function validate(dir: string): number {
  const issues = validateData(loadData(join(dir, 'data')));
  for (const issue of issues) console.log(`${issue.where}: ${issue.message}`);
  console.log(issues.length === 0 ? 'No problems.' : `${issues.length} problem(s).`);
  return issues.length === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  const [command, dir, ...flags] = process.argv.slice(2);
  if (!dir) {
    console.error('Usage: cli.ts parse|validate <dir> [--fresh] | import <dataDir> [--force]');
    return 2;
  }
  if (command === 'parse') {
    parse(dir, flags.includes('--fresh'));
    return 0;
  }
  if (command === 'validate') return validate(dir);
  if (command === 'import') {
    const report = await importCompendium(dir, { force: flags.includes('--force') });
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  console.error(`Unknown command "${command}"`);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
