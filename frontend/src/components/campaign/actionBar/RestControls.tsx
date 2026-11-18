// ============================================
// "Descanso curto" and "Descanso longo" for one character: on the bar's
// actor summary and on the 5E sheet. Both are off while a fight is on, with
// the server's refusal as their text. A long rest goes at once; a short one
// opens the hit dice to spend (one die per click, rolled and then taken off
// the pool) and the button that takes the rest.
// ============================================

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOptionalWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';
import { useTableRoll } from '@/hooks/useTableRoll';
import { useCombatState } from '@/stores/gameStore';
import { actionErrorKey } from '@/utils/actionTargeting';
import { hitDieExpression, spendRoll, canSpendHitDie } from '@/utils/hitDice';
import type { FifthEditionHitDice } from '@/types/game-systems/fifthEdition';
import Modal from '@/components/ui/Modal';

interface RestControlsProps {
  characterId: string;
  hitDice?: FifthEditionHitDice[];
  /** Constitution modifier, added to each hit die rolled. */
  con?: number;
}

const buttonClass = 'min-h-9 rounded-cozy border border-moss-green/30 px-3 text-sm text-ink-muted transition-colors hover:bg-moss-green/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

/** Nothing where there is no table to rest at (the Characters page has no socket). */
export default function RestControls(props: RestControlsProps) {
  const socket = useOptionalWebSocket()?.socket;
  return socket ? <RestPanel {...props} socket={socket} /> : null;
}

function RestPanel({ characterId, hitDice = [], con = 0, socket }: RestControlsProps & { socket: NonNullable<ReturnType<typeof useOptionalWebSocket>>['socket'] }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const tableRoll = useTableRoll(socket);
  const inCombat = useCombatState().active;
  const [shortOpen, setShortOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refusal = inCombat ? t('actionBar.errors.noRestInCombat') : undefined;

  const take = async (kind: 'short' | 'long') => {
    setBusy(true);
    const answer = await socket.takeRest({ characterIds: [characterId], kind });
    setBusy(false);
    if (!answer.ok) showToast(t(actionErrorKey(answer.error)), 'error');
    else setShortOpen(false);
  };

  const spend = async (hd: FifthEditionHitDice, index: number) => {
    const die = hitDieExpression(hd, con);
    if (die === null) return;
    const made = await tableRoll({ expression: spendRoll(die, con), purpose: t('actionBar.rest.spend', { class: hd.class }) });
    if (made) socket.emitHitDiceSpend({ characterId, index });
  };

  const rows = hitDice.map((hd, index) => ({ hd, index })).filter(({ hd }) => (hd.remaining ?? 0) > 0);

  return (
    <>
      <div className="flex gap-1.5">
        <button type="button" disabled={inCombat} title={refusal} onClick={() => setShortOpen(true)} className={buttonClass}>{t('actionBar.rest.short')}</button>
        <button type="button" disabled={inCombat || busy} title={refusal} onClick={() => void take('long')} className={buttonClass}>{t('actionBar.rest.long')}</button>
      </div>
      <Modal open={shortOpen} onClose={() => setShortOpen(false)} title={t('actionBar.rest.shortTitle')} size="sm">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">{t('actionBar.rest.hitDice')}</h3>
          {rows.length === 0 ? <p className="text-sm text-ink-muted">{t('actionBar.rest.noHitDice')}</p> : (
            <ul className="space-y-1">
              {rows.map(({ hd, index }) => (
                <li key={index} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-ink">{t('actionBar.rest.hitDie', { class: hd.class, left: hd.remaining, die: hitDieExpression(hd, con) ?? '?' })}</span>
                  <button type="button" disabled={!canSpendHitDie(hd, con)} aria-label={t('actionBar.rest.spend', { class: hd.class })} onClick={() => void spend(hd, index)} className={buttonClass}>
                    {t('actionBar.rest.spendLabel')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" disabled={inCombat || busy} title={refusal} onClick={() => void take('short')} className={`${buttonClass} w-full bg-brand/20 font-semibold text-brand-ink`}>
            {t('actionBar.rest.take')}
          </button>
        </div>
      </Modal>
    </>
  );
}
