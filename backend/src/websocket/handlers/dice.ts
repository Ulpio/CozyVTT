// ============================================
// Dice handlers: dice.roll, dice.clearHistory
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { rollDice, parseDiceExpression, DiceParserError } from '../../utils/dice-parser';
import logger from '../../utils/logger';
import { withinCeiling } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canRollDice } from '../../services/permissions';
import { campaignSockets } from '../utils';
import { DiceRollSchema } from '../../validators/dice';
import { ackFrom, refuseRequest } from '../ack';
import { GM_ONLY, NO_CHARACTER } from '../../services/gmNotice';

/**
 * A secret roll goes to the socket that rolled it (always) as `dice.rolled`,
 * and to the sockets of every other GM as `dice.rolled.secret`. Nobody else
 * is told. Follows the Spirit Layer pattern: GMs see everything, players see
 * filtered.
 */
async function sendSecretRoll(io: Server, socket: AuthenticatedSocket, campaignId: string, rollData: Record<string, unknown>): Promise<void> {
  socket.emit('dice.rolled', rollData);
  for (const s of await campaignSockets(io, campaignId)) {
    const authedSocket = s as unknown as AuthenticatedSocket;
    if (authedSocket.role === 'GM' && authedSocket.userId !== socket.userId) {
      s.emit('dice.rolled.secret', {
        ...rollData,
        originalRoller: socket.userId,
        isAuditView: true, // Flag so GM UI can style differently
      });
    }
  }
}

const SECRET_CHECK_COUNT = 'Escolha de 1 a 20 personagens.';
const SECRET_CHECK_ROLL = 'O teste secreto tem uma rolagem inválida.';
const MAX_SECRET_CHECK_ROLLS = 20;

