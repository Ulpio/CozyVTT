// ============================================
// Step 7: the choices of the race, class, subclass and feat up to 3rd level
// (fighting style, invocations, pact boon, metamagic, expertise, the variant
// human's feat, cantrips...), each option with its text from the compendium
// feature, and the choices that appear under a picked option or the feat.
// ============================================

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { choiceStates, collectEffects } from '@/utils/guidedCreation/collectEffects';
import ChoiceGroup from './ChoiceGroup';
import { inSkillsStep, knownLanguages } from './stepModels';
import type { StepProps } from './stepRules';

export default function ClassChoicesStep({ data, choices, update }: StepProps) {
  const { t } = useTranslation();
  const { effects, states } = useMemo(
    () => ({ effects: collectEffects(choices, data).effects, states: choiceStates(choices, data) }),
    [choices, data],
  );
  const shown = states.filter((s) => !inSkillsStep(s));
  const known = knownLanguages(data, choices, effects);

  return (
    <div className="space-y-5">
      {shown.length === 0 && <p className="text-sm text-warm-gray">{t('guidedCreation.choices.none')}</p>}
      {shown.map((state) => (
        <ChoiceGroup key={state.id} state={state} states={states} data={data} choices={choices} update={update} known={known} />
      ))}
    </div>
  );
}
