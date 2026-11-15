// ============================================
// Step 3: subclass. Every class has one by 3rd level; its features up to
// 3rd level come from the compendium entry.
// ============================================

import { useTranslation } from 'react-i18next';
import { ChoiceList, Details, NamedTexts } from './parts';
import { subclassesOf, type StepProps } from './stepRules';

const LEVEL = 3;

export default function SubclassStep({ data, choices, update }: StepProps) {
  const { t } = useTranslation();
  if (!choices.classSlug) return <p className="text-sm text-warm-gray">{t('guidedCreation.subclass.needClass')}</p>;
  const options = subclassesOf(data, choices.classSlug);
  if (!options.length) return <p className="text-sm text-warm-gray">{t('guidedCreation.subclass.none')}</p>;
  const subclass = options.find((s) => s.slug === choices.subclassSlug);
  const features = subclass?.data.features.filter((f) => f.level <= LEVEL) ?? [];

  return (
    <div className="space-y-4">
      <ChoiceList
        legend={t('guidedCreation.subclass.choose')}
        items={options.map((s) => ({ value: s.slug, label: s.name }))}
        selected={choices.subclassSlug}
        onSelect={(subclassSlug) => update({ subclassSlug })}
      />
      {subclass && (
        <Details>
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
