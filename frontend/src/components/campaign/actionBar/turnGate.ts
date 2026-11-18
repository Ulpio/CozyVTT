// ============================================
// Why the bar greys a button: what the turn (when the actor is in a fight) or
// the feature's own uses forbid. The turn's rules and copy are
// utils/turnEconomy.ts's, the same the server refuses with; undefined means
// the button is free to press.
// ============================================

import type { TFunction } from 'i18next';
import type { ActionCombatTurn, ActionOption } from '@/types/actions';
import { REFUSAL_MESSAGES, canSpend } from '@/utils/turnEconomy';

export function gateFor(option: ActionOption, combat: ActionCombatTurn | undefined, t: TFunction): string | undefined {
  if (option.uses && option.uses.left <= 0 && !option.active) return t('actionBar.noUses');
  if (!combat) return undefined;
  if (option.combatUnavailable) {
    return option.castingTime ? t('actionBar.turn.takesTime', { time: option.castingTime }) : t('actionBar.errors.tooLongToCast');
  }
  // Ending a running state costs nothing, at any time.
  if (option.active) return undefined;
  const result = canSpend(combat.spend, option.cost, { yourTurn: combat.yourTurn, meleeWeapon: option.meleeWeapon });
  return result.ok ? undefined : REFUSAL_MESSAGES[result.refusal];
}

/** Why a rider cannot be added to the hit: nothing left of it, or a once-a-turn one already used. */
export function riderGate(
  rider: { featureId: string; uses?: { left: number; max: number } },
  combat: ActionCombatTurn | undefined,
  t: TFunction,
): string | undefined {
  if (rider.uses && rider.uses.left <= 0) return t('actionBar.noUses');
  if (!combat) return undefined;
  const result = canSpend(combat.spend, 'none', { yourTurn: true, oncePerTurnKey: rider.featureId });
  return result.ok ? undefined : REFUSAL_MESSAGES[result.refusal];
}
