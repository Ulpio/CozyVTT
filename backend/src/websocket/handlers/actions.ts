// ============================================
// Action bar handlers: action.list, action.resolve, action.undo,
// action.concentration, action.save, action.saveRemaining,
// action.undoTarget, action.pendingSaves, action.recharge,
// action.rechargeReset
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { withinCeiling, type CeilingEvent } from '../shared';
import { campaignSockets } from '../utils';
import { ackFrom, refuseRequest, type SocketAck } from '../ack';
import {
  ActionListSchema,
  ActionRequestSchema,
  ActionUndoSchema,
  ActionConcentrationSchema,
  ActionSaveSchema,
  ActionSaveRemainingSchema,
  ActionUndoTargetSchema,
  ActionPendingSavesSchema,
  ActionRechargeSchema,
} from '../../validators/actions';
import {
  listActions,
  resolveAction,
  undoAction,
  undoTarget,
  rollConcentration,
  rollPendingSave,
  rollRemainingSaves,
  listPendingSaves,
  rollRecharge,
  resetRecharge,
  type ActionRequest,
} from '../../services/actionResolver';
import { metadataFor, viewerOf } from '../../services/actionMessages';

export const SPECTATOR_REFUSAL = 'Spectators cannot use actions';
const FAILED = 'Failed to carry out the action';

/**
 * Tell each member's sockets about a message, each reader the metadata as
 * they may see it (services/actionMessages.ts). The stored card is the GM's;
 * a player is never sent it. Nothing is awaited between fetching the sockets
 * and the emits.
 */
async function emitToReaders(
  io: Server,
  campaignId: string,
  event: 'chat.message' | 'chat.message.updated',
  payload: (metadata: unknown) => Record<string, unknown>,
  stored: unknown,
  onlyUserId?: string,
): Promise<void> {
  for (const s of await campaignSockets(io, campaignId)) {
    const reader = s as unknown as AuthenticatedSocket;
    if (onlyUserId !== undefined && reader.userId !== onlyUserId) continue;
    s.emit(event, payload(metadataFor(stored, viewerOf(reader.role, reader.userId!))));
  }
}

/**
 * A message just posted, as `chat.message` to each reader. A whisper (a
 * recharge roll for a token players are not sent) goes to its sender and
 * recipient alone, as chat whispers do.
 */
async function announceMessage(io: Server, campaignId: string, messageId: string, stored: unknown): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, userId: true, content: true, type: true, createdAt: true, recipientId: true, user: { select: { displayName: true } } },
  });
  if (!message) return;
  await emitToReaders(
    io,
    campaignId,
    'chat.message',
    (metadata) => ({
      id: message.id,
      userId: message.userId,
      userName: message.user?.displayName ?? null,
      content: message.content,
      type: message.type,
      timestamp: message.createdAt.toISOString(),
      ...(message.recipientId ? { recipientId: message.recipientId } : {}),
      metadata,
    }),
    stored,
    // A whisper whose sender is gone reaches nobody.
    message.type === 'WHISPER' ? message.userId ?? '' : undefined,
  );
}

/** A message whose card changed, as `chat.message.updated` to each reader. */
async function announceUpdate(io: Server, campaignId: string, messageId: string, stored: unknown): Promise<void> {
  await emitToReaders(io, campaignId, 'chat.message.updated', (metadata) => ({ id: messageId, metadata }), stored);
}

