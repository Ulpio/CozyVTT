// ============================================
// The spell menu: cantrips first, then each circle with its free/total slots.
// A leveled spell asks the circle to cast it at: only circles from its own
// level up that have a free slot can be chosen. The slots are the caster's
// own sheet's; without them (a sheet not read yet, or one with no slots) a
// leveled spell cannot be cast from here, as the server would refuse it.
// ============================================

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionOption } from '@/types/actions';
import type { FifthEditionSpellSlots } from '@/types/game-systems';
import ActionButton from './ActionButton';
import ActionIcon from './ActionIcon';
import { actionIconFor } from '@/utils/actionIcons';

export type SlotsByCircle = Partial<FifthEditionSpellSlots> | undefined;

interface SpellMenuProps {
  spells: ActionOption[];
  slots: SlotsByCircle;
  /** Cast `option`, at `slotLevel` when it is a leveled spell. */
  onCast: (option: ActionOption, slotLevel?: number) => void;
  /** Why a spell cannot be cast now (the turn), if it cannot. */
  gate?: (option: ActionOption) => string | undefined;
}

const CIRCLES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const slotsOf = (slots: SlotsByCircle, level: number) => {
  const slot = slots?.[String(level) as keyof FifthEditionSpellSlots];
  return { total: slot?.total ?? 0, free: Math.max(0, (slot?.total ?? 0) - (slot?.expended ?? 0)) };
};

/** The circles a spell of `level` may be cast at, from its own up: those the caster has slots in. */
function castCircles(slots: SlotsByCircle, level: number): number[] {
  if (!slots) return [];
  return CIRCLES.filter((circle) => circle >= level && slotsOf(slots, circle).total > 0);
}

export default function SpellMenu({ spells, slots, onCast, gate }: SpellMenuProps) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState<ActionOption | null>(null);

  const cantrips = spells.filter((s) => !s.spellLevel);
  const circles = CIRCLES.filter((level) => slotsOf(slots, level).total > 0 || spells.some((s) => s.spellLevel === level));

  const spellButton = (spell: ActionOption) => {
    const level = spell.spellLevel ?? 0;
    const free = level === 0 || castCircles(slots, level).some((circle) => slotsOf(slots, circle).free > 0);
    const why = gate?.(spell);
    return (
      <ActionButton
        key={spell.id}
        disabled={!free || why !== undefined}
        title={why}
        pressed={asking?.id === spell.id}
        onClick={() => (level === 0 ? onCast(spell) : setAsking(spell))}
      >
        <span className="flex items-center gap-1.5"><ActionIcon icon={actionIconFor(spell)} /><span className="truncate">{spell.name}</span></span>
      </ActionButton>
    );
  };

  if (spells.length === 0) return <p className="text-sm text-ink-muted">{t('actionBar.noSpells')}</p>;

  return (
    <div className="space-y-2">
      {cantrips.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-warm-gray">{t('actionBar.cantrips')}</h3>
          <div className="flex flex-wrap gap-1.5">{cantrips.map(spellButton)}</div>
        </section>
      )}
      {circles.map((level) => {
        const { total, free } = slotsOf(slots, level);
        const here = spells.filter((s) => s.spellLevel === level);
        return (
          <section key={level}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-warm-gray">
              {total > 0 ? t('actionBar.circleSlots', { level, free, total }) : t('actionBar.circle', { level })}
            </h3>
            <div className="flex flex-wrap gap-1.5">{here.map(spellButton)}</div>
          </section>
        );
      })}
      {asking && (
        <div role="group" aria-label={t('actionBar.castAt', { name: asking.name })} className="flex flex-wrap items-center gap-1.5 border-t border-moss-green/20 pt-2">
          <span className="text-sm text-ink-muted">{t('actionBar.castAt', { name: asking.name })}</span>
          {castCircles(slots, asking.spellLevel ?? 1).map((circle) => {
            const { total, free } = slotsOf(slots, circle);
            return (
              <ActionButton key={circle} menu disabled={free === 0} onClick={() => { onCast(asking, circle); setAsking(null); }}>
                {total > 0 ? t('actionBar.circleOption', { level: circle, free, total }) : t('actionBar.circle', { level: circle })}
              </ActionButton>
            );
          })}
        </div>
      )}
    </div>
  );
}
