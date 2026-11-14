/**
 * The compendium's tables: the four books the migration inserts, and one
 * entry per book, type and slug. Requires PostgreSQL at DATABASE_URL.
 */

import { prisma } from '../../__tests__/helpers/db';

afterAll(async () => {
  await prisma.compendiumEntry.deleteMany({ where: { slug: 'teste-p2' } });
  await prisma.$disconnect();
});

it('has the four books after migrating', async () => {
  const ids = (await prisma.compendiumBook.findMany({ orderBy: { id: 'asc' } })).map((b) => b.id);
  expect(ids).toEqual(['dmg', 'mm', 'phb', 'srd']);
});

it('refuses a second entry with the same book, type and slug', async () => {
  const base = { bookId: 'phb', type: 'spell', slug: 'teste-p2', name: 'Teste', search: 'teste', text: '', data: {} };
  await prisma.compendiumEntry.create({ data: base });
  await expect(prisma.compendiumEntry.create({ data: base })).rejects.toThrow();
});

it('lets a creature carry an edited mark', async () => {
  const creature = await prisma.creatureTemplate.create({
    data: { name: 'Teste P2', source: 'mm', statBlock: {}, editedAt: new Date() },
  });
  try {
    expect(creature.editedAt).toBeInstanceOf(Date);
    expect(creature.editedById).toBeNull();
  } finally {
    await prisma.creatureTemplate.delete({ where: { id: creature.id } });
  }
});
