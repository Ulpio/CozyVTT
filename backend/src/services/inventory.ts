/**
 * The 5e inventory on the server: what each item is (from the compendium
 * entry its `compendiumRef` points at), equipping and stowing items in the
 * body slots, and opening a pack into its items.
 *
 * Equipping holds the character's row like the action resolver's held sheets,
 * so two changes to one character at once both land. The armour class follows
 * by difference (rules/inventory/equip.ts). In a Faithful campaign, during an
 * active fight in which the character has a token, the change is only allowed
 * on that token's turn and costs what the rules say: the first weapon drawn or
 * stowed in a turn is free, each further one and a shield take the action, and
 * body armour is refused. The spend is checked and taken under the campaign's
 * combat lock, inside the row's transaction (row first, then combat, the order
 * the resolver takes them in).
 */

import { randomUUID } from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';
import { readTokens, toJson } from '../utils/prisma-json';
import { characterInCampaign } from '../utils/characterCampaign';
import { ammoBundleSize, normalizeInventory, type InventoryHints, type InventorySlot, type Item, type ItemKind, type SheetLike } from '../utils/inventory';
import { acAfter, planEquip, type EquipSheet, type ItemFacts } from '../rules/inventory/equip';
import { freshSpend, getState, setState, withCombatLock, type TurnSpend } from '../websocket/initiativeState';
import { resendInitiative } from '../websocket/handlers/initiative';
import { REFUSAL_MESSAGES, applySpend, canSpend } from '../utils/turnEconomy';
import type { ActionCard, Viewer } from '../rules/actions/actionCard';
import { SHEET_LIST_MAX } from '../validators/game-systems/sheetLimits';
import { enabledBookIds } from '../compendium/campaignBooks';
import { GM_ONLY, NO_CHARACTER, noticeRecipient, sendNotice } from './gmNotice';
import { addToStack } from './actionResolver/ammunition';
import { NOT_YOUR_TOKEN, holdSheets, refuse, writeSheets, type Refusal, type Sheet } from './actionResolver/common';

export const ARMOUR_IN_COMBAT = 'Leva minutos para vestir ou tirar armadura.';
export const NO_PACK_CONTENTS = 'Esse pacote não tem conteúdo conhecido.';
export const ITEM_NOT_FOUND = 'Item não encontrado.';
export const WRONG_SLOT = 'Esse item não vai nesse espaço.';
const NOT_FOUND_CHARACTER = 'Character not found';
const NOT_FIFTH_EDITION = 'Só fichas de D&D 5e têm inventário com espaços.';

/** The entry types an inventory item can point at, in the order a slug shared by two is read. */
const ITEM_TYPES = ['weapon', 'armor', 'pack', 'gear', 'tool'] as const;

interface Entry {
  bookId: string;
  type: string;
  slug: string;
  name: string;
  data: Record<string, unknown>;
}

/** What the compendium says about a set of items, keyed `bookId/slug`. */
interface Known {
  entries: Map<string, Entry>;
  /** `bookId/slug` of every gear entry some weapon of its book fires. */
  ammo: Set<string>;
}

type Db = PrismaClient | Prisma.TransactionClient;

type Ref = { bookId?: unknown; slug?: unknown } | undefined;

const keyOf = (ref: Ref): string | null =>
  typeof ref?.bookId === 'string' && typeof ref?.slug === 'string' ? `${ref.bookId}/${ref.slug}` : null;

function plain(text: unknown): string {
  return typeof text === 'string' ? text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() : '';
}

const hasProperty = (entry: Entry | undefined, property: string): boolean =>
  Array.isArray(entry?.data.properties) && (entry!.data.properties as unknown[]).some((p) => plain(p) === property);

