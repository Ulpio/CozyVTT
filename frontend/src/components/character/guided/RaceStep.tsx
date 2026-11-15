// ============================================
// Step 1: race and subrace. What each gives is the compendium entry's.
// ============================================

import { useTranslation } from 'react-i18next';
import { ABILITY_KEYS } from '@/utils/rules/fifthEdition';
import type { RaceData, SubraceData } from '@/utils/guidedCreation/compendiumData';
import { feet } from '@/utils/guidedCreation/buildSheet';
import { OPTIONAL_SUBRACE_RACES } from '@/utils/guidedCreation/raceRules';
import { ChoiceList, Details, Facts, NamedTexts } from './parts';
import { subracesOf, type StepProps } from './stepRules';

/** Picking "None" for an optional subrace. */
const NO_SUBRACE = '';

export default function RaceStep({ data, choices, update }: StepProps) {
  const { t } = useTranslation();
  const race = data.races.find((r) => r.slug === choices.raceSlug);
  const subraces = race ? subracesOf(data, race.slug) : [];
  const subrace = subraces.find((s) => s.slug === choices.subraceSlug);
  const optional = !!race && OPTIONAL_SUBRACE_RACES.includes(race.slug);

  const facts = (d: RaceData | SubraceData): Array<[string, string | undefined]> => {
    const increases = ABILITY_KEYS.filter((k) => d.abilityIncreases?.[k])
      .map((k) => `${t(`guidedCreation.ability.${k}`)} +${d.abilityIncreases?.[k]}`)
      .join(', ');
    return [
      [t('guidedCreation.race.increases'), increases || undefined],
      [t('guidedCreation.race.size'), d.size],
      [t('guidedCreation.race.speed'), d.speed ? t('guidedCreation.race.feet', { feet: feet(d.speed) }) : undefined],
      [t('guidedCreation.race.darkvision'), d.darkvision ? t('guidedCreation.race.feet', { feet: feet(d.darkvision) }) : undefined],
      [t('guidedCreation.race.languages'), d.languages?.join(', ')],
    ];
  };

  return (
    <div className="space-y-4">
      <ChoiceList
        legend={t('guidedCreation.race.choose')}
        items={data.races.map((r) => ({ value: r.slug, label: r.name }))}
        selected={choices.raceSlug}
        // The subrace belongs to the race: a new race starts without one.
        onSelect={(raceSlug) => raceSlug !== choices.raceSlug && update({ raceSlug, subraceSlug: undefined })}
      />

      {race && (
        <Details>
          <Facts rows={facts(race.data)} />
          <NamedTexts title={t('guidedCreation.race.traits')} items={race.data.traits} />
        </Details>
      )}

      {subraces.length > 0 && (
        <ChoiceList
          legend={t('guidedCreation.race.subrace')}
          items={[
            ...(optional ? [{ value: NO_SUBRACE, label: t('guidedCreation.race.noSubrace') }] : []),
            ...subraces.map((s) => ({ value: s.slug, label: s.name })),
          ]}
          selected={choices.subraceSlug ?? (optional ? NO_SUBRACE : undefined)}
          onSelect={(slug) => update({ subraceSlug: slug || undefined })}
        />
      )}

      {subrace && (
        <Details>
          <Facts rows={facts(subrace.data)} />
          <NamedTexts title={t('guidedCreation.race.traits')} items={subrace.data.traits} />
        </Details>
      )}
    </div>
  );
}
