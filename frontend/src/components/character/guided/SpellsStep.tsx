// ============================================
// Step 9 (casters only): cantrips and spells at 3rd level. Counters follow
// spellcastingAt3: cantrips, then spells known, spells prepared, or the
// wizard's spellbook and the spells prepared from it. Subclass spells always
// prepared are shown locked; spells of levels the character cannot cast are
// never listed.
// ============================================

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Facts, PickGroup } from './parts';
import SpellPicker from './SpellPicker';
import { spellModel } from './stepModels';
import type { StepProps } from './stepRules';

export default function SpellsStep({ data, choices, update }: StepProps) {
  const { t } = useTranslation();
  const model = useMemo(() => spellModel(data, choices), [data, choices]);
  if (!model) return <p className="text-sm text-warm-gray">{t('guidedCreation.spells.noCasting')}</p>;
  const { casting } = model;

  const setSpells = (spellSlugs: string[]) =>
    update({
      spellSlugs,
      // A spell taken out of the spellbook is no longer prepared.
      ...(model.mode === 'spellbook' ? { preparedSlugs: model.prepared.filter((s) => spellSlugs.includes(s)) } : {}),
    });
  const schools = casting.schools?.join(', ');
  const slots = casting.slots
    .map((n, i) => (n ? t('guidedCreation.spells.slot', { n, level: i + 1 }) : null))
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-5">
      <Facts rows={[[t('guidedCreation.spells.slots'), slots || undefined]]} />

      {(model.cantripsNeeded > 0 || model.fixedCantrips.length > 0) && (
        <SpellPicker
          legend={t('guidedCreation.spells.cantrips')}
          spells={model.cantripPool}
          count={model.cantripsNeeded}
          picks={model.cantrips}
          onChange={(cantripSlugs) => update({ cantripSlugs })}
          locked={model.fixedCantrips}
        />
      )}

      <SpellPicker
        legend={t(`guidedCreation.spells.${model.mode}`)}
        spells={model.pool}
        count={model.needed}
        picks={model.spells}
        onChange={setSpells}
        locked={model.always}
        hint={
          schools
            ? t('guidedCreation.spells.schools', { schools, n: model.freeSchoolLeft })
            : model.always.length
              ? t('guidedCreation.spells.alwaysHint')
              : undefined
        }
        blocked={(s) => !!casting.schools && !casting.schools.includes(s.data.school) && model.freeSchoolLeft <= 0}
      />

      {model.mode === 'spellbook' && (
        <PickGroup
          legend={t('guidedCreation.spells.preparedFromBook')}
          count={model.preparedLimit}
          options={model.spells.map((slug) => ({ id: slug, label: data.spells.find((s) => s.slug === slug)?.name ?? slug }))}
          picks={model.prepared}
          onChange={(preparedSlugs) => update({ preparedSlugs })}
          hint={model.spells.length ? undefined : t('guidedCreation.spells.bookFirst')}
        />
      )}
    </div>
  );
}