/** The entries the items point at, and which gear is ammunition, from any book (turning a book off removes nothing on a sheet). */
async function lookUp(items: Item[], db: Db = prisma): Promise<Known> {
  const entries = new Map<string, Entry>();
  const ammo = new Set<string>();
  const refs = items.map((i) => i?.compendiumRef).filter((r): r is { bookId: string; slug: string } => keyOf(r) !== null);
  if (refs.length === 0) return { entries, ammo };
  const rows = await db.compendiumEntry.findMany({
    where: { type: { in: [...ITEM_TYPES] }, OR: refs.map((r) => ({ bookId: r.bookId, slug: r.slug })) },
    select: { bookId: true, type: true, slug: true, name: true, data: true },
  });
  rows.sort((a, b) => ITEM_TYPES.indexOf(a.type as never) - ITEM_TYPES.indexOf(b.type as never));
  for (const row of rows) {
    const key = `${row.bookId}/${row.slug}`;
    if (!entries.has(key)) entries.set(key, { ...row, data: (row.data ?? {}) as Record<string, unknown> });
  }
  const books = [...new Set(refs.map((r) => r.bookId))];
  const weapons = await db.compendiumEntry.findMany({ where: { type: 'weapon', bookId: { in: books } }, select: { bookId: true, data: true } });
  for (const w of weapons) {
    const fires = (w.data as { ammunition?: unknown } | null)?.ammunition;
    if (typeof fires === 'string' && fires) ammo.add(`${w.bookId}/${fires}`);
  }
  return { entries, ammo };
}

function entryOf(known: Known, item: Item): Entry | undefined {
  const key = keyOf(item?.compendiumRef);
  return key ? known.entries.get(key) : undefined;
}

function kindOf(known: Known, item: Item): ItemKind {
  const entry = entryOf(known, item);
  switch (entry?.type) {
    case 'weapon':
      return 'weapon';
    case 'armor':
      return entry.data.category === 'shield' ? 'shield' : 'armor';
    case 'gear':
      return known.ammo.has(`${entry.bookId}/${entry.slug}`) ? 'ammo' : 'other';
    case 'pack':
      return 'pack';
    default:
      return 'other';
  }
}

function hintsFrom(known: Known): InventoryHints {
  return {
    kindOf: (item) => kindOf(known, item),
    twoHanded: (item) => entryOf(known, item)?.type === 'weapon' && hasProperty(entryOf(known, item), 'duas maos'),
  };
}

/** What equip.ts needs about each item; total, so an unknown item is a plain one-handed thing. */
function factsFrom(known: Known): (item: Item) => ItemFacts {
  return (item) => {
    const kind = kindOf(known, item);
    const entry = entryOf(known, item);
    const facts: ItemFacts = {
      kind: kind === 'pack' ? 'other' : kind,
      twoHanded: kind === 'weapon' && hasProperty(entry, 'duas maos'),
      versatile: kind === 'weapon' && hasProperty(entry, 'versatil'),
    };
    const d = entry?.data;
    if (kind === 'armor' && d && (d.category === 'light' || d.category === 'medium' || d.category === 'heavy') && typeof d.baseAc === 'number') {
      facts.armor = {
        category: d.category,
        baseAc: d.baseAc,
        addDex: d.addDex === true,
        ...(typeof d.maxDex === 'number' ? { maxDex: d.maxDex } : {}),
      };
    }
    return facts;
  };
}

/**
 * What the compendium says each of the sheet's items is, for the normaliser.
 * `campaignId` is not used to narrow the books: an item keeps what it is when
 * its book is turned off, and a character with no campaign is read the same.
 */
export async function inventoryHintsFor(_campaignId: string | null, sheet: SheetLike): Promise<InventoryHints> {
  return hintsFrom(await lookUp(Array.isArray(sheet?.inventory) ? sheet.inventory : []));
}

/** The sheet as it is stored: every item with an id and a slot, ammunition in units, attacks linked. */
export async function normalizedSheet<T extends SheetLike>(campaignId: string | null, sheet: T): Promise<T> {
  if (!sheet || typeof sheet !== 'object' || !Array.isArray(sheet.inventory)) return sheet;
  return normalizeInventory(sheet, await inventoryHintsFor(campaignId, sheet));
}

/** The character, when the requester may change it: the owner or the GM, a 5e sheet of this campaign. */
async function characterToChange(campaignId: string, requester: Viewer, characterId: string): Promise<Refusal | null> {
  if (requester.role === 'SPECTATOR') return refuse(NOT_YOUR_TOKEN);
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || !(await characterInCampaign(character, campaignId))) return refuse(NOT_FOUND_CHARACTER);
  if (requester.role !== 'GM' && character.userId !== requester.userId) return refuse(NOT_YOUR_TOKEN);
  if (character.gameSystem !== 'FIFTH_EDITION') return refuse(NOT_FIFTH_EDITION);
  return null;
}

