// ============================================
// Step 4: background. Its skills, tools, languages and feature come from the
// compendium entry; the picks it owes are made in the skills step.
// ============================================

import { useTranslation } from 'react-i18next';
import { SKILL_KEYS, type SkillKey } from '@/utils/guidedCreation/types';
import { ChoiceList, Details, Facts, NamedTexts } from './parts';
import type { StepProps } from './stepRules';

export default function BackgroundStep({ data, choices, update }: StepProps) {
  const { t } = useTranslation();
  const background = data.backgrounds.find((b) => b.slug === choices.backgroundSlug);
  const skillName = (s: string) =>
    (SKILL_KEYS as readonly string[]).includes(s) ? t(`guidedCreation.skill.${s as SkillKey}`) : s;
  const languages = (l: number | string[] | undefined) =>
    typeof l === 'number' ? (l > 0 ? t('guidedCreation.background.languagesOfChoice', { count: l }) : undefined) : l?.join(', ');

  return (
    <div className="space-y-4">
      <ChoiceList
        legend={t('guidedCreation.background.choose')}
        items={data.backgrounds.map((b) => ({ value: b.slug, label: b.name }))}
        selected={choices.backgroundSlug}
        onSelect={(backgroundSlug) => update({ backgroundSlug })}
      />
      {background && (
        <Details>
          <Facts
            rows={[
              [t('guidedCreation.background.skills'), background.data.proficiencies.skills.map(skillName).join(', ') || undefined],
              [t('guidedCreation.background.tools'), background.data.proficiencies.tools.join(', ') || undefined],
              [t('guidedCreation.background.languages'), languages(background.data.languages)],
            ]}
          />
          <NamedTexts title={t('guidedCreation.background.feature')} items={[background.data.feature]} />
        </Details>
      )}
    </div>
  );
}
