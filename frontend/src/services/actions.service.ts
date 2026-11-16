// ============================================
// Actions Service
// The action bar's socket calls: list what a token can do, resolve one,
// undo one, roll a target's concentration.
// ============================================

import socketClient from './socket';
import type { ActionOption, ActionRequest, ActionResolveAck } from '@/types/actions';

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

  concentration(messageId: string, targetTokenId: string) {
    return socketClient.rollConcentration(messageId, targetTokenId);
  },
};
