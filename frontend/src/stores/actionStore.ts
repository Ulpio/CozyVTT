// ============================================
// The action bar's pick, as the map reads it (zustand).
//
// An action is picked first (`begin`), then the map asks for its targets:
//   • one target: a click on a token calls `resolvePending(tokenId)`;
//   • several (rays, or up to N creatures): each click calls `pickTarget`,
//     and Enter or the hint's Confirm calls `confirmPending`;
//   • an area: the template follows the pointer (`setAreaAim`), and a click
//     places it and resolves (`placeArea`); a tap only aims, and the hint's
//     Confirm resolves.
// Self-reach actions with no area and no target list resolve at once. The
// targeting logic lives here and in utils/actionTargeting.ts; the map only
// reads `pending` and calls these.
// ============================================

import { create } from 'zustand';
import { actionsService } from '@/services/actions.service';
import { AIM_THE_AREA, PICK_A_TARGET, PICK_EVERY_RAY } from '@/utils/actionTargeting';
import type { Pt } from '@/utils/aoeGeometry';
import { useGameStore } from './gameStore';
import type { ActionAreaPlacement, ActionOption, ActionRequest, ActionRollMode } from '@/types/actions';

export { PICK_EVERY_RAY };

export interface PendingAction {
  actorTokenId: string;
  option: ActionOption;
  slotLevel?: number;
  grip?: 'one' | 'two';
  /** The tokens picked so far, in order, for an action with several targets (a ray may repeat one). */
  picked: string[];
  /** Where an area action is aimed, in map pixels; null until it is. */
  area: ActionAreaPlacement | null;
}

export interface ResolveResult { ok: boolean; error?: string; code?: string }

interface ActionState {
  pending: PendingAction | null;
  mode: ActionRollMode;
  /** The request the server held back until the player agrees to drop their concentration (Task 8's dialog reads it). */
  concentrationConfirm: ActionRequest | null;
  /** The last refusal, for a toast; `seq` makes a repeat of the same text a new event. */
  lastError: { message: string; seq: number } | null;
  begin: (p: Omit<PendingAction, 'picked' | 'area'>) => void;
  cancel: () => void;
  setMode: (m: ActionRollMode) => void;
  resolvePending: (targetTokenId?: string) => Promise<ResolveResult>;
  /** Add a token to a several-target pick, up to the count; with distinct targets a second click takes it off. Never sends. */
  pickTarget: (tokenId: string) => void;
  /** Take the last pick back (Backspace). */
  unpickLast: () => void;
  /** Send a several-target pick or an aimed area; refused here when it is not complete. */
  confirmPending: () => Promise<ResolveResult>;
  /** Aim an area action at a map point, without sending. */
  setAreaAim: (p: Pt) => void;
  /** Aim an area action at a map point and resolve it (a click). */
  placeArea: (p: Pt) => Promise<ResolveResult>;
  confirmConcentration: () => Promise<ResolveResult>;
}

/** How many targets the pick is for: the option's count, plus its per-slot extra for each slot above the spell's level. */
export function targetsNeeded(pending: Pick<PendingAction, 'option' | 'slotLevel'>): number {
  const t = pending.option.targeting;
  if (t?.kind !== 'multi') return 1;
  const above = Math.max(0, (pending.slotLevel ?? 0) - (pending.option.spellLevel ?? 0));
  return t.count + (t.perSlot ?? 0) * above;
}

