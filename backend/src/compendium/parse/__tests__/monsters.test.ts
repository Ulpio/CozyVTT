/**
 * The monsters parser, on an invented text laid out as the Monster Manual's
 * extracted text is: a lore section that repeats the name as a heading, then
 * the block itself (name, type line, Armor Class line, the six scores, the
 * properties, traits and the action sections).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMonsters } from '../monsters';

const text = readFileSync(join(__dirname, 'fixtures', 'monsters.txt'), 'utf8');
const { monsters, unrecognized } = parseMonsters(text);
const byName = (name: string) => monsters.find((m) => m.name === name)!;
const block = (name: string) => byName(name).statBlock as Record<string, unknown>;

it('parses a small monster block', () => {
  expect(monsters.map((m) => m.name)).toEqual(['Lobo Teste', 'Dragão Inventado', 'Soldado Inventado', 'Orog Inventado', 'Águia Inventada', 'Enxame Inventado']);
  expect(byName('Lobo Teste')).toMatchObject({ creatureType: 'Besta Média', alignment: 'imparcial', challengeRating: '1/4' });
  expect(block('Lobo Teste')).toMatchObject({
    ac: 13,
    hp: 11,
    hpMax: 11,
    hitDice: '2d8 + 2',
    speed: '12 m',
    abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    skills: { perception: 3, stealth: 4 },
    senses: 'Percepção passiva 13',
    languages: '—',
  });
});

it('reads modifiers written with an en dash', () => {
  expect(block('Lobo Teste').attributeModifiers).toMatchObject({ int: -4, cha: -2 });
});

it('splits traits, actions and reactions', () => {
  const dragon = block('Dragão Inventado');
  expect(dragon.traits).toEqual([{ name: 'Anfíbio', description: 'O dragão pode respirar ar e água.' }]);
  expect((dragon.actions as { name: string }[]).map((a) => a.name)).toEqual(['Ataques Múltiplos', 'Mordida']);
  // A line broken mid-sentence joins its action.
  expect((dragon.actions as { description: string }[])[1].description).toMatch(/mais 4 \(1d8\) de dano de fogo\.$/);
  expect(dragon.reactions).toEqual([
    { name: 'Cauda Defensiva', description: 'O dragão adiciona 3 à CA contra um ataque que o atingiria.' },
  ]);
  expect((dragon.legendaryActions as { name: string }[]).map((a) => a.name)).toEqual(['Ações Lendárias', 'Detectar']);
  expect(dragon).toMatchObject({
    savingThrows: { dex: 5, con: 9, wis: 5, cha: 9 },
    damageImmunities: 'fogo',
    speed: '12 m, escalada 12 m, voo 24 m',
  });
});

it('reads challenge rating 1/4 with its XP', () => {
  expect(block('Lobo Teste')).toMatchObject({ challengeRating: '1/4', xp: 50 });
  expect(block('Dragão Inventado')).toMatchObject({ challengeRating: '13', xp: 10000 });
});

it('lists a block without Armor Class as unrecognized', () => {
  expect(unrecognized).toEqual(['COGUMELO SEM BLOCO']);
});

it('reads a score that comes after the properties', () => {
  const soldier = block('Soldado Inventado');
  expect(soldier.abilities).toEqual({ str: 16, dex: 13, con: 14, int: 10, wis: 11, cha: 10 });
  expect(soldier).toMatchObject({ skills: { athletics: 5 }, languages: 'Comum', challengeRating: '3', xp: 700 });
  expect(soldier.traits).toEqual([]);
  expect((soldier.actions as { name: string }[]).map((a) => a.name)).toEqual(['Golpe']);
});

it('finds a block whose name is not in capitals, with its sections in lower case', () => {
  const orog = block('Orog Inventado');
  expect(orog).toMatchObject({ ac: 18, challengeRating: '2' });
  expect((orog.traits as { name: string }[]).map((t) => t.name)).toEqual(['Agressivo']);
  expect((orog.actions as { name: string }[]).map((a) => a.name)).toEqual(['Machado Grande']);
});

it('finds a block whose type line writes the size in lower case', () => {
  expect(byName('Águia Inventada')).toMatchObject({ creatureType: 'Besta pequena', challengeRating: '0' });
});

it('finds a swarm, whose size is followed by what it is made of', () => {
  expect(byName('Enxame Inventado')).toMatchObject({ creatureType: 'Enxame Médio de bestas Miúdas', challengeRating: '1/2' });
});
