/**
 * Every attack in the monster book reads: each creature action whose text says
 * "para atingir" must parse, except the few entries the book itself got wrong
 * (listed by name below). Reads the compendium's monster data file
 * (materiais/.compendio/data/mm/monster.json, git-ignored); skips when absent.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parseMonsterAction } from '../monsterActions';

const FILE = resolve(__dirname, '../../../../../materiais/.compendio/data/mm/monster.json');

// "Creature: Action" pairs whose source text is not one readable attack.
const KNOWN_DEFECTS = new Set<string>([
  'Abolete: Cauda', // the bonus is a stray symbol, not a number
  'Goristro: Ataques Múltiplos', // a multiattack, with its attacks inside its text
  'Marilith: Ataques Múltiplos',
  'Dragão de Bronze Adulto: Ataques Múltiplos',
  'Dragão de Latão Adulto: Ataques Múltiplos',
  'Dao: Ataques Múltiplos',
  'Gorila Gigante: Ataques Múltiplos',
  'Inumano: Imitar', // the book merged it with the kenku's Espada Curta attack
]);

interface RawMonster {
  name: string;
  statBlock?: { actions?: { name?: string; description?: string }[] };
}

const present = existsSync(FILE);
if (!present) console.warn(`monsterActions.db: ${FILE} not found (the compendium data is private); skipping.`);

(present ? it : it.skip)('parses every action that says "para atingir"', () => {
  const monsters: RawMonster[] = JSON.parse(readFileSync(FILE, 'utf8'));
  let total = 0;
  const allowed: string[] = [];
  const unparsed: string[] = [];
  for (const m of monsters) {
    for (const a of m.statBlock?.actions ?? []) {
      if (!a.description?.includes('para atingir')) continue;
      total += 1;
      const key = `${m.name}: ${a.name}`;
      if (parseMonsterAction(a.description)) continue;
      (KNOWN_DEFECTS.has(key) ? allowed : unparsed).push(key);
    }
  }
  console.log(`monsterActions.db: ${monsters.length} monsters, ${total} attacks checked, ${allowed.length} known defects, ${unparsed.length} unparsed`);
  expect(unparsed).toEqual([]);
  expect(allowed.sort()).toEqual([...KNOWN_DEFECTS].sort());
});