/** Whether the action is aimed at nobody: a self action with no area and no target list (a draining touch reads "self" but attacks someone). */
function resolvesAtOnce(option: ActionOption): boolean {
  const kind = option.targeting?.kind;
  return option.reach?.kind === 'self' && kind !== 'area' && kind !== 'multi' && option.resolution !== 'attack';
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
      // A refusal keeps the pick (try another target or spot); an action aimed at nobody has nothing to retry.
      const pending = get().pending;
      const keep = pending !== null && !resolvesAtOnce(pending.option);
      set({ ...(keep ? {} : { pending: null }), concentrationConfirm: null, lastError: { message: answer.error ?? '', seq: ++errorSeq } });
    }
    return { ok: false, error: answer.error, code: answer.code };
  }

  /** Refuse here, before the server is asked, with a toast. */
  function refuseLocally(error: string): ResolveResult {
    set({ lastError: { message: error, seq: ++errorSeq } });
    return { ok: false, error };
  }

  /** The request for the pending action, with what it is aimed at. */
  function requestFor(pending: PendingAction, aimedAt: Pick<ActionRequest, 'targetTokenId' | 'targetTokenIds' | 'area'>): ActionRequest | null {
    const mapId = useGameStore.getState().tokensMapId;
    if (!mapId) return null;
    return {
      mapId,
      actorTokenId: pending.actorTokenId,
      actionId: pending.option.id,
      ...aimedAt,
      mode: get().mode,
      ...(pending.slotLevel !== undefined ? { slotLevel: pending.slotLevel } : {}),
      ...(pending.grip !== undefined ? { grip: pending.grip } : {}),
    };
  }

  return {
    pending: null,
    mode: 'normal',
    concentrationConfirm: null,
    lastError: null,

    begin: (p) => {
      set({ pending: { ...p, picked: [], area: null }, concentrationConfirm: null });
      if (resolvesAtOnce(p.option)) void get().resolvePending();
    },

    cancel: () => set({ pending: null, concentrationConfirm: null }),

    setMode: (mode) => set({ mode }),

    resolvePending: async (targetTokenId) => {
      const { pending } = get();
      const request = pending && requestFor(pending, targetTokenId !== undefined ? { targetTokenId } : {});
      if (!request) return { ok: false, error: 'Nothing to resolve' };
      return send(request);
    },

    pickTarget: (tokenId) => {
      const pending = get().pending;
      const targeting = pending?.option.targeting;
      if (!pending || targeting?.kind !== 'multi') return;
      if (targeting.distinct && pending.picked.includes(tokenId)) {
        set({ pending: { ...pending, picked: pending.picked.filter((id) => id !== tokenId) } });
        return;
      }
      if (pending.picked.length >= targetsNeeded(pending)) return;
      set({ pending: { ...pending, picked: [...pending.picked, tokenId] } });
    },

    unpickLast: () => {
      const pending = get().pending;
      if (!pending || pending.picked.length === 0) return;
      set({ pending: { ...pending, picked: pending.picked.slice(0, -1) } });
    },

    confirmPending: async () => {
      const pending = get().pending;
      if (!pending) return { ok: false, error: 'Nothing to resolve' };
      const targeting = pending.option.targeting;
      let aimedAt: Pick<ActionRequest, 'targetTokenIds' | 'area'>;
      if (targeting?.kind === 'area') {
        if (!pending.area) return refuseLocally(AIM_THE_AREA);
        aimedAt = { area: pending.area };
      } else if (targeting?.kind === 'multi') {
        // Rays need one target each; distinct targets are one up to the count.
        if (!targeting.distinct && pending.picked.length !== targetsNeeded(pending)) return refuseLocally(PICK_EVERY_RAY);
        if (pending.picked.length === 0) return refuseLocally(PICK_A_TARGET);
        aimedAt = { targetTokenIds: [...pending.picked] };
      } else {
        return { ok: false, error: 'Nothing to confirm' };
      }
      const request = requestFor(pending, aimedAt);
      if (!request) return { ok: false, error: 'Nothing to resolve' };
      return send(request);
    },

    setAreaAim: (p) => {
      const pending = get().pending;
      const targeting = pending?.option.targeting;
      if (!pending || targeting?.kind !== 'area') return;
      // A template that leaves the caster turns towards the point; one at a point is centred there.
      const turns = targeting.origin === 'self' && (targeting.area.shape === 'cone' || targeting.area.shape === 'line');
      const area: ActionAreaPlacement = turns ? { anchor: { ...p }, aim: { ...p } } : { anchor: { ...p } };
      set({ pending: { ...pending, area } });
    },

    placeArea: async (p) => {
      get().setAreaAim(p);
      return get().confirmPending();
    },

    confirmConcentration: async () => {
      const request = get().concentrationConfirm;
      if (!request) return { ok: false, error: 'Nothing to confirm' };
      return send({ ...request, replaceConcentration: true });
    },
  };
});
