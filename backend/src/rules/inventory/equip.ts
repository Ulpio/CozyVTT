/**
 * The hand rules and the armour class by difference, pure.
 *
 * The server decides where an item can go and what it does to the stored armour
 * class; nothing here touches the database or the compendium (the caller passes
 * what it knows about each item as `facts`).
 */

import type { InventorySlot, Item } from '../../utils/inventory';

export interface ItemFacts {
  kind: 'weapon' | 'shield' | 'armor' | 'ammo' | 'other';
  twoHanded: boolean;
  versatile: boolean;
  armor?: { category: 'light' | 'medium' | 'heavy'; baseAc: number; addDex: boolean; maxDex?: number };
}

/** The slice of a 5e sheet the armour class needs. */
export interface EquipSheet {
  armorClass?: number;
  class?: string;
  origin?: { class?: { slug?: string; bookId?: string } };
  stats?: {
    dexterity?: { modifier?: number };
    constitution?: { modifier?: number };
    wisdom?: { modifier?: number };
  };
}

const WRONG_SLOT = 'Esse item não vai nesse espaço.';

function allowedSlots(f: ItemFacts): InventorySlot[] {
  switch (f.kind) {
    case 'weapon':
      if (f.twoHanded) return ['both'];
      if (f.versatile) return ['main', 'both'];
      return ['main', 'off'];
    case 'shield':
      return ['off'];
    case 'armor':
      return ['armor'];
    case 'ammo':
      return ['ammo'];
    default:
      return ['main', 'off'];
  }
}

/** Slots whose occupant has to leave when `slot` is taken. */
function clashes(slot: InventorySlot): InventorySlot[] {
  if (slot === 'both') return ['main', 'off', 'both'];
  if (slot === 'main' || slot === 'off') return [slot, 'both'];
  return [slot];
}

const inHand = (s: InventorySlot | undefined): boolean => s === 'main' || s === 'off' || s === 'both';

export function planEquip(
  inventory: Item[],
  itemId: string,
  slot: InventorySlot | null,
  facts: (item: Item) => ItemFacts,
):
  | { ok: true; inventory: Item[]; handMoves: number; shieldMoved: boolean; armorMoved: boolean }
  | { ok: false; error: string } {
  const target = inventory.find((i) => i.id === itemId);
  if (!target) return { ok: false, error: 'Item não encontrado.' };
  if (slot !== null && !allowedSlots(facts(target)).includes(slot)) return { ok: false, error: WRONG_SLOT };

  const next: Item[] = inventory.map((i) => ({ ...i }));
  const bumped = slot === null ? [] : clashes(slot);
  for (const item of next) {
    if (item.id === itemId) continue;
    if (item.slot !== undefined && bumped.includes(item.slot)) item.slot = undefined;
  }
  const moved = next.find((i) => i.id === itemId) as Item;
  if (slot === null) delete moved.slot;
  else moved.slot = slot;
  for (const item of next) {
    if (item.slot === undefined) delete item.slot;
    if (item.equipped !== undefined || item.slot !== undefined) item.equipped = item.slot !== undefined;
  }

  let handMoves = 0;
  let shieldMoved = false;
  let armorMoved = false;
  inventory.forEach((was, index) => {
    const now = next[index];
    if (was.slot === now.slot) return;
    const f = facts(was);
    if (f.kind === 'weapon' || f.kind === 'other') {
      if (inHand(was.slot) !== inHand(now.slot)) handMoves++;
    } else if (f.kind === 'shield') {
      shieldMoved = true;
    } else if (f.kind === 'armor') {
      armorMoved = true;
    }
  });
  return { ok: true, inventory: next, handMoves, shieldMoved, armorMoved };
}

function plain(text: string | undefined): string {
  return (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function classOf(sheet: EquipSheet): 'barbarian' | 'monk' | null {
  const slug = plain(sheet.origin?.class?.slug);
  const name = plain(sheet.class);
  if (slug === 'barbaro' || name === 'barbaro') return 'barbarian';
  if (slug === 'monge' || name === 'monge') return 'monk';
  return null;
}

/**
 * What the worn body armour and shield add to the armour class. `'unknown'`
 * for a body armour with no compendium data.
 */
export function acContribution(
  body: ItemFacts['armor'] | 'unknown' | undefined,
  shield: boolean,
  sheet: EquipSheet,
): number | 'unknown' {
  if (body === 'unknown') return 'unknown';
  const dex = sheet.stats?.dexterity?.modifier ?? 0;
  let base: number;
  if (body) {
    if (body.category === 'heavy' || !body.addDex) base = body.baseAc;
    else if (body.category === 'light') base = body.baseAc + dex;
    else base = body.baseAc + Math.min(dex, body.maxDex ?? 2);
  } else {
    base = 10 + dex;
    const cls = classOf(sheet);
    if (cls === 'barbarian') base += sheet.stats?.constitution?.modifier ?? 0;
    else if (cls === 'monk' && !shield) base += sheet.stats?.wisdom?.modifier ?? 0;
  }
  return base + (shield ? 2 : 0);
}

function worn(items: Item[], facts: (item: Item) => ItemFacts): { body: ItemFacts['armor'] | 'unknown' | undefined; bodyId?: string; shield: boolean } {
  let body: ItemFacts['armor'] | 'unknown' | undefined;
  let shield = false;
  let bodyId: string | undefined;
  for (const item of items) {
    if (item.slot === undefined) continue;
    const f = facts(item);
    if (f.kind === 'armor' && item.slot === 'armor') {
      body = f.armor ?? 'unknown';
      bodyId = item.id;
    }
    else if (f.kind === 'shield' && item.slot === 'off') shield = true;
  }
  return { body, bodyId, shield };
}

export function acAfter(
  sheet: EquipSheet,
  before: Item[],
  after: Item[],
  facts: (item: Item) => ItemFacts,
): { ac: number; unknown: boolean } {
  const stored = sheet.armorClass ?? 10;
  const b = worn(before, facts);
  const a = worn(after, facts);
  if (b.bodyId !== undefined && b.bodyId === a.bodyId) return { ac: stored + 2 * (Number(a.shield) - Number(b.shield)), unknown: false };
  const was = acContribution(b.body, b.shield, sheet);
  const now = acContribution(a.body, a.shield, sheet);
  if (was === 'unknown' || now === 'unknown') return { ac: stored, unknown: true };
  return { ac: stored - was + now, unknown: false };
}
