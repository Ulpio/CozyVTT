/**
 * What a token can do, read from the stored data only: a character's sheet
 * with the spells and weapons it points at in the campaign's books and the
 * features of its class and subclass there, or an NPC's stat block. Nothing
 * the client sends reaches this.
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
import { actorFeatures, classEntryFor, withFeatures, type ActorFeature, type CompendiumClass, type CompendiumSubclass } from '../../rules/actions/features';
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

/**
 * The compendium class and subclass a sheet is of, from the campaign's books:
 * the ones its origin points at, else the class named as the sheet's class.
 */
async function classEntriesFor(campaignId: string, sheet: FifthEditionCharacterData): Promise<{ classEntry: CompendiumClass | null; subclassEntry: CompendiumSubclass | null }> {
  const none = { classEntry: null, subclassEntry: null };
  const enabled = await enabledBookIds(campaignId);
  if (enabled.length === 0) return none;
  const select = { bookId: true, slug: true, name: true, data: true } as const;
  const classRef = sheet?.origin?.class;
  const classes = await prisma.compendiumEntry.findMany({
    where: classRef ? { type: 'class', bookId: classRef.bookId, slug: classRef.slug } : { type: 'class', bookId: { in: enabled } },
    select,
  });
  const classEntry = classEntryFor(sheet, classes.filter((c) => enabled.includes(c.bookId)) as unknown as CompendiumClass[]);
  if (!classEntry) return none;
  const subRef = sheet?.origin?.subclass;
  if (!subRef || !enabled.includes(subRef.bookId)) return { classEntry, subclassEntry: null };
  const subclasses = await prisma.compendiumEntry.findMany({ where: { type: 'subclass', bookId: subRef.bookId, slug: subRef.slug }, select });
  const subclassEntry = (subclasses.find((s) => s.bookId === subRef.bookId && s.slug === subRef.slug) ?? null) as unknown as CompendiumSubclass | null;
  return { classEntry, subclassEntry };
}

/** The class and subclass features a character has at its level, from the campaign's books. */
export async function featuresFor(campaignId: string, sheet: FifthEditionCharacterData): Promise<ActorFeature[]> {
  const { classEntry, subclassEntry } = await classEntriesFor(campaignId, sheet);
  return actorFeatures(sheet, classEntry, subclassEntry);
}

/**
 * A character's actions when `sheet` is given (with its `features`, read here
 * when the caller has not), else the token's stat block's, else none.
 */
export async function catalogueFor(
  campaignId: string,
  token: Token,
  sheet: FifthEditionCharacterData | null,
  known?: ActorFeature[],
): Promise<ResolvedActionSpec[]> {
  if (sheet) {
    const [{ spells, weapons }, features] = await Promise.all([compendiumFor(campaignId, sheet), known ?? featuresFor(campaignId, sheet)]);
    return withFeatures(characterActions(sheet, spells, weapons), features, sheet);
  }
  if (token.statBlock && typeof token.statBlock === 'object') return npcActions(token.statBlock as unknown as NpcStatBlockInput, token.rechargeSpent ?? []);
  return [];
}
