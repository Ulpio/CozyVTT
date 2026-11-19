// ============================================
// Step 8: starting equipment. One radio group per "(a) ... or (b) ..."
// choice of the class and the background, listing only the options the
// character can use (no armor or weapon it is not proficient with); an "any
// martial weapon" line opens a select of the matching compendium items. In a
// Faithful campaign (and outside a campaign) the list shows each item's weight
// in kg, as the books give it, and the total against the carrying capacity.
// ============================================

import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Messages } from '@/i18n/locales/en';
import { carryingCapacity } from '@/utils/rules/fifthEdition';
import { finalScores } from '@/utils/guidedCreation/abilities';
import { abilityPicksOf, collectEffects } from '@/utils/guidedCreation/collectEffects';
import type { EquipmentBundleData, EquipmentItemData } from '@/utils/guidedCreation/compendiumData';
import { anyOfKey, anyOfOptions, equipmentChoicesOf, resolveEquipment } from '@/utils/guidedCreation/equipmentRules';
import { cn } from '@/utils/cn';
import ItemIcon from '@/components/character-sheets/fifth-edition/components/ItemIcon';
import { equipmentModel } from './stepModels';
import type { StepProps } from './stepRules';

type AnyOf = keyof Messages['guidedCreation']['equipment']['anyOf'];

/** An equipment choice not picked yet (`equipmentPicks` has no holes). */
const NO_PICK = -1;

const letter = (i: number) => String.fromCharCode(97 + i);

