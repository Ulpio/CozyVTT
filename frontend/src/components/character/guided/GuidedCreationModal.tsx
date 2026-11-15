// ============================================
// Guided character creation (D&D 5e, 3rd level): a full-screen wizard fed by
// the compendium of the campaign's books (every book outside a campaign).
// Steps on the left, the current step in the middle, a live summary on the
// right; on a narrow screen the steps run across the top and the summary
// opens from a button.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ClipboardList, Wand2, X } from 'lucide-react';
import { Modal } from '@/components/ui';
import Button from '@/components/ui/Button';
import type { Campaign, Character } from '@/types';
import type { CreationData } from '@/utils/guidedCreation/buildSheet';
import type { CreationChoices } from '@/utils/guidedCreation/types';
import { cn } from '@/utils/cn';
import SheetSummary from './SheetSummary';
import { STEPS } from './steps';
import { availableMethods, defaultScores, rollTotals } from './stepRules';
import { useAbilityRoll, type AbilityRollState } from './useAbilityRoll';
import { useCreationData } from './useCreationData';
import { emptyChoices, useCreationState } from './useCreationState';

export interface GuidedCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The character was created (the review step, still to come, calls it). */
  onCreated: (character: Character) => void;
  /** The campaign the character is made for: its books and ability-score methods. */
  campaign?: Campaign;
}

export default function GuidedCreationModal({ isOpen, onClose, campaign }: GuidedCreationModalProps) {
  const { t } = useTranslation();
  return (
    <Modal open={isOpen} onClose={onClose} title={t('guidedCreation.title')} icon={Wand2} size="full" fitViewport>
      <Wizard campaign={campaign} />
    </Modal>
  );
}

/** Mounted while the dialog is open, so each opening starts afresh (a saved roll comes back from the server). */
function Wizard({ campaign }: { campaign?: Campaign }) {
  const { t } = useTranslation();
  const { data, loading, error } = useCreationData(campaign?.id);
  const roll = useAbilityRoll(campaign?.id);

  if (loading) return <p className="text-sm text-warm-gray">{t('guidedCreation.loading')}</p>;
  if (error || !data) return <p role="alert" className="text-sm text-danger-ink">{t('guidedCreation.loadFailed')}</p>;
  if (!data.races.length || !data.classes.length) {
    return <p className="text-sm text-ink">{t('guidedCreation.noBooks')}</p>;
  }
  return <Steps data={data} campaign={campaign} roll={roll} />;
}

interface StepsProps {
  data: CreationData;
  campaign?: Campaign;
  roll: AbilityRollState;
}

function Steps({ data, campaign, roll }: StepsProps) {
  const { t } = useTranslation();
  const { choices, dispatch, cleared } = useCreationState(data, () => {
    const method = availableMethods(campaign, null)[0] ?? 'POINT_BUY';
    return { ...emptyChoices(method), baseScores: defaultScores(method) };
  });
  const [current, setCurrent] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const update = (patch: Partial<CreationChoices>) =>
    dispatch({ type: 'update', patch });

  // A roll saved earlier (this wizard was closed, or the page reloaded) is the one to use.
  const savedRollUsed = useRef(false);
  useEffect(() => {
    if (!roll.roll || savedRollUsed.current) return;
    savedRollUsed.current = true;
    if (choices.abilityRollId === roll.roll.id) return;
    update({ method: 'ROLL', baseScores: defaultScores('ROLL', rollTotals(roll.roll)), abilityRollId: roll.roll.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the saved roll is known
  }, [roll.roll]);

  const check = { data, choices, campaign, roll: roll.roll };
  const complete = STEPS.map((s) => s.isComplete(check));
  // A step can be opened once every step before it is done.
  const firstOpen = complete.findIndex((done) => !done);
  const reachable = (i: number) => firstOpen === -1 || i <= firstOpen;
  const step = STEPS[current];
  const isLast = current === STEPS.length - 1;

  const go = (i: number) => {
    setCurrent(i);
    dispatch({ type: 'dismissCleared' });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)_17rem] lg:gap-6">
      <nav aria-label={t('guidedCreation.stepList')} className="shrink-0 lg:overflow-y-auto">
        <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {STEPS.map((s, i) => (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => go(i)}
                disabled={!reachable(i)}
                aria-current={i === current ? 'step' : undefined}
                className={cn(
                  'w-full text-left rounded-cozy px-3 py-2 text-sm touch-target whitespace-nowrap',
                  i === current ? 'bg-moss-green/15 text-ink font-semibold' : 'text-stone-gray hover:bg-ink/5',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                )}
              >
                <span aria-hidden="true">{i + 1}. </span>
                {t(`guidedCreation.steps.${s.id}`)}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
          {cleared.length > 0 && (
            <div role="status" className="flex items-start gap-2 rounded-cozy border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-ink">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{t('guidedCreation.cleared')}</span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'dismissCleared' })}
                aria-label={t('guidedCreation.dismiss')}
                className="p-1 rounded hover:bg-ink/10 touch-target"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          <h3 className="text-xl font-semibold text-brand-ink font-heading">{t(`guidedCreation.steps.${step.id}`)}</h3>
          <step.Component data={data} choices={choices} update={update} campaign={campaign} roll={roll} />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 shrink-0">
          <Button type="button" variant="secondary" icon={ClipboardList} className="lg:hidden" onClick={() => setSummaryOpen(true)}>
            {t('guidedCreation.summary.open')}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={() => go(current - 1)} disabled={current === 0}>
              {t('guidedCreation.back')}
            </Button>
            {!isLast && (
              <Button type="button" onClick={() => go(current + 1)} disabled={!complete[current]}>
                {t('guidedCreation.next')}
              </Button>
            )}
          </div>
        </div>
      </section>

      <aside className="hidden lg:block min-h-0 overflow-y-auto">
        <SheetSummary data={data} choices={choices} />
      </aside>

      <Modal open={summaryOpen} onClose={() => setSummaryOpen(false)} title={t('guidedCreation.summary.title')} layer="overlay">
        <SheetSummary data={data} choices={choices} />
      </Modal>
    </div>
  );
}
