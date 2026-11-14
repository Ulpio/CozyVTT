/**
 * The spells parser, on an invented text laid out as the Player's Handbook's
 * extracted text is: class lists first, then each spell's title in capitals,
 * its level and header line (which can wrap or be cut by a page number), and
 * its paragraphs.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseClassSpellLists, parseSpells } from '../spells';

const text = readFileSync(join(__dirname, 'fixtures', 'spells.txt'), 'utf8');
const { entries, unrecognized } = parseSpells(text);
const bySlug = (slug: string) => entries.find((e) => e.slug === slug)!;
const data = (slug: string) => bySlug(slug).data as Record<string, unknown>;

it('parses a cantrip and a leveled spell', () => {
  expect(entries.map((e) => e.slug)).toEqual([
    'faisca-teste',
    'raio-teste',
    'sino-de-vigilia',
    'truque-do-vagalume',
    'protecao-partida',
  ]);
  expect(data('faisca-teste')).toMatchObject({
    level: 0,
    school: 'evocação',
    castingTime: '1 ação',
    range: '18 metros',
    components: { v: true, s: true, m: false },
    duration: 'Instantânea',
  });
  expect(data('raio-teste')).toMatchObject({
    level: 1,
    components: { v: true, s: true, m: true, material: 'um fio de cobre' },
  });
  // The name as the class lists write it, not in capitals.
  expect(bySlug('raio-teste').name).toBe('Raio Teste');
  expect(bySlug('raio-teste').type).toBe('spell');
});

it('marks concentration and ritual', () => {
  expect(data('truque-do-vagalume')).toMatchObject({ concentration: true, duration: 'Concentração, até 1 minuto' });
  expect(data('sino-de-vigilia')).toMatchObject({ ritual: true, concentration: false, duration: '8 horas' });
});

it('keeps the higher-levels paragraph apart', () => {
  expect(data('raio-teste').higherLevels).toMatch(/^Quando você conjurar essa magia/);
  expect(bySlug('raio-teste').text).not.toMatch(/Em Níveis Superiores/);
  expect(data('faisca-teste').higherLevels).toBeUndefined();
});

it('joins a spell split by a page break', () => {
  expect(bySlug('sino-de-vigilia').text).toBe(
    'Um sino inventado toca na sua mente quando algo cruza a área escolhida, por um cubo de até 6 metros de lado, até a magia acabar.'
  );
  expect(bySlug('truque-do-vagalume').text).toBe('Uma luz inventada dança onde você quiser.');
});

it('keeps a heading inside a spell in its text and reports it', () => {
  expect(unrecognized).toEqual(['TABELA INVENTADA']);
  expect(bySlug('raio-teste').text).toBe(
    'Um raio inventado atinge uma criatura que você possa ver.\n\nTABELA INVENTADA\n\nUma linha da tabela.'
  );
  expect(bySlug('protecao-partida').text).toBe('Uma proteção inventada.');
});

it('maps spells to classes from the class lists', () => {
  const lists = parseClassSpellLists(text);
  expect(lists.get('faisca-teste')).toEqual(['mago', 'clerigo']);
  expect(lists.get('sino-de-vigilia')).toEqual(['mago', 'clerigo']);
  expect(lists.get('protecao-partida')).toEqual(['mago']);
  expect(data('sino-de-vigilia').classes).toEqual(['mago', 'clerigo']);
});
