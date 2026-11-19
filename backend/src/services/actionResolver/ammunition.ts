/**
 * Ammunition in a Faithful campaign: each shot spends one from the stack the
 * weapon fires, the GM's undo gives it back, and what was spent is counted
 * on the sheet (`ammoToRecover`, by gear slug) so half can be picked up after
 * the fight. The stack is found on the held (row-locked) sheet.
 */

import { randomUUID } from 'crypto';
import type { UndoRecord } from '../../rules/actions/actionCard';
import type { ResolvedActionSpec } from '../../rules/actions/catalogue';
import { refuse, type Refusal, type Sheet } from './common';

type Stack = { id?: string; name: string; quantity?: number; slot?: string; equipped?: boolean; compendiumRef?: { bookId: string; slug: string; type?: string } };

const stacksOf = (sheet: Sheet): Stack[] => (Array.isArray(sheet.inventory) ? (sheet.inventory as unknown as Stack[]) : []);

/** "flechas" -> "Flechas". */
const capitalised = (label: string): string => label.charAt(0).toUpperCase() + label.slice(1);

/** The sheet's count of what is waiting to be picked up, as a fresh object. */
function pending(sheet: Sheet): Record<string, number> {
  return { ...((sheet as { ammoToRecover?: Record<string, number> }).ammoToRecover ?? {}) };
}

function setPending(sheet: Sheet, counts: Record<string, number>): void {
  (sheet as { ammoToRecover?: Record<string, number> }).ammoToRecover = counts;
}

/** A new item id that no item of the list has. */
function freshId(items: Stack[]): string {
  const taken = new Set(items.map((i) => i.id));
  let id = `inv-${randomUUID().slice(0, 8)}`;
  while (taken.has(id)) id = `inv-${randomUUID().slice(0, 8)}`;
  return id;
}

/**
 * One shot of a weapon that fires ammunition: one off the stack in the `ammo`
 * slot (else the first one in the backpack) of that kind, one more to pick up
 * afterwards, and the undo record. Refused with "Sem <label>." when there is
 * none. Changes the held sheet in memory only: nothing is stored until the
 * action is.
 */
export function spendAmmunition(
  spec: ResolvedActionSpec,
  sheet: { data: Sheet; changed: boolean },
  characterId: string,
  undo: UndoRecord,
): Refusal | null {
  const fires = spec.ammunition;
  if (!fires) return null;
  const items = stacksOf(sheet.data);
  const ofKind = items.filter((i) => i.compendiumRef?.slug === fires.slug && (i.quantity ?? 1) > 0);
  const stack = ofKind.find((i) => i.slot === 'ammo') ?? ofKind.find((i) => i.slot === undefined) ?? ofKind[0];
  if (!stack) return refuse(`Sem ${fires.label}.`);
  if (!stack.id) stack.id = freshId(items);
  stack.quantity = (stack.quantity ?? 1) - 1;
  const counts = pending(sheet.data);
  counts[fires.slug] = (counts[fires.slug] ?? 0) + 1;
  setPending(sheet.data, counts);
  sheet.changed = true;
  undo.ammo = { characterId, itemId: stack.id, slug: fires.slug, amount: 1, label: fires.label, ...(stack.compendiumRef ? { compendiumRef: { bookId: stack.compendiumRef.bookId, slug: stack.compendiumRef.slug } } : {}) };
  return null;
}

/** Puts `amount` of a kind back on its stack, creating the stack when it is gone. */
export function addToStack(sheet: Sheet, slug: string, label: string, compendiumRef: { bookId: string; slug: string }, amount: number, itemId?: string): void {
  const items = stacksOf(sheet);
  const stack = (itemId ? items.find((i) => i.id === itemId) : undefined) ?? items.find((i) => i.compendiumRef?.slug === slug);
  if (stack) {
    stack.quantity = (stack.quantity ?? 0) + amount;
    return;
  }
  const created: Stack = { id: itemId ?? freshId(items), name: capitalised(label), quantity: amount, compendiumRef };
  sheet.inventory = [...items, created] as unknown as Sheet['inventory'];
}

/** The GM's undo of a shot: the arrow goes back, and is no longer waiting to be picked up. */
export function restoreAmmunition(undo: UndoRecord, held: Map<string, { data: Sheet; changed: boolean }>): void {
  const spent = undo.ammo;
  if (!spent) return;
  const sheet = held.get(spent.characterId);
  if (!sheet) return;
  const items = stacksOf(sheet.data);
  const known = items.find((i) => i.id === spent.itemId) ?? items.find((i) => i.compendiumRef?.slug === spent.slug);
  const ref = known?.compendiumRef ?? spent.compendiumRef;
  if (!ref) return;
  addToStack(sheet.data, spent.slug, spent.label ?? spent.slug.replace(/-\d+$/, '').replace(/-/g, ' '), ref, spent.amount, spent.itemId);
  const counts = pending(sheet.data);
  counts[spent.slug] = Math.max(0, (counts[spent.slug] ?? 0) - spent.amount);
  setPending(sheet.data, counts);
  sheet.changed = true;
}