/** The character's tokens in the campaign's fight, read off the maps the combatants stand on. */
async function tokensInFight(campaignId: string, characterId: string): Promise<Set<string>> {
  const state = getState(campaignId);
  const ids = new Set(state.combatants.filter((c) => c.characterId === characterId).map((c) => c.tokenId));
  const mapIds = [...new Set(state.combatants.map((c) => c.mapId).filter(Boolean))];
  if (mapIds.length === 0) return ids;
  const maps = await prisma.map.findMany({ where: { id: { in: mapIds }, campaignId }, select: { tokens: true } });
  for (const map of maps) for (const t of readTokens(map.tokens)) if (t?.characterId === characterId) ids.add(t.id);
  return ids;
}

/** What one equip took from a turn, to give back if the change is then not stored. */
interface FightSpend {
  tokenId: string;
  round: number;
  before: TurnSpend;
}

/**
 * Check and take the Faithful fight's cost of a change. Nothing is charged
 * outside an active fight, or for a character with no token in it.
 */
function chargeFight(
  campaignId: string,
  tokenIds: Set<string>,
  plan: { handMoves: number; shieldMoved: boolean; armorMoved: boolean },
): Promise<{ ok: true; spent?: FightSpend } | Refusal> {
  return withCombatLock(campaignId, (state): { ok: true; spent?: FightSpend } | Refusal => {
    if (!state.active) return { ok: true };
    const mine = state.combatants.filter((c) => tokenIds.has(c.tokenId));
    if (mine.length === 0) return { ok: true };
    const current = mine.find((c) => c.tokenId === state.currentTokenId);
    if (!current) return refuse(REFUSAL_MESSAGES['not-your-turn']);
    if (plan.armorMoved) return refuse(ARMOUR_IN_COMBAT);
    const before = state.spend[current.tokenId] ?? freshSpend();
    const used = before.objectInteractions ?? 0;
    const needsAction = plan.shieldMoved || plan.handMoves > (used === 0 ? 1 : 0);
    if (plan.handMoves === 0 && !needsAction) return { ok: true };
    let next: TurnSpend = { ...before, oncePerTurn: [...before.oncePerTurn] };
    if (needsAction) {
      const check = canSpend(before, 'action', { yourTurn: true });
      if (!check.ok) return refuse(REFUSAL_MESSAGES[check.refusal]);
      next = applySpend(before, 'action', { attacksPerAction: 1 });
    }
    next.objectInteractions = used + plan.handMoves;
    setState(campaignId, { ...state, spend: { ...state.spend, [current.tokenId]: next } });
    return { ok: true, spent: { tokenId: current.tokenId, round: state.round, before } };
  });
}

/** Put a spend back when the change it paid for was not stored, if that turn is still going. */
async function giveBack(campaignId: string, spent: FightSpend): Promise<void> {
  await withCombatLock(campaignId, (state) => {
    if (!state.active || state.round !== spent.round || state.currentTokenId !== spent.tokenId) return;
    setState(campaignId, { ...state, spend: { ...state.spend, [spent.tokenId]: spent.before } });
  });
}

/** Whether `item` may go in a body slot at all: an equippable kind, or a hand-typed item marked equippable. */
function mayGoInASlot(known: Known, item: Item & { equippable?: boolean }): boolean {
  const kind = kindOf(known, item);
  if (kind === 'pack') return false;
  if (kind !== 'other') return true;
  return !entryOf(known, item) && item.equippable === true;
}

type Held = Sheet & SheetLike & EquipSheet;

/**
 * Put an inventory item in a body slot, or back in the backpack (`slot`
 * null), as the hand rules allow, with the armour class following and, in a
 * Faithful fight, its cost.
 */
