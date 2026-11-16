/**
 * Every attack in the imported monster books reads: each creature action whose
 * text says "para atingir" must parse. Requires PostgreSQL at DATABASE_URL with
 * the compendium imported; with no creatures it skips.
 */

import { prisma } from '../../../__tests__/helpers/db';
import { parseMonsterAction } from '../monsterActions';

afterAll(async () => {
  await prisma.$disconnect();
});

it('parses every action that says "para atingir"', async () => {
  const creatures = await prisma.creatureTemplate.findMany({ select: { name: true, statBlock: true } });
  if (creatures.length === 0) {
    console.warn('monsterActions.db: no creatures in the database (run compendium:import); skipping.');
    return;
  }
  let total = 0;
  const failed: string[] = [];
  for (const c of creatures) {
    const actions = ((c.statBlock as { actions?: { name?: string; description?: string }[] })?.actions ?? []);
    for (const a of actions) {
      if (!a.description?.includes('para atingir')) continue;
      // A multiattack, or text the book merged with another action, carries its
      // attacks inside other text: it does not start as one attack.
      if (!/^\s*(Ataque\s+)?(Corpo|[àa]\s+Dist)/i.test(a.description)) continue;
      // A bonus the book printed unreadably (a stray symbol instead of a number).
      if (!/[+\-−–]\s*\d+\s+para atingir/.test(a.description)) continue;
      total += 1;
      if (!parseMonsterAction(a.description)) failed.push(`${c.name}: ${a.name}`);
    }
  }
  console.log(`monsterActions.db: ${total} attacks, ${failed.length} unparsed`);
  expect(failed).toEqual([]);
});
