// ============================================
// Step 7: the choices of the race, class, subclass and feat up to 3rd level
// (fighting style, invocations, pact boon, metamagic, expertise, the variant
// human's feat and a half-feat's +1, cantrips...), each option with its text
// from the compendium feature, and the choices that appear under a picked
// option or the feat.
// ============================================

import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { abilityChoiceSlots, choiceStates, collectEffects } from '@/utils/guidedCreation/collectEffects';
import AbilityPicks from './AbilityPicks';
import ChoiceGroup from './ChoiceGroup';
import { inSkillsStep, knownLanguages, ownedTools } from './stepModels';
import type { StepProps } from './stepRules';

export default function ClassChoicesStep({ data, choices, update }: StepProps) {
  const { t } = useTranslation();
  const { effects, states, featSlots } = useMemo(
    () => ({
      effects: collectEffects(choices, data).effects,
      states: choiceStates(choices, data),
      featSlots: abilityChoiceSlots(choices, data).filter((s) => s.feat),
    }),
    [choices, data],
  );
  const shown = states.filter((s) => !inSkillsStep(s));
  const known = knownLanguages(data, choices, effects);
  const tools = ownedTools(data, choices, effects);

  return (
    <div className="space-y-5">
      {shown.length === 0 && <p className="text-sm text-warm-gray">{t('guidedCreation.choices.none')}</p>}
      {shown.map((state) => (
        <Fragment key={state.id}>
          <ChoiceGroup state={state} states={states} data={data} choices={choices} update={update} known={known} tools={tools} />
          {/* A half-feat's +1 is picked right under the feat. */}
          {state.kind === 'featChoice' && (
            <AbilityPicks
              legend={`${t('guidedCreation.choices.kind.abilityChoice')} · ${t('guidedCreation.choices.source.feat')}`}
              slots={featSlots}
              stored={choices.racialChoices.abilityPicks}
              onChange={(abilityPicks) => update({ racialChoices: { ...choices.racialChoices, abilityPicks } })}
              label={(amount, n) => t('guidedCreation.choices.abilityPick', { amount, n })}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}
