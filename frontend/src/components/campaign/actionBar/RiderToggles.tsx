// ============================================
// The features a weapon attack can add to its hit (Sneak Attack, Divine
// Smite), ticked while the target is picked. One that spends a spell slot
// asks which, among the circles the caster still has a free slot in. What is
// ticked goes in the pending action (actionStore.setRider) and from there in
// the request; the server rolls it, and only on a hit.
// ============================================

import { useTranslation } from 'react-i18next';
import { useActionStore } from '@/stores/actionStore';
import type { ActionCombatTurn, ActionFeatureRider } from '@/types/actions';
import type { FifthEditionSpellSlots } from '@/types/game-systems';
import { riderGate } from './turnGate';

const CIRCLES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** The circles with a slot left to spend. */
export function freeCircles(slots: Partial<FifthEditionSpellSlots> | undefined): number[] {
  return CIRCLES.filter((level) => {
    const slot = slots?.[String(level) as keyof FifthEditionSpellSlots];
    return slot !== undefined && slot.total - slot.expended > 0;
  });
}

interface RiderTogglesProps {
  riders: ActionFeatureRider[];
  slots: Partial<FifthEditionSpellSlots> | undefined;
  combat?: ActionCombatTurn;
}

export default function RiderToggles({ riders, slots, combat }: RiderTogglesProps) {
  const { t } = useTranslation();
  const pendingRiders = useActionStore((s) => s.pending?.riders);
  const chosen = pendingRiders ?? [];
  const circles = freeCircles(slots);

  return (
    <div role="group" aria-label={t('actionBar.riders.label')} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {riders.map((rider) => {
        const pick = chosen.find((r) => r.featureId === rider.featureId);
        const noSlot = rider.slot === true && circles.length === 0;
        const why = riderGate(rider, combat, t) ?? (noSlot ? t('actionBar.riders.noSlot') : undefined);
        return (
          <span key={rider.featureId} className="inline-flex items-center gap-1.5">
            <label className={`inline-flex items-center gap-1.5 ${why ? 'cursor-not-allowed opacity-50' : ''}`} title={why}>
              <input
                type="checkbox"
                checked={pick !== undefined}
                disabled={why !== undefined}
                onChange={(e) => useActionStore.getState().setRider(
                  rider.slot ? { featureId: rider.featureId, slotLevel: circles[0] } : { featureId: rider.featureId },
                  e.target.checked,
                )}
              />
              {t('actionBar.riders.with', { name: rider.name })}
            </label>
            {rider.slot && pick && (
              <select
                aria-label={t('actionBar.riders.slotFor', { name: rider.name })}
                value={pick.slotLevel}
                onChange={(e) => useActionStore.getState().setRider({ featureId: rider.featureId, slotLevel: Number(e.target.value) }, true)}
                className="min-h-8 rounded-cozy border border-moss-green/30 bg-paper/60 px-1 text-sm"
              >
                {circles.map((level) => <option key={level} value={level}>{t('actionBar.circle', { level })}</option>)}
              </select>
            )}
          </span>
        );
      })}
    </div>
  );
}