export function registerActionHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * Runs the checks every action event shares, then `work`. Answered through
   * the acknowledgement when one is passed (see ../ack.ts). The answer never
   * holds a card: the card goes to each reader as a chat message.
   * SECURITY: uses server-authenticated socket.campaignId, userId and role only.
   */
  function on<T>(
    event: CeilingEvent,
    parse: (data: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } },
    spectatorsRefused: boolean,
    work: (input: T, campaignId: string, ack: SocketAck | null, refuse: (message: string) => void) => Promise<void>,
  ): void {
    socket.on(event, async (dataArg: unknown, ackArg?: unknown) => {
      // An event sent with nothing but an acknowledgement (`action.pendingSaves`) receives it first.
      const bare = typeof dataArg === 'function' && ackArg === undefined;
      const data = bare ? undefined : dataArg;
      const ack = ackFrom(bare ? dataArg : ackArg);
      const refuse = (message: string) => refuseRequest(socket, ack, message);
      try {
        if (!socket.campaignId || !socket.userId) {
          refuse('Not authenticated to a campaign');
          return;
        }
        if (!withinCeiling(socket, event, ack)) return;
        if (spectatorsRefused && viewerOf(socket.role, socket.userId).role === 'SPECTATOR') {
          refuse(SPECTATOR_REFUSAL);
          return;
        }
        const parsed = parse(data);
        if (!parsed.success) {
          refuse(parsed.error.issues[0]?.message ?? 'Invalid request');
          return;
        }
        await work(parsed.data, socket.campaignId, ack, refuse);
      } catch (error) {
        logger.error(`${event} failed`, { err: error });
        refuse(FAILED);
      }
    });
  }

  const me = () => viewerOf(socket.role, socket.userId!);
  const answer = (ack: SocketAck | null, body: Record<string, unknown>) => (ack as ((a: unknown) => void) | null)?.(body);

  /** ACTION.LIST - what a token the requester controls can do. NPC summaries are the GM's. */
  on('action.list', (d) => ActionListSchema.safeParse(d), true, async ({ mapId, actorTokenId }, campaignId, ack, refuse) => {
    const options = await listActions(campaignId, me(), mapId, actorTokenId);
    if ('error' in options) {
      refuse(options.error);
      return;
    }
    answer(ack, { ok: true, options });
  });

  /** ACTION.RESOLVE - roll, compare, apply and record; each reader gets their own card as `chat.message`. */
  on('action.resolve', (d) => ActionRequestSchema.safeParse(d), true, async (input, campaignId, ack) => {
    const outcome = await resolveAction(campaignId, me(), input as ActionRequest);
    if (!outcome.ok) {
      answer(ack, { ok: false, error: outcome.error, ...(outcome.code ? { code: outcome.code } : {}) });
      if (!ack) socket.emit('error', { message: outcome.error });
      return;
    }
    // The action is stored: a failure to tell the table must not read as a
    // failed action, or a retry would apply it twice.
    try {
      await announceMessage(io, campaignId, outcome.messageId, outcome.card);
    } catch (err) {
      logger.warn('action.resolve: card not announced; the action stands', { err, messageId: outcome.messageId });
    }
    answer(ack, { ok: true, messageId: outcome.messageId });
  });

  /** ACTION.UNDO - the GM takes an action back; each reader gets the changed card as `chat.message.updated`. */
  on('action.undo', (d) => ActionUndoSchema.safeParse(d), false, async ({ messageId }, campaignId, ack, refuse) => {
    const outcome = await undoAction(campaignId, me(), messageId);
    if (!outcome.ok) {
      refuse(outcome.error);
      return;
    }
    await announceUpdate(io, campaignId, messageId, outcome.card);
    answer(ack, { ok: true, partial: outcome.partial });
  });

  /**
   * ACTION.CONCENTRATION - a target rolls to keep concentration. The small
   * card is posted as `chat.message` (it holds nothing a player may not see:
   * a masked token's name is left out of it), and the action's own card,
   * which now records the roll, goes out again per reader.
   */
  on('action.concentration', (d) => ActionConcentrationSchema.safeParse(d), true, async ({ messageId, targetTokenId }, campaignId, ack, refuse) => {
    const outcome = await rollConcentration(campaignId, me(), messageId, targetTokenId);
    if (!outcome.ok) {
      refuse(outcome.error);
      return;
    }
    await announceMessage(io, campaignId, outcome.messageId, outcome.card);
    await announceUpdate(io, campaignId, messageId, outcome.actionCard);
    answer(ack, { ok: true, messageId: outcome.messageId, kept: outcome.kept, dc: outcome.dc, total: outcome.total });
  });

  /**
   * ACTION.SAVE - a target's player (or the GM) rolls its pending save; the
   * damage it takes enters, and the card goes out again per reader.
   */
  on('action.save', (d) => ActionSaveSchema.safeParse(d), true, async ({ messageId, targetTokenId, mode }, campaignId, ack, refuse) => {
    const outcome = await rollPendingSave(campaignId, me(), { messageId, targetTokenId, mode });
    if (!outcome.ok) {
      refuse(outcome.error);
      return;
    }
    await announceUpdate(io, campaignId, messageId, outcome.card);
    answer(ack, { ok: true });
  });

  /** ACTION.SAVEREMAINING - the GM rolls every save still pending on a card. */
  on('action.saveRemaining', (d) => ActionSaveRemainingSchema.safeParse(d), true, async ({ messageId }, campaignId, ack, refuse) => {
    const outcome = await rollRemainingSaves(campaignId, me(), { messageId });
    if (!outcome.ok) {
      refuse(outcome.error);
      return;
    }
    await announceUpdate(io, campaignId, messageId, outcome.card);
    answer(ack, { ok: true });
  });

  /** ACTION.UNDOTARGET - the GM takes back what an action did to one target, or cancels its pending save. */
  on('action.undoTarget', (d) => ActionUndoTargetSchema.safeParse(d), true, async ({ messageId, targetTokenId }, campaignId, ack, refuse) => {
    const outcome = await undoTarget(campaignId, me(), { messageId, targetTokenId });
    if (!outcome.ok) {
      refuse(outcome.error);
      return;
    }
    await announceUpdate(io, campaignId, messageId, outcome.card);
    answer(ack, { ok: true, partial: outcome.partial });
  });

  /**
   * ACTION.PENDINGSAVES - the cards with a save still waiting on the
   * requester (the GM: on anyone), each as the requester may read it. A page
   * asks on joining and reconnecting, so a prompt older than the chat it
   * loaded still shows.
   */
  on('action.pendingSaves', (d) => ActionPendingSavesSchema.safeParse(d), true, async (_input, campaignId, ack) => {
    const pending = await listPendingSaves(campaignId, me());
    answer(ack, { ok: true, pending });
  });

  /** ACTION.RECHARGE - the GM rolls a d6 for a monster's spent recharge; the roll is posted as a small card. */
  on('action.recharge', (d) => ActionRechargeSchema.safeParse(d), true, async (input, campaignId, ack, refuse) => {
    const outcome = await rollRecharge(campaignId, me(), input);
    if (!outcome.ok) {
      refuse(outcome.error);
      return;
    }
    await announceMessage(io, campaignId, outcome.messageId, outcome.card);
    answer(ack, { ok: true, messageId: outcome.messageId, recharged: outcome.recharged, d6: outcome.d6 });
  });

  /** ACTION.RECHARGERESET - the GM brings a monster's spent recharge back by hand. */
  on('action.rechargeReset', (d) => ActionRechargeSchema.safeParse(d), true, async (input, campaignId, ack, refuse) => {
    const outcome = await resetRecharge(campaignId, me(), input);
    if (!outcome.ok) {
      refuse(outcome.error);
      return;
    }
    answer(ack, { ok: true });
  });
}
