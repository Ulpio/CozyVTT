// ============================================
// Small pieces the guided creation steps share: a radio list of entries,
// a list of named texts (traits, features) and a term/value row.
// ============================================

import { useId } from 'react';
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
