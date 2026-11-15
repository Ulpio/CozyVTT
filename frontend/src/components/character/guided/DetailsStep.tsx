// ============================================
// Step 10: details. The name (the only thing required), alignment,
// appearance, personality and backstory. The personality can be drawn from
// the background's own tables (compendium data), picked from them, or
// written; whatever lands in a field stays editable.
// ============================================

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices } from 'lucide-react';
import { SHEET_NAME_MAX } from '@/constants/sheetLimits';
import type { Messages } from '@/i18n/locales/en';
import type { CreationDetails } from '@/utils/guidedCreation/types';
import type { StepProps } from './stepRules';

type AlignmentKey = keyof Messages['guidedCreation']['details']['alignments'];
const ALIGNMENTS: AlignmentKey[] = [
  'lawfulGood',
  'neutralGood',
  'chaoticGood',
  'lawfulNeutral',
  'neutral',
  'chaoticNeutral',
  'lawfulEvil',
  'neutralEvil',
  'chaoticEvil',
];

const APPEARANCE = ['age', 'height', 'weight', 'eyes', 'skin', 'hair'] as const;

type PersonalityField = 'traits' | 'ideals' | 'bonds' | 'flaws';
const PERSONALITY: PersonalityField[] = ['traits', 'ideals', 'bonds', 'flaws'];
/** The book has a character take two traits and one of the rest. */
const DRAWN: Record<PersonalityField, number> = { traits: 2, ideals: 1, bonds: 1, flaws: 1 };

/** `count` different rows of the table, at random. */
export function drawRows(rows: string[], count: number): string[] {
  const left = [...rows];
  const out: string[] = [];
  while (out.length < count && left.length) out.push(left.splice(Math.floor(Math.random() * left.length), 1)[0]);
  return out;
}


/**
 * The field with a row picked from its table: a trait joins the others, the
 * newest `DRAWN.traits` kept and never the same row twice; the rest take the row.
 */
export function withPickedRow(field: PersonalityField, value: string, row: string): string {
  if (field !== 'traits') return row;
  const lines = value.split('\n').filter((line) => line.trim());
  if (lines.includes(row)) return value;
  return [...lines, row].slice(-DRAWN.traits).join('\n');
}
/** A name the server takes (trimmed). */
export const detailsComplete = (details: CreationDetails) => {
  const name = details.name.trim();
  return name.length >= 2 && name.length <= SHEET_NAME_MAX;
};

const inputClass = 'input-cozy w-full';

export default function DetailsStep({ data, choices, update }: StepProps) {
  const { t } = useTranslation();
  const id = useId();
  const { details } = choices;
  const background = data.backgrounds.find((b) => b.slug === choices.backgroundSlug);
  const tables = background?.data.personality;

  const set = (patch: Partial<CreationDetails>) => update({ details: { ...details, ...patch } });
  const setAppearance = (key: string, value: string) => set({ appearance: { ...details.appearance, [key]: value } });
  const setPersonality = (field: PersonalityField, value: string) =>
    set({ personality: { ...details.personality, [field]: value } });
  const alignmentKey = ALIGNMENTS.find((k) => t(`guidedCreation.details.alignments.${k}`) === details.alignment);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className="block text-sm font-semibold text-stone-gray mb-1">
            {t('guidedCreation.details.name')} <span className="text-danger-ink" aria-hidden="true">*</span>
          </label>
          <input
            id={`${id}-name`}
            type="text"
            value={details.name}
            onChange={(e) => set({ name: e.target.value })}
            maxLength={SHEET_NAME_MAX}
            required
            aria-describedby={`${id}-name-hint`}
            className={inputClass}
          />
          <p id={`${id}-name-hint`} className="mt-1 text-xs text-warm-gray">
            {t('guidedCreation.details.nameHint', { max: SHEET_NAME_MAX })}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-alignment`} className="block text-sm font-semibold text-stone-gray mb-1">
            {t('guidedCreation.details.alignment')}
          </label>
          <select
            id={`${id}-alignment`}
            value={alignmentKey ?? ''}
            onChange={(e) =>
              set({ alignment: e.target.value ? t(`guidedCreation.details.alignments.${e.target.value as AlignmentKey}`) : undefined })
            }
            className={inputClass}
          >
            <option value="">{t('guidedCreation.details.noAlignment')}</option>
            {ALIGNMENTS.map((k) => (
              <option key={k} value={k}>
                {t(`guidedCreation.details.alignments.${k}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-stone-gray mb-2">{t('guidedCreation.details.appearance')}</legend>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          {APPEARANCE.map((key) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="block text-xs text-warm-gray mb-1">
                {t(`guidedCreation.details.${key}`)}
              </label>
              <input
                id={`${id}-${key}`}
                type="text"
                value={details.appearance?.[key] ?? ''}
                onChange={(e) => setAppearance(key, e.target.value)}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-stone-gray mb-1">{t('guidedCreation.details.personality')}</legend>
        {tables && background && (
          <p className="text-xs text-warm-gray">{t('guidedCreation.details.personalityHint', { background: background.name })}</p>
        )}
        {PERSONALITY.map((field) => {
          const label = t(`guidedCreation.details.${field}`);
          const rows = tables?.[field] ?? [];
          const value = details.personality?.[field] ?? '';
          return (
            <div key={field} className="space-y-1">
              <div className="flex flex-wrap items-end gap-2">
                <label htmlFor={`${id}-${field}`} className="text-sm text-ink font-semibold mr-auto">
                  {label}
                </label>
                {rows.length > 0 && (
                  <>
                    <select
                      aria-label={t('guidedCreation.details.pickFrom', { field: label.toLowerCase() })}
                      value=""
                      onChange={(e) => {
                        const row = e.target.value;
                        if (row) setPersonality(field, withPickedRow(field, value, row));
                      }}
                      className="input-cozy max-w-[16rem] text-sm"
                    >
                      <option value="">{t('guidedCreation.details.pickRow')}</option>
                      {rows.map((row) => (
                        <option key={row} value={row}>
                          {row}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setPersonality(field, drawRows(rows, DRAWN[field]).join('\n'))}
                      aria-label={t('guidedCreation.details.drawField', { field: label.toLowerCase() })}
                      className="inline-flex items-center gap-1 rounded-cozy border border-ink/15 px-3 py-2 text-sm text-ink hover:bg-ink/5 touch-target"
                    >
                      <Dices className="h-4 w-4" aria-hidden="true" />
                      {t('guidedCreation.details.draw')}
                    </button>
                  </>
                )}
              </div>
              <textarea
                id={`${id}-${field}`}
                value={value}
                onChange={(e) => setPersonality(field, e.target.value)}
                rows={field === 'traits' ? 3 : 2}
                className={inputClass}
              />
            </div>
          );
        })}
      </fieldset>

      <div>
        <label htmlFor={`${id}-backstory`} className="block text-sm font-semibold text-stone-gray mb-1">
          {t('guidedCreation.details.backstory')}
        </label>
        <textarea
          id={`${id}-backstory`}
          value={details.backstory ?? ''}
          onChange={(e) => set({ backstory: e.target.value })}
          rows={5}
          className={inputClass}
        />
      </div>
    </div>
  );
}