export async function equipItem(
  campaignId: string,
  requester: Viewer,
  characterId: string,
  itemId: string,
  slot: InventorySlot | null,
): Promise<{ ok: true; ac: number; acUnknown: boolean } | Refusal> {
  const refused = await characterToChange(campaignId, requester, characterId);
  if (refused) return refused;
  const faithful = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { detailLevel: true } }))?.detailLevel === 'FAITHFUL';
  const tokenIds = faithful ? await tokensInFight(campaignId, characterId) : new Set<string>();

  let spent: FightSpend | undefined;
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const held = await holdSheets(tx, [characterId]);
      const h = held.get(characterId);
      if (!h) return refuse(NOT_FOUND_CHARACTER);
      const known = await lookUp(Array.isArray(h.data.inventory) ? (h.data.inventory as Item[]) : [], tx);
      const sheet = normalizeInventory(h.data as Held, hintsFrom(known));
      const before = (sheet.inventory ?? []) as Item[];
      const target = before.find((i) => i.id === itemId);
      if (!target) return refuse(ITEM_NOT_FOUND);
      if (slot !== null && !mayGoInASlot(known, target)) return refuse(WRONG_SLOT);
      const facts = factsFrom(known);
      const plan = planEquip(before, itemId, slot, facts);
      if (!plan.ok) return refuse(plan.error);
      if (faithful) {
        const charged = await chargeFight(campaignId, tokenIds, plan);
        if (!charged.ok) return charged;
        spent = charged.spent;
      }
      const ac = acAfter(sheet, before, plan.inventory, facts);
      h.data = { ...sheet, inventory: plan.inventory, armorClass: ac.ac } as Sheet;
      h.changed = true;
      await writeSheets(tx, held);
      return { ok: true as const, ac: ac.ac, acUnknown: ac.unknown };
    });
    if (spent) await resendInitiative(campaignId);
    return outcome;
  } catch (error) {
    if (spent) {
      await giveBack(campaignId, spent);
      await resendInitiative(campaignId);
    }
    throw error;
  }
}

type PackItem = { ref: { type: string; slug: string }; quantity: number } | { name: string; quantity: number };
type StoredItem = Item & { weight?: number };

/** A new item id no item of the list has. */
function newId(taken: Set<string>): string {
  let id = `inv-${randomUUID().slice(0, 8)}`;
  while (taken.has(id)) id = `inv-${randomUUID().slice(0, 8)}`;
  taken.add(id);
  return id;
}

/**
 * Open one pack of the inventory: it is replaced by its items (one of a
 * stack of packs is opened), each added to an item of the same compendium
 * entry, or of the same name when typed by hand, if the inventory has one.
 */
export async function openPack(campaignId: string, requester: Viewer, characterId: string, itemId: string): Promise<{ ok: true } | Refusal> {
  const refused = await characterToChange(campaignId, requester, characterId);
  if (refused) return refused;

  return prisma.$transaction(async (tx) => {
    const held = await holdSheets(tx, [characterId]);
    const h = held.get(characterId);
    if (!h) return refuse(NOT_FOUND_CHARACTER);
    const known = await lookUp(Array.isArray(h.data.inventory) ? (h.data.inventory as Item[]) : [], tx);
    const sheet = normalizeInventory(h.data as Held, hintsFrom(known));
    const items = ((sheet.inventory ?? []) as StoredItem[]).map((i) => ({ ...i }));
    const pack = items.find((i) => i.id === itemId);
    if (!pack) return refuse(ITEM_NOT_FOUND);
    const entry = entryOf(known, pack);
    const contents = entry?.type === 'pack' && Array.isArray(entry.data.items) ? (entry.data.items as PackItem[]) : [];
    if (!entry || contents.length === 0) return refuse(NO_PACK_CONTENTS);
    const book = entry.bookId;

    const refs = contents.flatMap((c) => ('ref' in c ? [{ bookId: book, slug: c.ref.slug }] : []));
    const inside = await lookUp(refs.map((r) => ({ name: r.slug, compendiumRef: r })), tx);

    if ((pack.quantity ?? 1) > 1) pack.quantity = (pack.quantity ?? 1) - 1;
    else items.splice(items.indexOf(pack), 1);

    const taken = new Set(items.map((i) => i.id).filter((id): id is string => !!id));
    for (const content of contents) {
      if ('ref' in content) {
        const key = `${book}/${content.ref.slug}`;
        const found = inside.entries.get(key);
        let name = found?.name ?? content.ref.slug;
        let quantity = content.quantity;
        const bundle = inside.ammo.has(key) ? ammoBundleSize(name) : null;
        if (bundle) {
          name = name.replace(/\s*\(\d+\)\s*$/, '');
          quantity *= bundle;
        }
        const same = items.find((i) => keyOf(i.compendiumRef) === key);
        if (same) {
          same.quantity = (same.quantity ?? 1) + quantity;
          continue;
        }
        // The books weigh in kilograms, the sheet in pounds (as the guided creation stores it); a bundle's weight is shared by its units.
        const kg = found?.data.weight;
        items.push({
          id: newId(taken),
          name,
          quantity,
          ...(typeof kg === 'number' ? { weight: (kg * 2) / (bundle ?? 1) } : {}),
          compendiumRef: { bookId: book, slug: content.ref.slug },
        });
      } else {
        const same = items.find((i) => !keyOf(i.compendiumRef) && plain(i.name) === plain(content.name));
        if (same) same.quantity = (same.quantity ?? 1) + content.quantity;
        else items.push({ id: newId(taken), name: content.name, quantity: content.quantity });
      }
    }

    h.data = { ...sheet, inventory: items } as Sheet;
    h.changed = true;
    await writeSheets(tx, held);
    return { ok: true as const };
  });
}

