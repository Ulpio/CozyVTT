// ============================================
// Step 5: ability scores. The methods are the campaign's (a saved roll is
// offered even when the campaign has since dropped Roll); racial increases
// are shown apart from the base scores; the half-elf and the variant human
// pick their +1s here.
// ============================================

import { useEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { AbilityScoreMethod } from '@/types';
import { ABILITY_KEYS, abilityModifier, formatModifier } from '@/utils/rules/fifthEdition';
import {
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  pointBuySpent,
  STANDARD_ARRAY,
  finalScores,
} from '@/utils/guidedCreation/abilities';
import { abilityPicksOf, collectEffects } from '@/utils/guidedCreation/collectEffects';
import type { AbilityKey, Effect } from '@/utils/guidedCreation/types';
import { cn } from '@/utils/cn';
import { availableMethods, defaultScores, rollTotals, type StepProps } from './stepRules';

const POINT_BUY_VALUES = Array.from({ length: POINT_BUY_MAX - POINT_BUY_MIN + 1 }, (_, i) => POINT_BUY_MIN + i);

export default function AbilitiesStep({ data, choices, update, campaign, roll }: StepProps) {
  const { t } = useTranslation();
  const panelId = useId();
  const methods = availableMethods(campaign, roll.roll);
  const totals = rollTotals(roll.roll);
  const { method, baseScores } = choices;

  const choose = (next: AbilityScoreMethod) =>
    update({
      method: next,
      baseScores: defaultScores(next, totals),
      abilityRollId: next === 'ROLL' ? roll.roll?.id : undefined,
    });

  // A method the campaign does not offer (the default before the campaign was read) gives way to the first it does.
  useEffect(() => {
    if (methods.length && !methods.includes(method)) choose(methods[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the offered methods or the chosen one change, not on every new list
  }, [methods.join(), method]);

  const effects = useMemo(() => collectEffects(choices, data).effects, [choices, data]);
  const picks = abilityPicksOf(choices);
  const scores = finalScores(baseScores, effects, picks);

  const doRoll = async () => {
    const made = await roll.rollOnce();
    if (made) update({ method: 'ROLL', baseScores: defaultScores('ROLL', rollTotals(made)), abilityRollId: made.id });
  };

  /** Array and roll: giving an ability a value takes it from the ability that had it. */
  const assign = (ability: AbilityKey, value: number) => {
    if (baseScores[ability] === value) return;
    const next = { ...baseScores };
    const other = ABILITY_KEYS.find((k) => k !== ability && next[k] === value);
    if (other) next[other] = next[ability];
    next[ability] = value;
    update({ baseScores: next });
  };

  const pool = method === 'STANDARD_ARRAY' ? [...STANDARD_ARRAY] : method === 'ROLL' ? (totals ?? []) : POINT_BUY_VALUES;
  const options = [...new Set(pool)].sort((a, b) => b - a);
  const showTable = method !== 'ROLL' || !!roll.roll;
  const pointsLeft = POINT_BUY_BUDGET - pointBuySpent(baseScores);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t('guidedCreation.abilities.methods')} className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            aria-controls={panelId}
            onClick={() => method !== m && choose(m)}
            className={cn(
              'rounded-cozy border px-3 py-2 text-sm touch-target',
              method === m ? 'border-moss-green bg-moss-green/10 text-ink font-semibold' : 'border-ink/15 text-stone-gray hover:bg-ink/5',
            )}
          >
            {t(`guidedCreation.abilities.method.${m}`)}
          </button>
        ))}
      </div>

      <div id={panelId} role="tabpanel" className="space-y-4">
        {method === 'POINT_BUY' && (
          <p className={cn('text-sm font-semibold', pointsLeft < 0 ? 'text-danger-ink' : 'text-ink')}>
            {t('guidedCreation.abilities.pointsLeft', { count: pointsLeft })}
            {pointsLeft < 0 && <span className="block font-normal">{t('guidedCreation.abilities.overBudget')}</span>}
          </p>
        )}
        {method === 'STANDARD_ARRAY' && <p className="text-sm text-warm-gray">{t('guidedCreation.abilities.arrayHint')}</p>}
        {method === 'ROLL' && (
          <RollPanel
            totals={totals}
            title={(i) => roll.roll?.rolls[i].dice.join(', ')}
            loading={roll.loading}
            rolling={roll.rolling}
            failed={roll.failed}
            onRoll={doRoll}
          />
        )}

        {showTable && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-gray">
                <th scope="col" className="py-1 pr-2 font-semibold">{t('guidedCreation.abilities.ability')}</th>
                <th scope="col" className="py-1 pr-2 font-semibold">{t('guidedCreation.abilities.base')}</th>
                <th scope="col" className="py-1 pr-2 font-semibold">{t('guidedCreation.abilities.racial')}</th>
                <th scope="col" className="py-1 pr-2 font-semibold">{t('guidedCreation.abilities.total')}</th>
                <th scope="col" className="py-1 font-semibold">{t('guidedCreation.abilities.modifier')}</th>
              </tr>
            </thead>
            <tbody>
              {ABILITY_KEYS.map((k) => {
                const bonus = scores[k] - baseScores[k];
                return (
                  <tr key={k} className="border-t border-ink/10">
                    <th scope="row" className="py-1 pr-2 text-left font-normal text-ink">{t(`guidedCreation.ability.${k}`)}</th>
                    <td className="py-1 pr-2">
                      <select
                        aria-label={`${t(`guidedCreation.ability.${k}`)} ${t('guidedCreation.abilities.base')}`}
                        value={baseScores[k]}
                        onChange={(e) =>
                          method === 'POINT_BUY'
                            ? update({ baseScores: { ...baseScores, [k]: Number(e.target.value) } })
                            : assign(k, Number(e.target.value))
                        }
                        className="input-cozy py-1"
                      >
                        {options.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2 text-moss-green">{bonus > 0 ? `+${bonus}` : t('guidedCreation.none')}</td>
                    <td className="py-1 pr-2 font-semibold text-ink">{scores[k]}</td>
                    <td className="py-1 text-ink">{formatModifier(abilityModifier(scores[k]))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <RacialPicks effects={effects} stored={choices.racialChoices.abilityPicks} onChange={(abilityPicks) => update({ racialChoices: { ...choices.racialChoices, abilityPicks } })} />
    </div>
  );
}

interface RollPanelProps {
  totals: number[] | undefined;
  title: (i: number) => string | undefined;
  loading: boolean;
  rolling: boolean;
  failed: boolean;
  onRoll: () => void;
}

/** The saved roll, or the one button that makes it. There is no rolling again. */
function RollPanel({ totals, title, loading, rolling, failed, onRoll }: RollPanelProps) {
  const { t } = useTranslation();
  if (totals) {
    return (
      <div className="space-y-2">
        <ul aria-label={t('guidedCreation.abilities.rolled')} className="flex flex-wrap gap-2">
          {totals.map((total, i) => (
            <li key={i} title={title(i)} className="rounded-cozy border border-ink/15 px-3 py-1 font-semibold text-ink">
              {total}
            </li>
          ))}
        </ul>
        <p className="text-sm text-warm-gray">{t('guidedCreation.abilities.rolledHint')}</p>
      </div>
    );
  }
  if (loading) return <p className="text-sm text-warm-gray">{t('guidedCreation.abilities.rollLoading')}</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-warm-gray">{t('guidedCreation.abilities.rollHint')}</p>
      <Button type="button" icon={Dices} loading={rolling} onClick={onRoll}>
        {t('guidedCreation.abilities.roll')}
      </Button>
      {failed && <p role="alert" className="text-sm text-danger-ink">{t('guidedCreation.abilities.rollFailed')}</p>}
    </div>
  );
}

interface RacialPicksProps {
  effects: Effect[];
  stored: unknown;
  onChange: (picks: string[]) => void;
}

/** One select per +1 an abilityChoice effect gives, in effect order. */
function RacialPicks({ effects, stored, onChange }: RacialPicksProps) {
  const { t } = useTranslation();
  const choicesOf = effects.filter((e): e is Extract<Effect, { type: 'abilityChoice' }> => e.type === 'abilityChoice');
  if (!choicesOf.length) return null;
  const raw = Array.isArray(stored) ? stored.map((p) => (typeof p === 'string' ? p : '')) : [];
  const size = choicesOf.reduce((n, e) => n + e.count, 0);
  const picks = Array.from({ length: size }, (_, i) => raw[i] ?? '');

  let offset = 0;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-stone-gray">{t('guidedCreation.abilities.racialPicks')}</legend>
      <div className="flex flex-wrap gap-2">
        {choicesOf.flatMap((effect) => {
          const start = offset;
          offset += effect.count;
          const mine = picks.slice(start, start + effect.count);
          return mine.map((value, j) => {
            const index = start + j;
            // An ability takes one +1 from a choice, and never one it excludes.
            const allowed = ABILITY_KEYS.filter((k) => !effect.exclude?.includes(k) && (k === value || !mine.includes(k)));
            return (
              <select
                key={index}
                aria-label={t('guidedCreation.abilities.racialPick', { amount: effect.amount, n: index + 1 })}
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
