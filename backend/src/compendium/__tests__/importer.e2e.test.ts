/**
 * Importing the compendium's data files into the database: entries are
 * created, then updated; one the admin corrected in the app (editedAt) is
 * left alone unless the import is forced; monsters likewise; bad data is
 * refused whole. The data is invented. Requires PostgreSQL at DATABASE_URL.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { prisma } from '../../__tests__/helpers/db';
import { importCompendium } from '../importer';

let dir: string;

const klass = {
  type: 'class',
  slug: 'p2t-mago',
  name: 'P2T Mago',
  text: 'Uma classe inventada.',
  data: {
    hitDie: 6,
    savingThrows: ['int', 'wis'],
    proficiencies: { armor: [], weapons: ['adagas'], tools: [] },
    skills: { choose: 2, from: ['arcana', 'history'] },
    startingEquipment: ['um grimório'],
    subclassLevel: 2,
    features: [{ level: 1, name: 'Conjuração', description: 'Inventada.' }],
  },
};

const spell = {
  type: 'spell',
  slug: 'p2t-escudo',
  name: 'P2T Escudo',
  nameEn: 'P2T Shield',
  text: 'Uma barreira inventada.',
  data: {
    level: 1,
    school: 'abjuração',
    castingTime: '1 reação',
    range: 'Pessoal',
    components: { v: true, s: true, m: false },
    duration: '1 rodada',
    concentration: false,
    ritual: false,
    classes: ['p2t-mago'],
  },
};

const armor = {
  type: 'armor',
  slug: 'p2t-escudo',
  name: 'P2T Escudo',
  text: '',
  data: { category: 'shield', baseAc: 2, addDex: false, stealthDisadvantage: false, cost: '10 po', weight: 3 },
};

const monster = {
  name: 'P2T Lobo',
  creatureType: 'Besta Média',
  alignment: 'imparcial',
  challengeRating: '1/4',
  statBlock: {
    ac: 13,
    hp: 11,
    hpMax: 11,
    speed: '12 m',
    abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    challengeRating: '1/4',
  },
};

function write(files: Record<string, unknown[]>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, ...path.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(join(dir, ...path.split('/')), JSON.stringify(content));
  }
}

function writeAll(spellText = spell.text) {
  write({
    'phb/class.json': [klass],
    'phb/spell.json': [{ ...spell, text: spellText }],
    'phb/armor.json': [armor],
    'mm/monster.json': [monster],
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'compendio-'));
});

afterEach(async () => {
  rmSync(dir, { recursive: true, force: true });
  await prisma.compendiumEntry.deleteMany({ where: { slug: { startsWith: 'p2t-' } } });
  await prisma.creatureTemplate.deleteMany({ where: { name: { startsWith: 'P2T ' }, campaignId: null } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

it('imports entries and monsters', async () => {
  writeAll();
  const report = await importCompendium(dir, {});
  expect(report).toMatchObject({ created: 3, updated: 0, monstersCreated: 1, monstersUpdated: 0 });

  const stored = await prisma.compendiumEntry.findUnique({
    where: { bookId_type_slug: { bookId: 'phb', type: 'spell', slug: 'p2t-escudo' } },
  });
  expect(stored).toMatchObject({ name: 'P2T Escudo', nameEn: 'P2T Shield', search: 'p2t escudo p2t shield' });

  const wolf = await prisma.creatureTemplate.findFirst({ where: { name: 'P2T Lobo', campaignId: null } });
  expect(wolf).toMatchObject({ source: 'mm', gameSystem: 'FIFTH_EDITION', challengeRating: '1/4', creatureType: 'Besta Média' });
});

it('updates an entry on a second import', async () => {
  writeAll();
  await importCompendium(dir, {});
  writeAll('Uma barreira inventada, corrigida.');
  const report = await importCompendium(dir, {});
  expect(report).toMatchObject({ created: 0, updated: 3, monstersCreated: 0, monstersUpdated: 1 });
  const stored = await prisma.compendiumEntry.findFirst({ where: { slug: 'p2t-escudo', type: 'spell' } });
  expect(stored?.text).toBe('Uma barreira inventada, corrigida.');
});

it('skips an entry edited in the app unless forced', async () => {
  writeAll();
  await importCompendium(dir, {});
  await prisma.compendiumEntry.updateMany({
    where: { slug: 'p2t-escudo', type: 'spell' },
    data: { text: 'Corrigido pelo dono.', editedAt: new Date() },
  });

  writeAll('Do livro, de novo.');
  const report = await importCompendium(dir, {});
  expect(report.skippedEdited).toEqual(['phb/spell/p2t-escudo']);
  expect((await prisma.compendiumEntry.findFirst({ where: { slug: 'p2t-escudo', type: 'spell' } }))?.text).toBe('Corrigido pelo dono.');

  const forced = await importCompendium(dir, { force: true });
  expect(forced.skippedEdited).toEqual([]);
  const after = await prisma.compendiumEntry.findFirst({ where: { slug: 'p2t-escudo', type: 'spell' } });
  expect(after).toMatchObject({ text: 'Do livro, de novo.', editedAt: null });
});

it('skips a monster edited in the app unless forced', async () => {
  writeAll();
  await importCompendium(dir, {});
  await prisma.creatureTemplate.updateMany({ where: { name: 'P2T Lobo', campaignId: null }, data: { editedAt: new Date(), alignment: 'corrigido' } });

  const report = await importCompendium(dir, {});
  expect(report.monstersSkippedEdited).toEqual(['P2T Lobo']);
  expect((await prisma.creatureTemplate.findFirst({ where: { name: 'P2T Lobo', campaignId: null } }))?.alignment).toBe('corrigido');

  await importCompendium(dir, { force: true });
  expect((await prisma.creatureTemplate.findFirst({ where: { name: 'P2T Lobo', campaignId: null } }))?.alignment).toBe('imparcial');
});

it('keeps a spell and an armor with the same name', async () => {
  writeAll();
  await importCompendium(dir, {});
  const both = await prisma.compendiumEntry.findMany({ where: { slug: 'p2t-escudo' }, orderBy: { type: 'asc' } });
  expect(both.map((e) => e.type)).toEqual(['armor', 'spell']);
});

it('refuses data that fails validation', async () => {
  write({ 'phb/spell.json': [{ ...spell, data: { ...spell.data, level: 12 } }] });
  await expect(importCompendium(dir, {})).rejects.toThrow(/p2t-escudo/);
  expect(await prisma.compendiumEntry.count({ where: { slug: { startsWith: 'p2t-' } } })).toBe(0);
});
