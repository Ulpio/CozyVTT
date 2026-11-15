// ============================================
// Step 2: class. Hit die, saves, proficiencies and the features up to 3rd
// level come from the compendium entry.
// ============================================

import { useTranslation } from 'react-i18next';
import { SKILL_KEYS, type SkillKey } from '@/utils/guidedCreation/types';
import { ChoiceList, Details, Facts, NamedTexts } from './parts';
import type { StepProps } from './stepRules';

const LEVEL = 3;

export default function ClassStep({ data, choices, update }: StepProps) {
  const { t } = useTranslation();
  const cls = data.classes.find((c) => c.slug === choices.classSlug);
  const features = cls?.data.features.filter((f) => f.level <= LEVEL) ?? [];
  const skillName = (s: string) =>
    (SKILL_KEYS as readonly string[]).includes(s) ? t(`guidedCreation.skill.${s as SkillKey}`) : s;

  return (
    <div className="space-y-4">
      <ChoiceList
        legend={t('guidedCreation.class.choose')}
        items={data.classes.map((c) => ({ value: c.slug, label: c.name }))}
        selected={choices.classSlug}
        onSelect={(classSlug) => update({ classSlug })}
      />

      {cls && (
        <Details>
          <Facts
            rows={[
              [t('guidedCreation.class.hitDie'), `d${cls.data.hitDie}`],
              [t('guidedCreation.class.saves'), cls.data.savingThrows.map((k) => t(`guidedCreation.ability.${k}`)).join(', ')],
              [t('guidedCreation.class.armor'), cls.data.proficiencies.armor.join(', ') || undefined],
              [t('guidedCreation.class.weapons'), cls.data.proficiencies.weapons.join(', ') || undefined],
              [t('guidedCreation.class.tools'), cls.data.proficiencies.tools.join(', ') || undefined],
              [
                t('guidedCreation.class.skills'),
                t('guidedCreation.class.skillsChoose', {
                  count: cls.data.skills.choose,
                  list: cls.data.skills.from.map(skillName).join(', '),
                }),
              ],
            ]}
          />
          <NamedTexts
            title={t('guidedCreation.class.features')}
            items={features}
            note={(_, i) => t('guidedCreation.class.level', { level: features[i].level })}
          />
        </Details>
      )}
    </div>
  );
}
