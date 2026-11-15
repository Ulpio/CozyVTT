// ============================================
// Small pieces the guided creation steps share: a radio list of entries,
// a group of limited picks, a list of named texts (traits, features) and a
// term/value row.
// ============================================

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import type { Named } from '@/utils/guidedCreation/compendiumData';

interface ChoiceListProps {
  legend: string;
  items: { value: string; label: string }[];
  selected: string | undefined;
  onSelect: (value: string) => void;
}

/** One radio per entry, laid out as cards: one column on a phone, more when there is room. */
export function ChoiceList({ legend, items, selected, onSelect }: ChoiceListProps) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-stone-gray mb-2">{legend}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {items.map((item) => (
          <label
            key={item.value}
            className={cn(
              'flex items-center gap-2 rounded-cozy border px-3 py-2 text-sm text-ink cursor-pointer touch-target',
              selected === item.value ? 'border-moss-green bg-moss-green/10' : 'border-ink/15 hover:bg-ink/5',
            )}
          >
            <input
              type="radio"
              name={name}
              value={item.value}
              checked={selected === item.value}
              onChange={() => onSelect(item.value)}
              className="h-4 w-4 accent-moss-green"
            />
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Named texts from the compendium (traits, features), as the book gives them. */
export function NamedTexts({ title, items, note }: { title: string; items: Named[]; note?: (item: Named, i: number) => string | undefined }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-stone-gray">{title}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={`${item.name}-${i}`} className="text-sm text-ink">
            <span className="font-semibold">{item.name}</span>
            {note?.(item, i) && <span className="text-xs text-warm-gray"> · {note(item, i)}</span>}
            <p className="whitespace-pre-line text-ink/90">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A definition list of facts; rows with no value are left out. */
export function Facts({ rows }: { rows: Array<[string, string | undefined]> }) {
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {shown.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="font-semibold text-stone-gray">{term}</dt>
          <dd className="text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The details panel under a picked entry. */
export function Details({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 space-y-4 rounded-cozy border border-ink/10 bg-surface/50 p-3 sm:p-4">{children}</div>;
}

export interface PickOption {
  id: string;
  label: string;
  /** Shown under the label (compendium text), not part of its name. */
  description?: string;
}

interface PickGroupProps {
  legend: string;
  /** How many picks the group takes: one is a radio list, more are checkboxes. */
  count: number;
  options: PickOption[];
  picks: string[];
  onChange: (picks: string[]) => void;
  /** Shown under the legend. */
  hint?: string;
}

/**
 * Up to `count` picks among the options, with a "picked/count" counter. Once
 * the group is full the unpicked options are disabled, so it never holds more.
 */
export function PickGroup({ legend, count, options, picks, onChange, hint }: PickGroupProps) {
  const { t } = useTranslation();
  const name = useId();
  const single = count === 1;
  const full = picks.length >= count;
  const toggle = (id: string) => {
    if (single) onChange([id]);
    else onChange(picks.includes(id) ? picks.filter((p) => p !== id) : [...picks, id]);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-stone-gray">
        {legend}{' '}
        <span className={cn('ml-1 font-normal', full ? 'text-brand-ink' : 'text-warm-gray')}>
          {t('guidedCreation.choices.picked', { n: picks.length, total: count })}
        </span>
      </legend>
      {hint && <p className="text-xs text-warm-gray">{hint}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {options.map((option) => {
          const checked = picks.includes(option.id);
          const disabled = !checked && !single && full;
          const descriptionId = `${name}-${option.id}`;
          return (
            <div
              key={option.id}
              className={cn(
                'rounded-cozy border px-3 py-2 text-sm text-ink',
                checked ? 'border-moss-green bg-moss-green/10' : 'border-ink/15',
                disabled && 'opacity-60',
              )}
            >
              <label className={cn('flex items-center gap-2 touch-target', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
                <input
                  type={single ? 'radio' : 'checkbox'}
                  name={name}
                  value={option.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(option.id)}
                  aria-describedby={option.description ? descriptionId : undefined}
                  className="h-4 w-4 accent-moss-green"
                />
                {option.label}
              </label>
              {option.description && (
                <p id={descriptionId} className="mt-1 whitespace-pre-line text-xs text-ink/80">
                  {option.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
