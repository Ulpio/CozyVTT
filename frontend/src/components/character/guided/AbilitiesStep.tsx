// ============================================
// Step 5: ability scores. The methods are the campaign's; once a roll exists
// it is the only method (ledger ruling), even when the campaign has since
// dropped Roll. Racial increases are shown apart from the base scores; the
// half-elf and the variant human pick their +1s here.
// ============================================

import { useEffect, useMemo } from 'react';
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
import { abilityChoiceSlots, abilityPicksOf, collectEffects } from '@/utils/guidedCreation/collectEffects';
import type { AbilityKey } from '@/utils/guidedCreation/types';
import { cn } from '@/utils/cn';
import AbilityPicks from './AbilityPicks';
import { ChoiceList } from './parts';
import { availableMethods, defaultScores, rollTotals, type StepProps } from './stepRules';

const POINT_BUY_VALUES = Array.from({ length: POINT_BUY_MAX - POINT_BUY_MIN + 1 }, (_, i) => POINT_BUY_MIN + i);

export default function AbilitiesStep({ data, choices, update, campaign, roll }: StepProps) {
  const { t } = useTranslation();
  const methods = availableMethods(campaign, roll.roll);
  const totals = rollTotals(roll.roll);
  const { method, baseScores } = choices;

  const choose = (next: AbilityScoreMethod) =>
    update({
      method: next,
      baseScores: defaultScores(next, totals),
      abilityRollId: next === 'ROLL' ? roll.roll?.id : undefined,
    });

  // The chosen method must be one offered: the first the campaign offers at the
  // start, and Roll alone once a roll exists. Waits for the roll lookup, which
  // decides between the two.
  useEffect(() => {
    if (roll.known && methods.length && !methods.includes(method)) choose(methods[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the offered methods or the chosen one change, not on every new list
  }, [roll.known, methods.join(), method]);

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

  if (!roll.known) {
    if (roll.lookupFailed) {
      return (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-danger-ink">{t('guidedCreation.abilities.lookupFailed')}</p>
          <Button type="button" variant="secondary" onClick={roll.retry}>
            {t('common.tryAgain')}
          </Button>
        </div>
      );
    }
    return <p className="text-sm text-warm-gray">{t('guidedCreation.abilities.rollLoading')}</p>;
  }

  const pool = method === 'STANDARD_ARRAY' ? [...STANDARD_ARRAY] : method === 'ROLL' ? (totals ?? []) : POINT_BUY_VALUES;
  const options = [...new Set(pool)].sort((a, b) => b - a);
  const showTable = method !== 'ROLL' || !!roll.roll;
  const pointsLeft = POINT_BUY_BUDGET - pointBuySpent(baseScores);

  return (
    <div className="space-y-4">
      <ChoiceList
        legend={t('guidedCreation.abilities.methods')}
        items={methods.map((m) => ({ value: m, label: t(`guidedCreation.abilities.method.${m}`) }))}
        selected={method}
        onSelect={(m) => m !== method && choose(m as AbilityScoreMethod)}
      />

      <div className="space-y-4">
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
                    <td className="py-1 pr-2 text-brand-ink">{bonus > 0 ? `+${bonus}` : t('guidedCreation.none')}</td>
                    <td className="py-1 pr-2 font-semibold text-ink">{scores[k]}</td>
                    <td className="py-1 text-ink">{formatModifier(abilityModifier(scores[k]))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <AbilityPicks
        legend={t('guidedCreation.abilities.racialPicks')}
        slots={abilityChoiceSlots(choices, data).filter((s) => !s.feat)}
        stored={choices.racialChoices.abilityPicks}
        onChange={(abilityPicks) => update({ racialChoices: { ...choices.racialChoices, abilityPicks } })}
        label={(amount, n) => t('guidedCreation.abilities.racialPick', { amount, n })}
      />
    </div>
  );
}

interface RollPanelProps {
  totals: number[] | undefined;
  title: (i: number) => string | undefined;
  rolling: boolean;
  failed: boolean;
  onRoll: () => void;
}

/** The saved roll, or the one button that makes it. There is no rolling again. */
function RollPanel({ totals, title, rolling, failed, onRoll }: RollPanelProps) {
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

