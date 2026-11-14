/**
 * The magic items parser, on an invented text laid out as the Dungeon
 * Master's Guide's extracted text is: the item's name in capitals, a line
 * "Categoria (detalhe), raridade (requer sintonização …)", then its text.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMagicItems } from '../magicItems';

const text = readFileSync(join(__dirname, 'fixtures', 'magicItems.txt'), 'utf8');
const { entries } = parseMagicItems(text);
const bySlug = (slug: string) => entries.find((e) => e.slug === slug)!;

it('reads each item with its category and rarity', () => {
  expect(entries.map((e) => e.slug)).toEqual(['capa-teste', 'espada-inventada-1', 'tomo-do-sabio-teste', 'pocao-de-cura-inventada']);
  expect(bySlug('espada-inventada-1')).toMatchObject({
    type: 'magicItem',
    name: 'Espada Inventada +1',
    data: { category: 'Arma (espada longa)', rarity: 'rara', attunement: false },
  });
});

it('reads an item that requires attunement', () => {
  expect(bySlug('capa-teste').data).toMatchObject({ category: 'Item maravilhoso', rarity: 'incomum', attunement: true });
});

it('reads an item that requires attunement by a class', () => {
  expect(bySlug('tomo-do-sabio-teste').data).toMatchObject({
    rarity: 'muito raro',
    attunement: true,
    attunementBy: 'um clérigo, druida ou mago',
  });
});

it('reads a rarity that varies', () => {
  expect(bySlug('pocao-de-cura-inventada').data).toMatchObject({ category: 'Poção', rarity: 'raridade varia' });
});

it('joins an item text cut by a page break, and stops at the next item', () => {
  expect(bySlug('espada-inventada-1').text).toBe(
    'Você recebe +1 de bônus nas jogadas de ataque e de dano feitas com esta arma inventada.'
  );
  expect(bySlug('capa-teste').text).toBe('Enquanto veste esta capa inventada, você recebe +1 de bônus na CA.');
  expect(bySlug('pocao-de-cura-inventada').text).toBe('Você recupera pontos de vida quando bebe esta poção inventada.');
});
