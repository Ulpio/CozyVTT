/**
 * Every pack lists what it holds as items (compendium references or short free
 * names), and every weapon with the ammunition property names the gear it
 * fires. Reads the compendium data files (materiais/.compendio/data/phb,
 * git-ignored); skips when absent.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const DIR = resolve(__dirname, '../../../../materiais/.compendio/data/phb');
const present = existsSync(resolve(DIR, 'pack.json')) && existsSync(resolve(DIR, 'weapon.json'));
if (!present) console.warn(`packContents: ${DIR} not found (the compendium data is private); skipping.`);

interface Raw {
  slug: string;
  data: Record<string, any>;
}
const load = (type: string): Raw[] => JSON.parse(readFileSync(resolve(DIR, `${type}.json`), 'utf8')) as Raw[];

const d = present ? describe : describe.skip;

d('pack contents', () => {
  it('gives every pack one item per contents line', () => {
    const bad = load('pack')
      .filter((p) => !Array.isArray(p.data.items) || p.data.items.length !== p.data.contents.length)
      .map((p) => p.slug);
    expect(bad).toEqual([]);
  });

  it('points every reference at an existing entry of its type, with a whole quantity', () => {
    const slugs: Record<string, Set<string>> = {};
    const bad: string[] = [];
    for (const pack of load('pack')) {
      for (const item of pack.data.items ?? []) {
        if (!Number.isInteger(item.quantity) || item.quantity < 1) bad.push(`${pack.slug}: quantity`);
        if (!item.ref) continue;
        slugs[item.ref.type] ??= new Set(load(item.ref.type).map((e) => e.slug));
        if (!slugs[item.ref.type].has(item.ref.slug)) bad.push(`${pack.slug}: ${item.ref.type}/${item.ref.slug}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps free item names short', () => {
    const bad: string[] = [];
    for (const pack of load('pack')) {
      for (const item of pack.data.items ?? []) {
        if (item.name !== undefined && item.name.length > 60) bad.push(`${pack.slug}: ${item.name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('names the ammunition of every weapon that uses it', () => {
    const gear = new Set(load('gear').map((e) => e.slug));
    const ammoWeapons = load('weapon').filter((w) => w.data.properties.includes('munição'));
    expect(ammoWeapons.length).toBeGreaterThan(0);
    const bad = ammoWeapons.filter((w) => !gear.has(w.data.ammunition)).map((w) => w.slug);
    expect(bad).toEqual([]);
  });
});