export const COMPENDIUM_ITEM_NOT_FOUND = 'Item não encontrado no compêndio.';
export const GIVE_QUANTITY = 'A quantidade precisa ser um número inteiro de 1 a 999.';
export const GIVE_NAME = 'O nome do item precisa ter de 1 a 120 caracteres.';
export const GIVE_NOTES = 'A anotação do item pode ter até 500 caracteres.';
export const BACKPACK_FULL = 'A mochila está cheia.';
export const GIVE_ONE_OF = 'Escolha um item do compêndio ou digite um nome, não os dois.';

/** The entry types the GM may give from the compendium, in the order a slug shared by two is read. */
const GIVABLE_TYPES = ['weapon', 'armor', 'gear', 'tool', 'pack', 'magicItem'] as const;

export type GiveTarget = { ref: { bookId: string; slug: string } } | { name: string; notes?: string };

/**
 * Give a character an item, into the backpack (no slot): from the compendium
 * (an entry of a book the campaign uses: it takes the entry's name, weight in
 * pounds and `compendiumRef`; ammunition bundles become units) or typed free.
 * It adds to a stack of the same entry already in the backpack (or the ammo
 * slot) and never to a weapon or armour held in a hand or body slot. The row
 * is held like the other inventory changes. Then the owner, when a player at
 * the table, gets the "Você recebeu" notice; the item stands whether or not it
 * could be sent.
 */
