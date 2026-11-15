// ============================================
// Step 6: skills, languages and tools. The skills the race and background
// give are fixed; the class's are picked from its list, and one the character
// already has is not offered (the class still owes the same number, so another
// takes its place). Then the languages and tools owed by the race, background,
// class and subclass.
// ============================================

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { choiceStates, collectEffects } from '@/utils/guidedCreation/collectEffects';
import { SKILL_KEYS, type SkillKey } from '@/utils/guidedCreation/types';
import ChoiceGroup from './ChoiceGroup';
import { Facts } from './parts';
import { inSkillsStep, knownLanguages, ownedTools } from './stepModels';
import type { StepProps } from './stepRules';

export default function SkillsStep({ data, choices, update }: StepProps) {
  const { t } = useTranslation();
  const { effects, states } = useMemo(
    () => ({ effects: collectEffects(choices, data).effects, states: choiceStates(choices, data) }),
    [choices, data],
  );
  const shown = states.filter(inSkillsStep);
  const known = knownLanguages(data, choices, effects);
  const tools = ownedTools(data, choices, effects);
  const skillName = (s: string) => t(`guidedCreation.skill.${s as SkillKey}`);

  const fixed = [...new Set(effects.flatMap((e) => (e.type === 'skill' ? [e.skill] : [])))];
  // Skills of the class list the character already has: not offered again.
  const cls = data.classes.find((c) => c.slug === choices.classSlug);
  const repeated = (cls?.data.skills.from ?? []).filter(
    (s): s is SkillKey => (SKILL_KEYS as readonly string[]).includes(s) && fixed.includes(s as SkillKey),
  );

  return (
    <div className="space-y-5">
      <Facts rows={[[t('guidedCreation.choices.fixedSkills'), fixed.map(skillName).join(', ') || undefined]]} />
      {repeated.length > 0 && (
        <p className="text-sm text-warm-gray">
          {t('guidedCreation.choices.repeated', { list: repeated.map(skillName).join(', ') })}
        </p>
      )}
      {shown.length === 0 && <p className="text-sm text-warm-gray">{t('guidedCreation.choices.none')}</p>}
      {shown.map((state) => (
        <ChoiceGroup key={state.id} state={state} states={states} data={data} choices={choices} update={update} known={known} tools={tools} />
      ))}
    </div>
  );
}
