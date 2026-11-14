import { searchKey, slugify } from '../searchKey';

it('drops accents and case, and joins the names', () => {
  expect(searchKey('Mísseis Mágicos', 'Magic Missile')).toBe('misseis magicos magic missile');
});

it('skips a missing name and squeezes spaces', () => {
  expect(searchKey('  Luz   Contínua ', undefined)).toBe('luz continua');
});

it('makes a slug from a name with accents and punctuation', () => {
  expect(slugify('Riso Histérico de Tasha')).toBe('riso-histerico-de-tasha');
  expect(slugify('Cegueira/Surdez')).toBe('cegueira-surdez');
});