export async function giveItem(
  campaignId: string,
  requester: Viewer,
  characterId: string,
  item: GiveTarget,
  quantity: number,
): Promise<{ ok: true; itemId: string; noticeSent: boolean } | Refusal> {
  if (requester.role !== 'GM') return refuse(GM_ONLY);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return refuse(GIVE_QUANTITY);

  let free: { name: string; notes?: string } | null = null;
  if ('name' in item) {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (name.length < 1 || name.length > 120) return refuse(GIVE_NAME);
    const notes = typeof item.notes === 'string' ? item.notes.trim() : '';
    if (item.notes !== undefined && typeof item.notes !== 'string') return refuse(GIVE_NOTES);
    if (notes.length > 500) return refuse(GIVE_NOTES);
    free = { name, ...(notes ? { notes } : {}) };
  }

  const character = await prisma.character.findUnique({ where: { id: characterId } });
  // Naming the campaign is enough: an owner who left still has a character the GM may fill (and no notice then).
  if (!character || character.campaignId !== campaignId) return refuse(NO_CHARACTER);
  if (character.gameSystem !== 'FIFTH_EDITION') return refuse(NOT_FIFTH_EDITION);

  let entry: { bookId: string; slug: string; name: string; data: Record<string, unknown> } | undefined;
  if (!free) {
    const wanted = (item as { ref: { bookId: unknown; slug: unknown } }).ref;
    const key = keyOf(wanted);
    if (!key) return refuse(COMPENDIUM_ITEM_NOT_FOUND);
    const books = await enabledBookIds(campaignId);
    if (!books.includes(wanted.bookId as string)) return refuse(COMPENDIUM_ITEM_NOT_FOUND);
    const rows = await prisma.compendiumEntry.findMany({
      where: { bookId: wanted.bookId as string, slug: wanted.slug as string, type: { in: [...GIVABLE_TYPES] } },
      select: { bookId: true, type: true, slug: true, name: true, data: true },
    });
    rows.sort((a, b) => GIVABLE_TYPES.indexOf(a.type as never) - GIVABLE_TYPES.indexOf(b.type as never));
    if (!rows[0]) return refuse(COMPENDIUM_ITEM_NOT_FOUND);
    entry = { ...rows[0], data: (rows[0].data ?? {}) as Record<string, unknown> };
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const held = await holdSheets(tx, [characterId]);
    const h = held.get(characterId);
    if (!h) return refuse(NO_CHARACTER);
    const known = await lookUp(Array.isArray(h.data.inventory) ? (h.data.inventory as Item[]) : [], tx);
    const sheet = normalizeInventory(h.data as Held, hintsFrom(known));
    const items = ((sheet.inventory ?? []) as StoredItem[]).map((i) => ({ ...i }));
    const taken = new Set(items.map((i) => i.id).filter((id): id is string => !!id));

    let given: { id: string; name: string; quantity: number; ref?: { bookId: string; slug: string } };
    if (entry) {
      const key = `${entry.bookId}/${entry.slug}`;
      const isAmmo = (await lookUp([{ name: entry.name, compendiumRef: { bookId: entry.bookId, slug: entry.slug } }], tx)).ammo.has(key);
      const bundle = isAmmo ? ammoBundleSize(entry.name) : null;
      const name = bundle ? entry.name.replace(/\s*\(\d+\)\s*$/, '') : entry.name;
      const units = bundle ? quantity * bundle : quantity;
      const same = items.find((i) => keyOf(i.compendiumRef) === key && i.slot === undefined) ?? items.find((i) => keyOf(i.compendiumRef) === key && i.slot === 'ammo');
      if (same) {
        same.quantity = (same.quantity ?? 1) + units;
        given = { id: same.id as string, name, quantity: units, ref: { bookId: entry.bookId, slug: entry.slug } };
      } else {
        if (items.length >= SHEET_LIST_MAX) return refuse(BACKPACK_FULL);
        const kg = entry.data.weight;
        const id = newId(taken);
        items.push({
          id,
          name,
          quantity: units,
          ...(typeof kg === 'number' ? { weight: (kg * 2) / (bundle ?? 1) } : {}),
          compendiumRef: { bookId: entry.bookId, slug: entry.slug },
        });
        given = { id, name, quantity: units, ref: { bookId: entry.bookId, slug: entry.slug } };
      }
    } else {
      if (items.length >= SHEET_LIST_MAX) return refuse(BACKPACK_FULL);
      const id = newId(taken);
      items.push({ id, name: free!.name, quantity, ...(free!.notes ? { notes: free!.notes } : {}) } as StoredItem);
      given = { id, name: free!.name, quantity };
    }

    h.data = { ...sheet, inventory: items } as Sheet;
    h.changed = true;
    await writeSheets(tx, held);
    return { ok: true as const, given };
  });
  if (!outcome.ok) return outcome;
  const { given } = outcome;

  let noticeSent = false;
  if ((await noticeRecipient(campaignId, characterId)) !== null) {
    const text = given.quantity === 1 ? `Você recebeu: ${given.name}` : `Você recebeu: ${given.name} ×${given.quantity}`;
    // The item is stored; a notice that cannot be sent does not take it back.
    try {
      noticeSent = (await sendNotice(campaignId, requester, characterId, text, { name: given.name, quantity: given.quantity, ...(given.ref ? { compendiumRef: given.ref } : {}) })).ok;
    } catch {
      noticeSent = false;
    }
  }
  return { ok: true, itemId: given.id, noticeSent };
}

export const NO_RECOVERY_IN_COMBAT = 'Não dá para recolher munição durante o combate.';

/** One of each of the book's kinds of ammunition; any other keeps its label. */
const ONE_OF: Record<string, string> = {
  flechas: 'flecha',
  virotes: 'virote',
  'balas de funda': 'bala de funda',
  'agulhas de zarabatana': 'agulha de zarabatana',
};

/** "3 flechas", "1 flecha". */
export function ammoAmount(amount: number, label: string): string {
  return `${amount} ${amount === 1 ? (ONE_OF[label] ?? label) : label}`;
}

