/**
 * What a token can do, read from the stored data only: a character's sheet
 * with the spells and weapons it points at in the campaign's books, or an
 * NPC's stat block. Nothing the client sends reaches this.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { enabledBookIds } from '../../compendium/campaignBooks';
import {
  characterActions,
  npcActions,
  type CompendiumSpell,
  type CompendiumWeapon,
  type ResolvedActionSpec,
} from '../../rules/actions/catalogue';
import type { FifthEditionCharacterData } from '../../validators/game-systems/fifthEdition.schema';
import type { NpcStatBlockInput } from '../../validators/statBlock';
import type { Token } from '../../websocket/shared';

type Ref = { bookId?: unknown; slug?: unknown } | undefined | null;

/** Every `bookId/slug` pointer a sheet's attacks, cantrips and spells hold. */
function sheetRefs(sheet: FifthEditionCharacterData): { bookId: string; slug: string }[] {
  const refs: Ref[] = [
    ...(sheet?.attacks ?? []).map((a) => a?.compendiumRef),
    ...(sheet?.spellcasting?.cantripRefs ?? []).map((c) => c?.compendiumRef),
    ...(sheet?.spellcasting?.spells ?? []).map((s) => s?.compendiumRef),
  ];
  return refs.filter((r): r is { bookId: string; slug: string } => typeof r?.bookId === 'string' && typeof r?.slug === 'string');
}

/** The spells and weapons a sheet points at, from the books the campaign uses, keyed `bookId/slug`. */
async function compendiumFor(campaignId: string, sheet: FifthEditionCharacterData) {
  const spells = new Map<string, CompendiumSpell>();
  const weapons = new Map<string, CompendiumWeapon>();
  const refs = sheetRefs(sheet);
  if (refs.length === 0) return { spells, weapons };
  const enabled = new Set(await enabledBookIds(campaignId));
  const wanted = refs.filter((r) => enabled.has(r.bookId));
  if (wanted.length === 0) return { spells, weapons };
  const rows = await prisma.compendiumEntry.findMany({
    where: {
      type: { in: ['spell', 'weapon'] },
      OR: wanted.map((r) => ({ bookId: r.bookId, slug: r.slug })),
    },
    select: { bookId: true, type: true, slug: true, name: true, text: true, data: true },
  });
  for (const row of rows) {
    const key = `${row.bookId}/${row.slug}`;
    const entry = { slug: row.slug, name: row.name, text: row.text, data: row.data as Prisma.JsonObject };
    if (row.type === 'spell') spells.set(key, entry as unknown as CompendiumSpell);
    else weapons.set(key, entry as unknown as CompendiumWeapon);
  }
  return { spells, weapons };
}

/** A character's actions when `sheet` is given, else the token's stat block's, else none. */
export async function catalogueFor(
  campaignId: string,
  token: Token,
  sheet: FifthEditionCharacterData | null,
): Promise<ResolvedActionSpec[]> {
  if (sheet) {
    const { spells, weapons } = await compendiumFor(campaignId, sheet);
    return characterActions(sheet, spells, weapons);
  }
  if (token.statBlock && typeof token.statBlock === 'object') return npcActions(token.statBlock as unknown as NpcStatBlockInput);
  return [];
}