export function registerDiceHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * DICE.ROLL - User rolls dice
   * Validates expression, calculates result, saves to database, and broadcasts.
   * Under the per-user dice ceiling (SOCKET_CEILINGS). Answered through the
   * acknowledgement when one is passed (see ../ack.ts).
   * SECURITY: Uses server-authenticated socket.campaignId only.
   */
  socket.on('dice.roll', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }

      // Counted before anything else is checked, so a flood of rolls that
      // would be refused (malformed, or from a spectator) is held to the
      // same ceiling and does not draw an error apiece.
      if (!withinCeiling(socket, 'dice.roll', ack)) return;

      // Spectators watch: they may talk in chat, and they may not roll.
      if (!canRollDice(socket.role)) {
        refuse('Spectators cannot roll dice');
        return;
      }

      // The labels are stored with the roll and sent to every member, so
      // they are bounded here (validators/dice.ts).
      const parsed = DiceRollSchema.safeParse(data);
      if (!parsed.success) {
        refuse(parsed.error.issues[0]?.message ?? 'Dice expression required');
        return;
      }
      const { expression, characterName, purpose, secret } = parsed.data;

      // Validate expression syntax (without rolling)
      try {
        parseDiceExpression(expression);
      } catch (error) {
        if (error instanceof DiceParserError) {
          refuse(`Invalid dice expression: ${error.message}`);
          return;
        }
        throw error;
      }

      // Roll the dice
      const rollResult = rollDice(expression);

      // Get user information
      const user = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: { displayName: true },
      });

      if (!user) {
        refuse('User not found');
        return;
      }

      // SECURITY: Save ALL rolls to database (including secret rolls for audit)
      // Secret rolls are marked but still saved for GM oversight and dispute resolution
      const diceRoll = await prisma.diceRoll.create({
        data: {
          campaignId: socket.campaignId,
          userId: socket.userId!,
          expression,
          result: rollResult.total,
          breakdown: toJson(rollResult), // Store full RollResult
          characterName: characterName || null,
          purpose: purpose || null,
          secret: secret || false, // Mark as secret for visibility filtering
        },
      });

      // A roll is not a chat message, and no second row is written for it.
      //
      // One used to be: a Message of type DICE_ROLL whose metadata repeated the
      // expression, result, breakdown, character name, purpose and secret flag
      // that the DiceRoll row above already holds. Nothing ever read it — the
      // chat panel does not listen for rolls, and the history endpoint filters
      // the type out — so the rows accumulated with no way to reach or clear
      // them, and their presence starved the chat page they were filtered from.
      //
      // The copy was also the unsafe one: `secret` lived only inside unindexed
      // metadata, where the chat query does not filter on it. The DiceRoll table
      // is the record, with `secret` as a real column and a clear-history
      // watermark. Rolls are read from there, by the Dice panel.

      // Broadcast result with role-based filtering.
      //
      // `id` and the stored `rolledAt` are sent rather than a freshly generated
      // timestamp so that a roll arriving live and the same roll replayed from
      // history identify as one entry. Without the id the client keyed rolls by
      // user and broadcast time, which no stored roll could ever match.
      const rollData = {
        id: diceRoll.id,
        userId: socket.userId,
        userName: user.displayName,
        characterName: characterName || null,
        expression,
        result: rollResult.total,
        breakdown: rollResult,
        purpose: purpose || null,
        timestamp: diceRoll.rolledAt.toISOString(),
        secret: secret || false,
      };

      if (secret) {
        await sendSecretRoll(io, socket, socket.campaignId, rollData);
      } else {
        // Normal roll - broadcast to all campaign members
        io.to(socket.campaignId).emit('dice.rolled', rollData);
      }
      ack?.({ ok: true, id: diceRoll.id });

      logger.debug('dice.roll', { expression, result: rollResult.total, userId: socket.userId, secret: secret || false, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('dice.roll failed', { err: error });
      refuse(error instanceof DiceParserError ? `Dice roll failed: ${error.message}` : 'Failed to roll dice');
    }
  });

  /**
   * GM.SECRETCHECK - the GM rolls one expression per character, all secret.
   * Each is stored as a secret DiceRoll by the GM and sent as a secret
   * `dice.roll` is; the ack carries the results. Nothing is rolled or stored
   * unless every roll is valid and every character is the campaign's.
   */
  socket.on('gm.secretCheck', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId || !socket.userId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      // One event, however many rolls it carries (a 20-roll call counts once).
      if (!withinCeiling(socket, 'gm.secretCheck', ack)) return;
      // The GM check comes first, so a player learns nothing from how a payload is judged.
      if (socket.role !== 'GM') {
        refuse(GM_ONLY);
        return;
      }
      const rolls = (typeof data === 'object' && data !== null ? (data as { rolls?: unknown }).rolls : undefined);
      if (!Array.isArray(rolls) || rolls.length < 1 || rolls.length > MAX_SECRET_CHECK_ROLLS) {
        refuse(SECRET_CHECK_COUNT);
        return;
      }

      // Every roll is judged before any is rolled.
      const planned: { characterId: string; expression: string; characterName: string; purpose: string }[] = [];
      for (const item of rolls) {
        const r = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
        if (typeof r.characterId !== 'string' || !r.characterId) {
          refuse(NO_CHARACTER);
          return;
        }
        const parsed = DiceRollSchema.safeParse({ expression: r.expression, characterName: r.characterName, purpose: r.purpose });
        if (!parsed.success) {
          refuse(SECRET_CHECK_ROLL);
          return;
        }
        try {
          parseDiceExpression(parsed.data.expression);
        } catch (error) {
          if (error instanceof DiceParserError) {
            refuse(SECRET_CHECK_ROLL);
            return;
          }
          throw error;
        }
        planned.push({ characterId: r.characterId, expression: parsed.data.expression, characterName: parsed.data.characterName ?? '', purpose: parsed.data.purpose ?? '' });
      }

      const ids = [...new Set(planned.map((p) => p.characterId))];
      const owned = await prisma.character.count({ where: { id: { in: ids }, campaignId: socket.campaignId } });
      if (owned !== ids.length) {
        refuse(NO_CHARACTER);
        return;
      }
      const user = await prisma.user.findUnique({ where: { id: socket.userId }, select: { displayName: true } });
      if (!user) {
        refuse('User not found');
        return;
      }

      const results: { characterId: string; total: number; dice: number[]; breakdown: string }[] = [];
      for (const p of planned) {
        const rollResult = rollDice(p.expression);
        const diceRoll = await prisma.diceRoll.create({
          data: {
            campaignId: socket.campaignId,
            userId: socket.userId,
            expression: p.expression,
            result: rollResult.total,
            breakdown: toJson(rollResult),
            characterName: p.characterName || null,
            purpose: p.purpose || null,
            secret: true,
          },
        });
        await sendSecretRoll(io, socket, socket.campaignId, {
          id: diceRoll.id,
          userId: socket.userId,
          userName: user.displayName,
          characterName: p.characterName || null,
          expression: p.expression,
          result: rollResult.total,
          breakdown: rollResult,
          purpose: p.purpose || null,
          timestamp: diceRoll.rolledAt.toISOString(),
          secret: true,
        });
        results.push({
          characterId: p.characterId,
          total: rollResult.total,
          dice: rollResult.rolls.flatMap((t) => (t.type === 'dice' ? (t.kept ?? t.results ?? []) : [])),
          breakdown: rollResult.formula,
        });
      }
      (ack as ((a: unknown) => void) | null)?.({ ok: true, results });
      logger.debug('gm.secretCheck', { rolls: planned.length, userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('gm.secretCheck failed', { err: error });
      refuse('Failed to roll the secret check');
    }
  });

  /**
   * DICE.CLEAR_HISTORY - GM clears dice roll history (GM-only).
   */
  socket.on('dice.clearHistory', async (ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'dice.clearHistory', ack)) return;

      // Who is running the game, not who owns the campaign. These are separate
      // facts — `Campaign.ownerId` never moves, while the GM seat can — and they
      // only coincide in a campaign whose creator still runs it. Reading
      // ownership here refused the actual GM after a handover and let the former
      // GM, now a player, keep clearing the panel for everyone.
      if (socket.role !== 'GM') {
        refuse('Only the GM can clear roll history');
        return;
      }

      // Record the clear so it survives a reload. This used to be broadcast
      // only, which was invisible while history lived in browser memory — but
      // now that the panel loads from the database, a clear that changed
      // nothing server-side would undo itself on the next refresh.
      //
      // A watermark, not a delete: secret rolls are stored deliberately for
      // audit, and clearing the panel should not destroy that record.
      await prisma.campaign.update({
        where: { id: socket.campaignId },
        data: { rollHistoryClearedAt: new Date() },
      });

      // Broadcast to all campaign members (including GM)
      io.to(socket.campaignId).emit('dice.historyCleared');
      ack?.({ ok: true });

      logger.info('dice.clearHistory', { campaignId: socket.campaignId, userId: socket.userId });
    } catch (error) {
      logger.error('dice.clearHistory failed', { err: error });
      refuse('Failed to clear dice history');
    }
  });
}
