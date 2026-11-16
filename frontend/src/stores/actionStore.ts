// ============================================
// The action bar's pick, as the map reads it (zustand).
//
// An action is picked first (`begin`), then the map asks for a target: a click
// on a token calls `resolvePending(tokenId)`. Self-reach actions resolve at
// once. The targeting logic lives here and in utils/actionTargeting.ts; the
// map only reads `pending` and calls these.
// ============================================

import { create } from 'zustand';
import { actionsService } from '@/services/actions.service';
import { useGameStore } from './gameStore';
import type { ActionOption, ActionRequest, ActionRollMode } from '@/types/actions';

export interface PendingAction {
  actorTokenId: string;
  option: ActionOption;
  slotLevel?: number;
  grip?: 'one' | 'two';
}

export interface ResolveResult { ok: boolean; error?: string; code?: string }

interface ActionState {
  pending: PendingAction | null;
  mode: ActionRollMode;
  /** The request the server held back until the player agrees to drop their concentration (Task 8's dialog reads it). */
  concentrationConfirm: ActionRequest | null;
  /** The last refusal, for a toast; `seq` makes a repeat of the same text a new event. */
  lastError: { message: string; seq: number } | null;
  begin: (p: PendingAction) => void;
  cancel: () => void;
  setMode: (m: ActionRollMode) => void;
  resolvePending: (targetTokenId?: string) => Promise<ResolveResult>;
  confirmConcentration: () => Promise<ResolveResult>;
}

let errorSeq = 0;
/** A request is out: a second click waits for its answer instead of sending twice. */
let inFlight = false;

export const useActionStore = create<ActionState>((set, get) => {
  /** Send a request and file the answer: refusals go to `lastError`, the concentration question to its confirm. */
  async function send(request: ActionRequest): Promise<ResolveResult> {
    if (inFlight) return { ok: false, error: 'Busy' };
    inFlight = true;
    let answer;
    try {
      answer = await actionsService.resolve(request);
    } finally {
      inFlight = false;
    }
    if (answer.ok) {
      set({ pending: null, concentrationConfirm: null });
      return { ok: true };
    }
    if (answer.code === 'needs-concentration-confirm') {
      set({ pending: null, concentrationConfirm: request });
    } else {
      // A refusal keeps the pick (try another target); a self action has no target to retry.
      const keep = get().pending?.option.reach?.kind !== 'self' && get().pending !== null;
      set({ ...(keep ? {} : { pending: null }), concentrationConfirm: null, lastError: { message: answer.error ?? '', seq: ++errorSeq } });
    }
    return { ok: false, error: answer.error, code: answer.code };
  }

  return {
    pending: null,
    mode: 'normal',
    concentrationConfirm: null,
    lastError: null,

    begin: (p) => {
      set({ pending: p, concentrationConfirm: null });
      if (p.option.reach?.kind === 'self') void get().resolvePending();
    },

    cancel: () => set({ pending: null, concentrationConfirm: null }),

    setMode: (mode) => set({ mode }),

    resolvePending: async (targetTokenId) => {
      const { pending, mode } = get();
      const mapId = useGameStore.getState().tokensMapId;
      if (!pending || !mapId) return { ok: false, error: 'Nothing to resolve' };
      const request: ActionRequest = {
        mapId,
        actorTokenId: pending.actorTokenId,
        actionId: pending.option.id,
        ...(targetTokenId !== undefined ? { targetTokenId } : {}),
        mode,
        ...(pending.slotLevel !== undefined ? { slotLevel: pending.slotLevel } : {}),
        ...(pending.grip !== undefined ? { grip: pending.grip } : {}),
      };
      return send(request);
    },

    confirmConcentration: async () => {
      const request = get().concentrationConfirm;
      if (!request) return { ok: false, error: 'Nothing to confirm' };
      return send({ ...request, replaceConcentration: true });
    },
  };
});
