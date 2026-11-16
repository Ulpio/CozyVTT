// ============================================
// The saving throws waiting on this user (zustand).
//
// A card is kept while a target on it is this user's to roll (`yourSave`).
// `load` reads them back from the server (`action.pendingSaves`) on joining
// and rejoining, so a prompt from a message older than the chat page still
// shows; `apply` takes each new or changed card the chat receives, and drops
// it once the save is rolled, the target undone or the card undone. The
// banner over the map (SavePrompt) and the card's own buttons roll through
// `roll`; the card that comes back is what clears the row.
// ============================================

import { create } from 'zustand';
import { actionsService } from '@/services/actions.service';
import type { ActionAbility, ActionCardView, ActionMaskedName, ActionRollMode, PendingSaveCard, PlayerActionCardTarget } from '@/types/actions';

export interface PendingSaveRow {
  messageId: string;
  targetTokenId: string;
  actionName: string;
  actorName?: string;
  actorMaskedName?: ActionMaskedName;
  targetName?: string;
  maskedName?: ActionMaskedName;
  ability: ActionAbility;
  dc: number;
}

interface PendingSaveState {
  /** The cards with a save of this user's waiting, oldest first. */
  entries: PendingSaveCard[];
  /** `${messageId}:${targetTokenId}` of the rolls on their way to the server. */
  rolling: Record<string, true>;
  load: () => Promise<void>;
  apply: (messageId: string, metadata: unknown) => void;
  roll: (messageId: string, targetTokenId: string, mode: ActionRollMode) => Promise<{ ok: boolean; error?: string }>;
  clear: () => void;
}

/** This viewer's own pending saves on a card: none once the card or the target is undone. */
function mySaves(card: ActionCardView): PlayerActionCardTarget[] {
  if (card.undoneAt) return [];
  return (card.targets as PlayerActionCardTarget[]).filter((t) => t.yourSave === true && t.save?.status === 'pending' && !t.undoneAt);
}

function waiting(metadata: unknown): metadata is ActionCardView {
  const card = metadata as ActionCardView | null;
  return !!card && card.kind === 'action' && Array.isArray(card.targets) && mySaves(card).length > 0;
}

export const rollKey = (messageId: string, targetTokenId: string) => `${messageId}:${targetTokenId}`;

export const usePendingSaveStore = create<PendingSaveState>((set) => ({
  entries: [],
  rolling: {},

  load: async () => {
    const pending = await actionsService.pendingSaves();
    // No answer: keep what is shown rather than lose a prompt.
    if (!pending) return;
    set({ entries: pending.filter((p) => waiting(p.card)) });
  },

  apply: (messageId, metadata) =>
    set((state) => {
      const at = state.entries.findIndex((e) => e.messageId === messageId);
      if (!waiting(metadata)) return at < 0 ? state : { entries: state.entries.filter((e) => e.messageId !== messageId) };
      const entry = { messageId, card: metadata };
      if (at < 0) return { entries: [...state.entries, entry] };
      const entries = [...state.entries];
      entries[at] = entry;
      return { entries };
    }),

  roll: async (messageId, targetTokenId, mode) => {
    const key = rollKey(messageId, targetTokenId);
    set((state) => ({ rolling: { ...state.rolling, [key]: true } }));
    try {
      return await actionsService.save(messageId, targetTokenId, mode);
    } finally {
      set((state) => {
        const rolling = { ...state.rolling };
        delete rolling[key];
        return { rolling };
      });
    }
  },

  clear: () => set({ entries: [], rolling: {} }),
}));

/** One row per save of this user's still waiting, in the order the cards came. */
export function pendingSaveRows(entries: PendingSaveCard[]): PendingSaveRow[] {
  return entries.flatMap(({ messageId, card }) =>
    mySaves(card).map((t) => {
      const row: PendingSaveRow = { messageId, targetTokenId: t.tokenId, actionName: card.actionName, ability: t.save!.ability, dc: t.save!.dc };
      if (card.actor.name !== undefined) row.actorName = card.actor.name;
      if (card.actor.maskedName) row.actorMaskedName = card.actor.maskedName;
      if (t.name !== undefined) row.targetName = t.name;
      if (t.maskedName) row.maskedName = t.maskedName;
      return row;
    }),
  );
}
