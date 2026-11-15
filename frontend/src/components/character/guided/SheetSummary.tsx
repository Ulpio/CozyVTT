// ============================================
// The live summary beside the wizard: what was picked and the numbers the
// rules give so far. Once there is a class it is the sheet buildSheet makes.
// ============================================

import { useEffect, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ABILITY_KEYS, abilityModifier, formatModifier } from '@/utils/rules/fifthEdition';
import { finalScores } from '@/utils/guidedCreation/abilities';
import { buildSheet, type CreationData } from '@/utils/guidedCreation/buildSheet';
import { abilityPicksOf, collectEffects } from '@/utils/guidedCreation/collectEffects';
import type { CreationChoices } from '@/utils/guidedCreation/types';
import { errorSummary } from '@/utils/errors';
import { Facts } from './parts';

interface SheetSummaryProps {
  data: CreationData;
  choices: CreationChoices;
}

export default function SheetSummary({ data, choices }: SheetSummaryProps) {
  const { t } = useTranslation();
  const titleId = useId();

  const { scores, sheet, failure } = useMemo(() => {
    const { effects } = collectEffects(choices, data);
    const scores = finalScores(choices.baseScores, effects, abilityPicksOf(choices));
    if (!data.classes.some((c) => c.slug === choices.classSlug)) return { scores, sheet: null, failure: null };
    try {
      return { scores, sheet: buildSheet(choices, data), failure: null };
    } catch (err) {
      return { scores, sheet: null, failure: err };
    }
  }, [choices, data]);

  // The summary recomputes on every pick: say once that the sheet cannot be built, not on each one.
  const logged = useRef(false);
  useEffect(() => {
    if (!failure || logged.current) return;
    logged.current = true;
    console.error('Guided creation summary:', errorSummary(failure));
  }, [failure]);

  const name = <T extends { slug: string; name: string }>(list: T[], slug: string | undefined) =>
    slug ? list.find((e) => e.slug === slug)?.name : undefined;
  const race = name(data.races, choices.raceSlug);
  const subrace = name(data.subraces, choices.subraceSlug);
  const cls = name(data.classes, choices.classSlug);
  const subclass = name(data.subclasses, choices.subclassSlug);

  return (
    <section aria-labelledby={titleId} className="space-y-4">
      <h3 id={titleId} className="text-lg font-semibold text-brand-ink font-heading">
        {t('guidedCreation.summary.title')}
      </h3>
      <Facts
        rows={[
          [t('guidedCreation.summary.race'), race && (subrace ? `${race} (${subrace})` : race)],
          [t('guidedCreation.summary.class'), cls && (subclass ? `${cls} (${subclass})` : cls)],
          [t('guidedCreation.summary.background'), name(data.backgrounds, choices.backgroundSlug)],
        ]}
      />

      <div>
        <h4 className="text-sm font-semibold text-stone-gray mb-1">{t('guidedCreation.summary.abilities')}</h4>
        <ul className="grid grid-cols-3 gap-2">
          {ABILITY_KEYS.map((k) => (
            <li key={k} className="rounded-cozy border border-ink/10 px-2 py-1 text-center">
              <span className="block text-xs text-stone-gray">{t(`guidedCreation.ability.${k}`)}</span>
              <span className="font-semibold text-ink">{scores[k]}</span>{' '}
              <span className="text-xs text-warm-gray">({formatModifier(abilityModifier(scores[k]))})</span>
            </li>
          ))}
        </ul>
      </div>

      {sheet && (
        <Facts
          rows={[
            [t('guidedCreation.summary.hp'), sheet.hp ? String(sheet.hp.maximum) : undefined],
            [t('guidedCreation.summary.ac'), sheet.armorClass !== undefined ? String(sheet.armorClass) : undefined],
            [t('guidedCreation.summary.speed'), sheet.speed ? t('guidedCreation.summary.speedFeet', { feet: sheet.speed }) : undefined],
            [t('guidedCreation.summary.initiative'), sheet.initiative !== undefined ? formatModifier(sheet.initiative) : undefined],
            [t('guidedCreation.summary.proficiency'), formatModifier(sheet.proficiencyBonus)],
          ]}
        />
      )}
    </section>
  );
}
