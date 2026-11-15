// ============================================
// Picking spells from a list: filters by level and name, a checkbox per spell
// (held at the limit), spells that come without picking shown locked, and the
// picked or focused spell's compendium text in a side panel.
// ============================================

import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { CreationEntry } from '@/utils/guidedCreation/buildSheet';
import type { SpellData } from '@/utils/guidedCreation/compendiumData';
import { cn } from '@/utils/cn';

type SpellEntry = CreationEntry<SpellData>;

interface SpellPickerProps {
  legend: string;
  spells: SpellEntry[];
  count: number;
  picks: string[];
  onChange: (picks: string[]) => void;
  /** Known or prepared without picking: shown checked and locked. */
  locked?: SpellEntry[];
  /** A spell that cannot be picked now (an off-school pick with none left). */
  blocked?: (spell: SpellEntry) => boolean;
  hint?: string;
}

const ALL = 'all';

export default function SpellPicker({ legend, spells, count, picks, onChange, locked = [], blocked, hint }: SpellPickerProps) {
  const { t } = useTranslation();
  const filterId = useId();
  const [level, setLevel] = useState(ALL);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<string | null>(null);

  const levels = useMemo(() => [...new Set(spells.map((s) => s.data.level))].sort((a, b) => a - b), [spells]);
  const visible = spells.filter(
    (s) =>
      (level === ALL || String(s.data.level) === level) &&
      (!query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const full = picks.length >= count;
  const focused = [...locked, ...spells].find((s) => s.slug === shown);
  const levelName = (n: number) => (n === 0 ? t('guidedCreation.spells.cantrip') : t('guidedCreation.spells.level', { level: n }));

  const toggle = (slug: string) => onChange(picks.includes(slug) ? picks.filter((p) => p !== slug) : [...picks, slug]);

  const row = (spell: SpellEntry, isLocked: boolean) => {
    const checked = isLocked || picks.includes(spell.slug);
    const disabled = isLocked || (!checked && (full || !!blocked?.(spell)));
    return (
      <li
        key={`${isLocked ? 'locked' : 'pick'}-${spell.slug}`}
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-cozy border px-3 py-1.5 text-sm',
          checked ? 'border-moss-green bg-moss-green/10' : 'border-ink/15',
          shown === spell.slug && 'ring-1 ring-moss-green',
        )}
      >
        <label className={cn('flex flex-1 min-w-[10rem] items-center gap-2 touch-target', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={() => {
              toggle(spell.slug);
              setShown(spell.slug);
            }}
            className="h-4 w-4 accent-moss-green"
          />
          <span className={cn('text-ink', disabled && !checked && 'opacity-60')}>{spell.name}</span>
          {isLocked && <Lock className="h-3.5 w-3.5 text-warm-gray" aria-label={t('guidedCreation.spells.locked')} />}
        </label>
        <span className="text-xs text-warm-gray whitespace-nowrap">
          {levelName(spell.data.level)} · {spell.data.school}
        </span>
        <button
          type="button"
          onClick={() => setShown(spell.slug)}
          className="text-xs text-brand-ink underline touch-target"
          aria-label={t('guidedCreation.spells.readSpell', { name: spell.name })}
        >
          {t('guidedCreation.spells.read')}
        </button>
      </li>
    );
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

      <div className="flex flex-wrap gap-2">
        {levels.length > 1 && (
          <select
            aria-label={t('guidedCreation.spells.filterLevel')}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-cozy border border-ink/20 bg-surface px-2 py-1 text-sm text-ink"
          >
            <option value={ALL}>{t('guidedCreation.spells.allLevels')}</option>
            {levels.map((n) => (
              <option key={n} value={String(n)}>
                {levelName(n)}
              </option>
            ))}
          </select>
        )}
        <label htmlFor={filterId} className="sr-only">
          {t('guidedCreation.spells.search')}
        </label>
        <input
          id={filterId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('guidedCreation.spells.search')}
          className="flex-1 min-w-[10rem] rounded-cozy border border-ink/20 bg-surface px-2 py-1 text-sm text-ink"
        />
      </div>

      {/* The text beside the list only where both fit (xl): the wizard takes
          its steps and summary columns from lg, which leaves the list too
          narrow for a panel beside it. Below xl the text comes under it. */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <ul className="space-y-1">
          {locked.map((s) => row(s, true))}
          {visible.map((s) => row(s, false))}
          {!visible.length && <li className="text-sm text-warm-gray">{t('guidedCreation.spells.noMatch')}</li>}
        </ul>
        <aside
          aria-live="polite"
          className="sticky top-0 rounded-cozy border border-ink/10 bg-surface/50 p-3 text-sm self-start xl:max-h-[70dvh] xl:overflow-y-auto"
        >
          {focused ? (
            <div className="space-y-1">
              <h5 className="font-semibold text-ink">{focused.name}</h5>
              <p className="text-xs text-warm-gray">
                {levelName(focused.data.level)} · {focused.data.school}
              </p>
              <p className="text-xs text-ink/80">
                {[focused.data.castingTime, focused.data.range, focused.data.duration].filter(Boolean).join(' · ')}
              </p>
              <p className="whitespace-pre-line text-ink/90">{focused.text}</p>
            </div>
          ) : (
            <p className="text-warm-gray">{t('guidedCreation.spells.panelEmpty')}</p>
          )}
        </aside>
      </div>
    </fieldset>
  );
}