/** "3 flechas" or "3 flechas e 1 virote", the way the line names what came back. */
function listed(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

/**
 * After the fight, pick up half of what was shot (`floor(n / 2)` of each
 * kind): it goes back to its stack, which is created if it is gone, the
 * count is cleared, and a chat line says so. Refused while a fight is on.
 * The GM may undo the card, which puts the stacks and the count back as they
 * were.
 */
export async function recoverAmmo(
  campaignId: string,
  requester: Viewer,
  characterId: string,
): Promise<{ ok: true; recovered: Record<string, number>; messageId?: string; card?: ActionCard } | Refusal> {
  const refused = await characterToChange(campaignId, requester, characterId);
  if (refused) return refused;
  if (getState(campaignId).active) return refuse(NO_RECOVERY_IN_COMBAT);

  const outcome = await prisma.$transaction(async (tx) => {
    const held = await holdSheets(tx, [characterId]);
    const h = held.get(characterId);
    if (!h) return refuse(NOT_FOUND_CHARACTER);
    const counts = (h.data as { ammoToRecover?: Record<string, number> }).ammoToRecover ?? {};
    const live = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
    const dropZeros = () => {
      if (Object.keys(live).length === Object.keys(counts).length) return false;
      if (Object.keys(live).length > 0) (h.data as { ammoToRecover?: Record<string, number> }).ammoToRecover = live;
      else delete (h.data as { ammoToRecover?: unknown }).ammoToRecover;
      h.changed = true;
      return true;
    };
    const nothing = async () => {
      if (dropZeros()) await writeSheets(tx, held);
      return { ok: true as const, recovered: {} as Record<string, number> };
    };
    if (!Object.values(live).some((n) => Math.floor(n / 2) > 0)) return nothing();

    const items = (Array.isArray(h.data.inventory) ? h.data.inventory : []) as Item[];
    const attacks = (Array.isArray(h.data.attacks) ? h.data.attacks : []) as { compendiumRef?: { bookId: string } }[];
    const books = [...new Set([...items, ...attacks].map((i) => i?.compendiumRef?.bookId).filter((b): b is string => typeof b === 'string'))];
    const gear = books.length > 0
      ? await tx.compendiumEntry.findMany({ where: { type: 'gear', slug: { in: Object.keys(live) }, bookId: { in: books } }, select: { bookId: true, slug: true, name: true } })
      : [];

    const recovered: Record<string, number> = {};
    const back: NonNullable<ActionCard['undo']['ammoRecovered']>['back'] = [];
    const parts: string[] = [];
    const kept: Record<string, number> = {};
    for (const [slug, shot] of Object.entries(live)) {
      const amount = Math.floor(shot / 2);
      const stack = items.find((i) => i.compendiumRef?.slug === slug);
      const entry = gear.find((g) => g.slug === slug);
      const ref = stack?.compendiumRef ?? (entry ? { bookId: entry.bookId, slug } : books[0] ? { bookId: books[0], slug } : undefined);
      // Nothing to put it on: it stays counted, to be picked up once there is.
      if (!ref) { kept[slug] = shot; continue; }
      if (amount <= 0) { back.push({ slug, itemId: stack?.id ?? '', amount: 0, shot }); continue; }
      const label = (stack?.name ?? entry?.name ?? slug.replace(/-\d+$/, '').replace(/-/g, ' ')).replace(/\s*\(\d+\)\s*$/, '').toLowerCase();
      const itemId = addToStack(h.data, slug, label, ref, amount, stack?.id);
      back.push({ slug, itemId, amount, shot });
      recovered[slug] = amount;
      parts.push(ammoAmount(amount, label));
    }
    if (parts.length === 0) return nothing();
    if (Object.keys(kept).length > 0) (h.data as { ammoToRecover?: Record<string, number> }).ammoToRecover = kept;
    else delete (h.data as { ammoToRecover?: unknown }).ammoToRecover;
    h.changed = true;
    await writeSheets(tx, held);

    const name = h.character.name;
    const sentence = `${name} recolhe ${listed(parts)}.`;
    const card: ActionCard = {
      kind: 'action',
      actor: { tokenId: '', name, userId: requester.userId },
      actionName: 'Recolher munição',
      mode: 'normal',
      targets: [],
      extraText: sentence,
      undo: { hp: [], ammoRecovered: { characterId, back } },
    };
    const message = await tx.message.create({
      data: { campaignId, userId: requester.userId, type: 'CHARACTER_ACTION', content: sentence, metadata: toJson(card) },
      select: { id: true },
    });
    return { ok: true as const, recovered, messageId: message.id, card };
  });
  if (!outcome.ok) return outcome;
  const { messageId, card, recovered } = outcome as { recovered: Record<string, number>; messageId?: string; card?: ActionCard };
  return { ok: true, recovered, ...(messageId ? { messageId, card } : {}) };
}
