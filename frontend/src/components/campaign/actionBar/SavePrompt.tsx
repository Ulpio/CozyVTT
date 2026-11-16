// ============================================
// The saves waiting on this player, over the map: one row per save
// ("Merlin's Fireball — Dexterity saving throw DC 15") with Normal,
// Advantage and Disadvantage. The rows come from pendingSaveStore, which this
// component keeps up to date: it asks the server on every join of the
// campaign (a reload, a reconnect) and hands it each card the chat receives.
// The card in the chat has the same buttons (SaveModeButtons).
// ============================================

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { usePendingSaveStore, pendingSaveRows, rollKey, type PendingSaveRow } from '@/stores/pendingSaveStore';
import { actionErrorKey } from '@/utils/actionTargeting';
import { ROLL_MODES } from '@/utils/rollModes';
import Toast, { useToast } from '@/components/Toast';
import type { ActionMaskedName, ActionRollMode } from '@/types/actions';
import type { ChatMessageBroadcast, ChatMessageUpdated } from '@/types';

const BUTTON = 'min-h-8 rounded-sm border border-brand/40 bg-brand/10 px-2.5 text-xs font-medium text-brand-ink hover:bg-brand/20 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand';

/** The three roll modes as buttons, for one pending save. */
export function SaveModeButtons({ disabled, onRoll }: { disabled?: boolean; onRoll: (mode: ActionRollMode) => void }) {
  const { t } = useTranslation();
  return (
    <>
      {ROLL_MODES.map((mode) => (
        <button key={mode} type="button" className={BUTTON} disabled={disabled} onClick={() => onRoll(mode)}>
          {t(`actionBar.mode.${mode}`)}
        </button>
      ))}
    </>
  );
}

/** Rolls one pending save through the store, saying why when the server refuses. */
export function useRollSave() {
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useToast();
  const rolling = usePendingSaveStore((s) => s.rolling);
  const roll = async (messageId: string, targetTokenId: string, mode: ActionRollMode) => {
    const answer = await usePendingSaveStore.getState().roll(messageId, targetTokenId, mode);
    if (!answer.ok) showToast(t(actionErrorKey(answer.error)), 'error');
  };
  const isRolling = (messageId: string, targetTokenId: string) => rolling[rollKey(messageId, targetTokenId)] === true;
  const toastElement = <Toast message={toast.message} type={toast.type} show={toast.show} onClose={hideToast} />;
  return { roll, isRolling, toastElement };
}

/** Keeps the store in step with the server: read back on each join, then each card the chat receives. */
function usePendingSaveSync(enabled: boolean) {
  const { socket, joinedEpoch } = useWebSocket();

  useEffect(() => {
    if (!enabled || joinedEpoch < 1) return;
    void usePendingSaveStore.getState().load();
  }, [enabled, joinedEpoch]);

  useEffect(() => {
    if (!enabled || !socket) return;
    const onMessage = (data: ChatMessageBroadcast) => usePendingSaveStore.getState().apply(data.id, data.metadata);
    const onUpdated = (data: ChatMessageUpdated) => usePendingSaveStore.getState().apply(data.id, data.metadata);
    socket.onChatMessage(onMessage);
    socket.onChatMessageUpdated(onUpdated);
    return () => {
      socket.off('chat.message', onMessage);
      socket.off('chat.message.updated', onUpdated);
    };
  }, [enabled, socket]);

  useEffect(() => () => usePendingSaveStore.getState().clear(), []);
}

export default function SavePrompt({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { userRole } = useCampaign();
  // The GM rolls through the card's Roll the rest; a spectator rolls nothing.
  const enabled = userRole === 'PLAYER';
  usePendingSaveSync(enabled);
  const entries = usePendingSaveStore((s) => s.entries);
  const rows = useMemo(() => pendingSaveRows(entries), [entries]);
  const { roll, isRolling, toastElement } = useRollSave();

  const masked = (name: string | undefined, maskedName: ActionMaskedName | undefined) =>
    name ?? t(maskedName === 'something-invisible' ? 'actionCard.somethingInvisible' : 'actionCard.something');
  const label = (row: PendingSaveRow) => t('actionBar.savePrompt.row', {
    actor: masked(row.actorName, row.actorMaskedName),
    action: row.actionName,
    ability: t(`guidedCreation.ability.${row.ability}`),
    dc: row.dc,
  });

  if (!enabled) return null;
  return (
    <>
      {rows.length > 0 && (
        <div
          role="region"
          aria-label={t('actionBar.savePrompt.label')}
          className={`space-y-1 rounded-cozy border border-brand/30 bg-parchment/95 px-3 py-2 text-sm text-brand-ink shadow-md ${className}`}
        >
          {rows.map((row) => (
            <div key={rollKey(row.messageId, row.targetTokenId)} role="group" aria-label={label(row)} className="flex flex-wrap items-center gap-2">
              <span className="text-ink-muted">{t('actionBar.savePrompt.target', { name: masked(row.targetName, row.maskedName) })}</span>
              <span className="font-semibold">{label(row)}</span>
              <span className="flex gap-1.5">
                <SaveModeButtons disabled={isRolling(row.messageId, row.targetTokenId)} onRoll={(mode) => void roll(row.messageId, row.targetTokenId, mode)} />
              </span>
            </div>
          ))}
        </div>
      )}
      {toastElement}
    </>
  );
}
