/**
 * What rides on a character's weapon attack: the features the player ticks
 * for it (Sneak Attack, Divine Smite), named in the request as `riders`.
 * They are checked before anything is rolled (the option lists them, the
 * pool has a use left, the slot is there) and add their dice, and spend
 * their use and slot, only when the attack hits. A running state's flat
 * bonus (Rage) needs no ticking: rules/actions/features.ts stateDamageBonus.
 */

import { rollDamage } from '../../rules/actions/attackRoll';
import { characterLevel, type ResolvedActionSpec } from '../../rules/actions/catalogue';
import { resourcePools, riderDice, type ActorFeature } from '../../rules/actions/features';
import type { DamagePart, UndoRecord } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';
import { CANNOT_RESOLVE, NO_SLOT, NO_USES, hasSlot, spendSlot, type HeldSheet } from './common';
import { changeUses } from './features';

/** A rider the request names, with the slot level it spends when it spends one. */
export interface ChosenRider {
  feature: ActorFeature;
  slotLevel?: number;
}

/**
 * The riders the request names, or null when it may not name them: only on a
 * weapon attack option that lists each one, each once, with a slot level
 * exactly when the rider spends a slot.
 */
export function chosenRiders(
  requested: { featureId: string; slotLevel?: number }[] | undefined,
  spec: ResolvedActionSpec,
  features: ActorFeature[],
): ChosenRider[] | null {
  if (!requested || requested.length === 0) return [];
  const listed = spec.option.riders ?? [];
  if (spec.source !== 'weapon' || spec.option.group !== 'attack') return null;
  const chosen: ChosenRider[] = [];
  for (const { featureId, slotLevel } of requested) {
    if (!listed.some((r) => r.featureId === featureId) || chosen.some((c) => c.feature.id === featureId)) return null;
    const feature = features.find((f) => f.id === featureId);
    if (!feature || (feature.action.slot ? slotLevel === undefined : slotLevel !== undefined)) return null;
    chosen.push(slotLevel === undefined ? { feature } : { feature, slotLevel });
  }
  return chosen;
}

/**
 * Why the riders cannot ride on this attack, checked before the roll: a pool
 * with too little left, no slot of the level named, no dice at the actor's
 * level. Null when they all can.
 */
export function riderRefusal(riders: ChosenRider[], sheet: HeldSheet | null, features: ActorFeature[]): string | null {
  if (riders.length === 0) return null;
  if (!sheet) return CANNOT_RESOLVE;
  const level = characterLevel(sheet.data);
  const pools = resourcePools(features, sheet.data);
  const wanted: Record<string, number> = {};
  for (const { feature, slotLevel } of riders) {
    const { action } = feature;
    if (action.spends) {
      const pool = pools[action.spends.key];
      wanted[action.spends.key] = (wanted[action.spends.key] ?? 0) + (action.spends.amount ?? 1);
      if (!pool || wanted[action.spends.key] > pool.max - pool.spent) return NO_USES;
    }
    if (action.slot && !hasSlot(sheet, slotLevel as number)) return NO_SLOT;
    if (!riderDice(action, level, slotLevel)) return CANNOT_RESOLVE;
  }
  return null;
}

/**
 * The riders' damage on a hit, each a line of the weapon's damage type named
 * by its feature, its dice doubled on a critical like the weapon's; spends
 * each one's use and slot on the sheet, recorded on `undo`. riderRefusal
 * first.
 */
export function applyRiders(
  riders: ChosenRider[],
  sheet: HeldSheet,
  critical: boolean,
  weaponType: string | undefined,
  undo: UndoRecord,
  rng: Rng,
): DamagePart[] {
  const level = characterLevel(sheet.data);
  return riders.map(({ feature, slotLevel }) => {
    const { action } = feature;
    const r = rollDamage(riderDice(action, level, slotLevel) as string, critical, rng);
    if (action.spends) {
      const amount = action.spends.amount ?? 1;
      changeUses(sheet, action.spends.key, amount);
      undo.uses = [...(undo.uses ?? []), { characterId: sheet.character.id, key: action.spends.key, amount }];
    }
    if (action.slot) spendSlot(sheet, slotLevel as number, undo);
    const part: DamagePart = { total: Math.max(0, r.total), breakdown: `${r.breakdown.expression}: ${r.breakdown.formula}`, label: feature.name };
    if (weaponType) part.type = weaponType;
    return part;
  });
}
