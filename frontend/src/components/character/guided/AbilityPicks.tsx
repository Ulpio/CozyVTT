// ============================================
// The +1s an abilityChoice gives, one select each: the race's in the
// abilities step, a half-feat's beside the feat. Every select writes its own
// place in `racialChoices.abilityPicks`, in effect order.
// ============================================

import { ABILITY_KEYS } from '@/utils/rules/fifthEdition';
import type { AbilityChoiceSlot } from '@/utils/guidedCreation/collectEffects';
import { useTranslation } from 'react-i18next';

interface AbilityPicksProps {
  legend: string;
  /** The choices shown here (all of them hold places in the stored list). */
  slots: AbilityChoiceSlot[];
  stored: unknown;
  onChange: (picks: string[]) => void;
  /** The select's name: amount and its 1-based place among these selects. */
  label: (amount: number, n: number) => string;
}

export default function AbilityPicks({ legend, slots, stored, onChange, label }: AbilityPicksProps) {
  const { t } = useTranslation();
  if (!slots.length) return null;
  const raw = Array.isArray(stored) ? stored.map((p) => (typeof p === 'string' ? p : '')) : [];
  const size = Math.max(raw.length, ...slots.map((s) => s.start + s.effect.count));
  const picks = Array.from({ length: size }, (_, i) => raw[i] ?? '');

  let n = 0;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-stone-gray">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {slots.flatMap(({ effect, start }) => {
          const mine = picks.slice(start, start + effect.count);
          return mine.map((value, j) => {
            const index = start + j;
            n += 1;
            // An ability takes one +1 from a choice, and never one it excludes.
            const allowed = ABILITY_KEYS.filter((k) => !effect.exclude?.includes(k) && (k === value || !mine.includes(k)));
            return (
              <select
                key={index}
                aria-label={label(effect.amount, n)}
                value={value}
                onChange={(e) => onChange(picks.map((p, i) => (i === index ? e.target.value : p)))}
                className="input-cozy py-1"
              >
                <option value="">{t('guidedCreation.abilities.choosePick')}</option>
                {allowed.map((k) => (
                  <option key={k} value={k}>
                    {t(`guidedCreation.ability.${k}`)}
                  </option>
                ))}
              </select>
            );
          });
        })}
      </div>
    </fieldset>
  );
}
