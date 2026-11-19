/**
 * The inventory's body slots, one rule for both sides.
 *
 * The server stores every sheet through `normalizeInventory` and decides what
 * the hands hold by it; the client reads the result. This file exists once in
 * each package and the two copies must stay byte-identical, so it imports
 * nothing and only knows the shapes below.
 */

export type InventorySlot = 'main' | 'off' | 'both' | 'armor' | 'ammo';

export type ItemKind = 'weapon' | 'shield' | 'armor' | 'ammo' | 'pack' | 'other';

export interface Item {
  id?: string;
  name: string;
  quantity?: number;
  /** Pounds, per unit. */
  weight?: number;
  equippable?: boolean;
  equipped?: boolean;
  slot?: InventorySlot;
  compendiumRef?: { bookId: string; slug: string; type?: string };
}

export interface AttackLike {
  name: string;
  itemId?: string;
}

export interface SheetLike {
  inventory?: Item[];
  attacks?: AttackLike[];
  ammoToRecover?: Record<string, number>;
}

/** What the caller knows from the compendium about an item. */
export interface InventoryHints {
  kindOf(item: Item): ItemKind;
  twoHanded(item: Item): boolean;
}

const NO_HINTS: InventoryHints = { kindOf: () => 'other', twoHanded: () => false };

const BUNDLE = /^(.*\S)\s*\((\d+)\)\s*$/;
const EQUIPPABLE: ItemKind[] = ['weapon', 'shield', 'armor', 'ammo'];

/** "Flechas (20)" -> 20, "Corda" -> null. */
export function ammoBundleSize(name: string): number | null {
  const match = /\((\d+)\)\s*$/.exec(name);
  if (!match) return null;
  const size = Number(match[1]);
  return size > 0 ? size : null;
}

/** The items held in a hand (main, off or both). */
export function itemsInHands(sheet: SheetLike): Item[] {
  return (sheet.inventory ?? []).filter((i) => i.slot === 'main' || i.slot === 'off' || i.slot === 'both');
}

/** A sheet that never flagged a weapon as equipped still attacks with the first weapon one of its attack rows names. */
function holdLinkedWeapon(items: Item[], attacks: AttackLike[], hints: InventoryHints): void {
  if (items.some((i) => hints.kindOf(i) === 'weapon' && i.equipped === true)) return;
  const names = new Set(attacks.map((a) => a.name.trim().toLowerCase()));
  const ids = new Set(attacks.map((a) => a.itemId).filter((id): id is string => !!id));
  const weapon = items.find((i) => hints.kindOf(i) === 'weapon' && (ids.has(i.id as string) || names.has(i.name.trim().toLowerCase())));
  if (!weapon) return;
  if (hints.twoHanded(weapon)) {
    if (!items.some((i) => i.slot === 'off' || i.slot === 'main' || i.slot === 'both')) weapon.slot = 'both';
  } else if (!items.some((i) => i.slot === 'main' || i.slot === 'both')) {
    weapon.slot = 'main';
  }
}

function assignSlots(items: Item[], hints: InventoryHints, attacks: AttackLike[]): void {
  if (items.some((i) => i.slot !== undefined)) return;
  if (!items.some((i) => i.equipped === true)) {
    holdLinkedWeapon(items, attacks, hints);
    return;
  }
  let armor = false;
  let ammo = false;
  let main = false;
  let off = false;
  let both = false;
  const equipped = items.filter((i) => i.equipped === true);
  for (const item of equipped) {
    if (hints.kindOf(item) === 'armor' && !armor) {
      item.slot = 'armor';
      armor = true;
    }
  }
  for (const item of equipped) {
    if (hints.kindOf(item) === 'shield' && !off) {
      item.slot = 'off';
      off = true;
    }
  }
  for (const item of equipped) {
    if (hints.kindOf(item) !== 'weapon') continue;
    if (hints.twoHanded(item)) {
      if (!main && !off && !both) {
        item.slot = 'both';
        both = true;
      }
    } else if (!both && !main) {
      item.slot = 'main';
      main = true;
    } else if (!both && !off) {
      item.slot = 'off';
      off = true;
    }
  }
  // A hand-typed item an attack row names (a template's "Longsword") is held, so its attack stays on the bar.
  for (const attack of attacks) {
    if (both || (main && off)) break;
    const name = attack.name.trim().toLowerCase();
    const item = equipped.find(
      (i) => !i.compendiumRef && i.slot === undefined && i.equippable !== false && i.name.trim().toLowerCase() === name,
    );
    if (!item) continue;
    item.slot = main ? 'off' : 'main';
    if (main) off = true;
    else main = true;
  }
  for (const item of equipped) {
    if (hints.kindOf(item) === 'ammo' && !ammo) {
      item.slot = 'ammo';
      ammo = true;
    }
  }
  holdLinkedWeapon(items, attacks, hints);
}

export function normalizeInventory<T extends SheetLike>(sheet: T, hints: InventoryHints = NO_HINTS): T {
  const out = { ...sheet } as T;
  if (!sheet.inventory) return out;

  // (1) split ammunition bundles into units
  const items: Item[] = sheet.inventory.map((original) => {
    const item: Item = { ...original, ...(original.compendiumRef ? { compendiumRef: { ...original.compendiumRef } } : {}) };
    if (hints.kindOf(item) === 'ammo') {
      const match = BUNDLE.exec(item.name);
      const size = match ? Number(match[2]) : 0;
      if (match && size > 0) {
        item.name = match[1];
        item.quantity = (item.quantity ?? 1) * size;
        if (typeof item.weight === 'number') item.weight = item.weight / size;
      }
    }
    return item;
  });

  // (2) ids
  const taken = new Set(items.map((i) => i.id).filter((id): id is string => !!id));
  items.forEach((item, index) => {
    if (item.id) return;
    let id = `inv-${index}`;
    for (let n = 2; taken.has(id); n++) id = `inv-${index}-${n}`;
    taken.add(id);
    item.id = id;
  });

  // (3) slots for sheets never normalised (no item has an id yet): once stored,
  // an empty hand is the player's choice and stays empty.
  if (!sheet.inventory.some((i) => !!i.id)) assignSlots(items, hints, sheet.attacks ?? []);

  // (4) equipped follows the slot on equippable items
  for (const item of items) {
    if (!EQUIPPABLE.includes(hints.kindOf(item))) continue;
    if (item.slot !== undefined) item.equipped = true;
    else if (item.equipped !== undefined) item.equipped = false;
  }
  (out as SheetLike).inventory = items;

  // (5) link attacks to the item they come from
  if (sheet.attacks) {
    const byName = new Map<string, string>();
    for (const item of items) {
      const key = item.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, item.id as string);
    }
    (out as SheetLike).attacks = sheet.attacks.map((attack) => {
      if (attack.itemId) return { ...attack };
      const id = byName.get(attack.name.trim().toLowerCase());
      return id ? { ...attack, itemId: id } : { ...attack };
    });
  }
  return out;
}