export default function EquipmentStep({ data, choices, update, campaign }: StepProps) {
  const { t, i18n } = useTranslation();
  const groupName = useId();
  const model = useMemo(() => equipmentModel(data, choices), [data, choices]);
  const cls = data.classes.find((c) => c.slug === choices.classSlug);
  if (!model || !cls) return <p className="text-sm text-warm-gray">{t('guidedCreation.subclass.needClass')}</p>;

  const background = data.backgrounds.find((b) => b.slug === choices.backgroundSlug);
  const classChoices = equipmentChoicesOf(cls.data, undefined).length;
  // Weight and carrying capacity are a Faithful campaign's (and shown outside a campaign).
  const showWeight = !campaign || campaign.detailLevel === 'FAITHFUL';
  const number = (n: number) => n.toLocaleString(i18n.language, { maximumFractionDigits: 2 });

  const itemName = (item: EquipmentItemData) => {
    if (item.anyOf) return t(`guidedCreation.equipment.anyOf.${item.anyOf as AnyOf}`);
    if (!item.ref) return '';
    const list = { weapon: data.weapons, armor: data.armor, gear: data.gear, tool: data.tools, pack: data.packs }[item.ref.type];
    const name = (list as Array<{ slug: string; name: string }>).find((e) => e.slug === item.ref!.slug)?.name ?? item.ref.slug;
    return item.quantity > 1 ? `${item.quantity} × ${name}` : name;
  };
  const bundleLabel = (bundle: EquipmentBundleData) =>
    [...bundle.items.map(itemName), ...(bundle.gp ? [t('guidedCreation.equipment.gp', { gp: bundle.gp })] : [])].join(', ');

  const pick = (c: number, index: number) =>
    update({
      equipmentPicks: Array.from({ length: model.choices.length }, (_, i) => (i === c ? index : (choices.equipmentPicks[i] ?? NO_PICK))),
    });

  const { effects } = collectEffects(choices, data);
  const strength = finalScores(choices.baseScores, effects, abilityPicksOf(choices)).str;
  const equipment = resolveEquipment(cls.data, background?.data, choices.equipmentPicks, choices.anyOfPicks, data, model.proficiencies);
  const totalKg = equipment.inventory.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0);
  // Packs and some items have no weight in the books: say so rather than count them as nothing.
  const unweighed = equipment.inventory.filter((item) => item.weight === undefined).map((item) => item.name);
  // The rules give pounds (STR × 15); the books' data is in kg, 0,5 kg to the pound.
  const capacityKg = carryingCapacity(strength).carry / 2;

  return (
    <div className="space-y-5">
      {model.choices.map((choice, c) => {
        const source = t(c < classChoices ? 'guidedCreation.choices.source.class' : 'guidedCreation.choices.source.background');
        const offered = model.offered[c];
        const selected = model.selected[c];
        const bundle = selected !== undefined ? choice.options[selected] : undefined;
        return (
          <section key={c} className="space-y-2">
            {offered.length > 1 ? (
              <fieldset>
                <legend className="text-sm font-semibold text-stone-gray mb-2">
                  {t('guidedCreation.equipment.choice', { source })}
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {offered.map((index) => (
                    <label
                      key={index}
                      className={cn(
                        'flex items-center gap-2 rounded-cozy border px-3 py-2 text-sm text-ink cursor-pointer touch-target',
                        selected === index ? 'border-moss-green bg-moss-green/10' : 'border-ink/15 hover:bg-ink/5',
                      )}
                    >
                      <input
                        type="radio"
                        name={`${groupName}-${c}`}
                        checked={selected === index}
                        onChange={() => pick(c, index)}
                        className="h-4 w-4 accent-moss-green"
                      />
                      ({letter(index)}) {bundleLabel(choice.options[index])}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="text-sm text-ink">
                <span className="font-semibold text-stone-gray">{t('guidedCreation.equipment.fixed', { source })}</span>{' '}
                {bundle && bundleLabel(bundle)}
              </p>
            )}
            {bundle?.items.map((item, i) =>
              item.anyOf
                ? Array.from({ length: item.quantity }, (_, unit) => {
                    const key = anyOfKey(c, i, unit);
                    const options = anyOfOptions(item.anyOf!, data, model.proficiencies);
                    const value = options.some((o) => o.slug === choices.anyOfPicks[key]) ? choices.anyOfPicks[key] : '';
                    const label = t(`guidedCreation.equipment.anyOf.${item.anyOf as AnyOf}`);
                    return (
                      <select
                        key={key}
                        aria-label={item.quantity > 1 ? `${label} ${unit + 1}` : label}
                        value={value}
                        onChange={(e) => update({ anyOfPicks: { ...choices.anyOfPicks, [key]: e.target.value } })}
                        className="block w-full sm:w-72 rounded-cozy border border-ink/20 bg-surface px-2 py-1.5 text-sm text-ink"
                      >
                        <option value="">{t('guidedCreation.equipment.pickItem', { what: label })}</option>
                        {options.map((o) => (
                          <option key={o.slug} value={o.slug}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    );
                  })
                : null,
            )}
          </section>
        );
      })}

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-stone-gray">{t('guidedCreation.equipment.inventory')}</h4>
        {equipment.inventory.length === 0 ? (
          <p className="text-sm text-warm-gray">{t('guidedCreation.equipment.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-gray">
                <th scope="col" className="font-semibold py-1">{t('guidedCreation.equipment.item')}</th>
                <th scope="col" className="font-semibold py-1 text-right">{t('guidedCreation.equipment.quantity')}</th>
                {showWeight && (
                  <th scope="col" className="font-semibold py-1 text-right">{t('guidedCreation.equipment.weight')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {equipment.inventory.map((item) => (
                <tr key={`${item.type}-${item.slug ?? item.name}`} className="border-t border-ink/10 text-ink">
                  <td className="py-1">
                    <span className="flex items-center gap-2">
                      <ItemIcon
                        item={{ name: item.name, compendiumRef: item.slug ? { bookId: '', slug: item.slug } : undefined }}
                        entryType={item.type}
                        size={28}
                      />
                      {item.name}
                    </span>
                  </td>
                  <td className="py-1 text-right">{item.quantity}</td>
                  {showWeight && (
                    <td className="py-1 text-right">{item.weight !== undefined ? number(item.weight * item.quantity) : '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {equipment.gp > 0 && <p className="text-sm text-ink">{t('guidedCreation.equipment.gp', { gp: equipment.gp })}</p>}
        {showWeight && (
          <p className={cn('text-sm', totalKg > capacityKg ? 'text-danger-ink' : 'text-ink')}>
            {t('guidedCreation.equipment.load', { total: number(totalKg), capacity: number(capacityKg) })}
          </p>
        )}
        {showWeight && unweighed.length > 0 && (
          <p className="text-xs text-warm-gray">{t('guidedCreation.equipment.unweighed', { list: unweighed.join(', ') })}</p>
        )}
      </section>
    </div>
  );
}
