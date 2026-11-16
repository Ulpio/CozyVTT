// ============================================
// Actions Service
// The action bar's socket calls: list what a token can do, resolve one,
// undo one (or one target of it), roll a target's concentration or save,
// list the saves waiting, and roll or reset a monster's recharge.
// ============================================

import socketClient from './socket';
import type { ActionOption, ActionRequest, ActionResolveAck, ActionRollMode, PendingSaveCard } from '@/types/actions';

export const actionsService = {
  /** What the token can do; empty when the server refuses or does not answer. */
  async list(mapId: string, actorTokenId: string): Promise<ActionOption[]> {
    const answer = await socketClient.listActions({ mapId, actorTokenId });
    return answer.ok ? answer.options : [];
  },

  resolve(request: ActionRequest): Promise<ActionResolveAck> {
    return socketClient.resolveAction(request);
  },

  undo(messageId: string) {
    return socketClient.undoAction(messageId);
  },

  undoTarget(messageId: string, targetTokenId: string) {
    return socketClient.undoActionTarget(messageId, targetTokenId);
  },

  concentration(messageId: string, targetTokenId: string) {
    return socketClient.rollConcentration(messageId, targetTokenId);
  },

  save(messageId: string, targetTokenId: string, mode: ActionRollMode) {
    return socketClient.rollSave({ messageId, targetTokenId, mode });
  },

  saveRemaining(messageId: string) {
    return socketClient.rollRemainingSaves(messageId);
  },

  /** The cards with a save waiting on this user; null when the server refuses or does not answer. */
  async pendingSaves(): Promise<PendingSaveCard[] | null> {
    const answer = await socketClient.pendingSaves();
    return answer.ok ? answer.pending : null;
  },

  recharge(mapId: string, tokenId: string, optionId: string) {
    return socketClient.rollRecharge({ mapId, tokenId, optionId });
  },

  rechargeReset(mapId: string, tokenId: string, optionId: string) {
    return socketClient.resetRecharge({ mapId, tokenId, optionId });
  },
};
