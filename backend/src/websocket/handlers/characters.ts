// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

// ============================================
// Character handlers: character.hp.update, character.hp.temporary,
// character.hitdice.spend, character.rest, character.equip,
// character.pack.open, character.ammo.recover, gm.notice
// Players act on their own characters; the GM may act on any of them.
// ============================================

import { Server } from 'socket.io';
import type { Character } from '@prisma/client';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { toJson } from '../../utils/prisma-json';
import { sheetAsRead } from '../../legacy/sheetConversion';
import type { FifthEditionCharacterData } from '../../validators/game-systems/fifthEdition.schema';
import { withinCeiling } from '../shared';
import { ackFrom, refuseRequest } from '../ack';
import { z } from 'zod';
import { takeRest } from '../../services/rest';
import {
  COMPENDIUM_ITEM_NOT_FOUND, GIVE_NAME, GIVE_NOTES, GIVE_ONE_OF, GIVE_QUANTITY, equipItem, giveItem, openPack, recoverAmmo, type GiveTarget,
} from '../../services/inventory';
import { GM_ONLY, NOTICE_LENGTH, NO_CHARACTER, sendNotice } from '../../services/gmNotice';
import { getState } from '../initiativeState';
import { resendInitiative } from './initiative';
import { viewerOf } from '../../services/actionMessages';
import { announceMessage } from './actions';
import { emitCharacterUpdated } from '../utils';
import { characterInCampaign } from '../../utils/characterCampaign';
import { applyHitPointChange, grantTemporaryHitPoints } from '../../utils/rules/hitPoints';
import { CharacterTemporaryHpSchema, TEMPORARY_HP_PAYLOAD_REFUSAL } from '../../validators/characters';

/** The largest change of hit points one event may make, either way. */
const MAX_HP_DELTA = 100_000;

const CharacterRestSchema = z.object({
  characterIds: z.array(z.string().min(1).max(100)).min(1, 'characterIds is required').max(50),
  kind: z.enum(['short', 'long']),
});

const CharacterEquipSchema = z.object({
  characterId: z.string().min(1).max(100),
  itemId: z.string().min(1).max(64),
  slot: z.enum(['main', 'off', 'both', 'armor', 'ammo']).nullable(),
});

const CharacterPackOpenSchema = z.object({
  characterId: z.string().min(1).max(100),
  itemId: z.string().min(1).max(64),
});

const CharacterAmmoRecoverSchema = z.object({
  characterId: z.string().min(1).max(100),
});

/**
 * Tell the table a sheet changed through an inventory event: the sheet as
 * each member may read it, and the fight's state when one is on (the spend
 * may have changed with it). The change stands whatever happens here.
 */
async function sheetChanged(campaignId: string, characterId: string, userId: string): Promise<void> {
  try {
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (character) await emitCharacterUpdated(campaignId, character, { characterId, userId, tokensChanged: false });
    if (getState(campaignId).active) await resendInitiative(campaignId);
  } catch (err) {
    logger.warn('Inventory change not broadcast; the change stands', { err, characterId });
  }
}

/** The parts of a character blob this handler touches — see `charData` below. */
interface HpBlock {
  current?: unknown;
  maximum?: unknown;
  temporary?: unknown;
}
/** One hit dice pool as it sits in the blob, read loosely: only `remaining` is touched. */
type HitDiceEntry = Partial<Record<keyof NonNullable<FifthEditionCharacterData['hitDice']>[number], unknown>>;
interface CharacterHitDiceData {
  hitDice?: unknown;
  [key: string]: unknown;
}
interface CharacterHpData {
  /** 5E and Fantasy d20 keep HP here. */
  hp?: HpBlock;
  /** Horror d100 keeps it here. */
  hitPoints?: HpBlock;
  [key: string]: unknown;
}

type Refusal = { error: string };

/**
 * The sheet with `delta` applied to its current hit points, clamped to 0 and
 * the maximum, or why it cannot be. In 5E and Fantasy d20 damage takes
 * temporary hit points first and only the rest comes off current hit points;
 * healing does not restore them (both rulebooks say so). A Horror d100
 * character's hit points stop at the maximum alone: damage takes them below 0.
 *
 * Only the HP-bearing corners of the sheet are described: the blob is a full
 * character in one of several systems, and nothing else is read or written.
 * The values stay `unknown` until the checks below establish they are numbers.
 */
export function applyHpDelta(
  gameSystem: string | null,
  stored: unknown,
  delta: number
): { data: CharacterHpData; hp: { current: number; max: number; temp: number } } | Refusal {
  const charData = stored as CharacterHpData;
  switch (gameSystem) {
    case 'FIFTH_EDITION':
    case 'FANTASY_D20': {
      if (!charData?.hp || typeof charData.hp.maximum !== 'number') {
        return { error: 'Esse personagem não controla PV.' };
      }
      const max = charData.hp.maximum;
      const heldTemp = typeof charData.hp.temporary === 'number' ? Math.max(0, charData.hp.temporary) : 0;
      const { current, temp } = applyHitPointChange(
        { current: typeof charData.hp.current === 'number' ? charData.hp.current : max, max, temp: heldTemp },
        delta,
      );
      const hp = temp !== heldTemp ? { ...charData.hp, current, temporary: temp } : { ...charData.hp, current };
      return { data: { ...charData, hp }, hp: { current, max, temp } };
    }
    case 'HORROR_D100': {
      if (!charData?.hitPoints || typeof charData.hitPoints.maximum !== 'number') {
        return { error: 'Esse personagem não controla PV.' };
      }
      const max = charData.hitPoints.maximum;
      // No lowest: a character can lose more hit points than they have, and
      // the number below 0 is kept track of (open d100 rules, p. 14, Hit
      // Points). Healing stops at the maximum.
      const current = Math.min(max, (typeof charData.hitPoints.current === 'number' ? charData.hitPoints.current : max) + delta);
      return {
        data: { ...charData, hitPoints: { ...charData.hitPoints, current } },
        hp: { current, max, temp: 0 },
      };
    }
    default:
      return { error: 'Este sistema de jogo não controla PV.' };
  }
}

/** The sheet with one die spent from the pool at `index`, or why it cannot be. */
function spendHitDie(stored: unknown, index: number): { data: CharacterHitDiceData } | Refusal {
  const charData = stored as CharacterHitDiceData;
  const pools = Array.isArray(charData?.hitDice) ? (charData.hitDice as HitDiceEntry[]) : null;
  if (!pools || !pools[index]) return { error: 'Não há reserva de dados de vida nessa posição.' };
  const remaining = typeof pools[index].remaining === 'number' ? (pools[index].remaining as number) : 0;
  if (remaining <= 0) return { error: 'Não restam dados de vida para gastar.' };
  const hitDice = pools.map((entry, at) => (at === index ? { ...entry, remaining: remaining - 1 } : entry));
  return { data: { ...charData, hitDice } };
}

/**
 * The sheet with `temporary` temporary hit points in place of any it had, or
 * why it cannot be. They never add together (grantTemporaryHitPoints): the
 * character keeps the ones it has, which changes nothing, or takes these.
 */
function takeTemporaryHp(
  gameSystem: string | null,
  stored: unknown,
  temporary: number
): { data: CharacterHpData; hp: { current: number; max: number; temp: number } } | Refusal {
  if (gameSystem === 'HORROR_D100') return { error: 'Fichas de Horror d100 não têm PV temporários.' };
  const charData = stored as CharacterHpData;
  const heldTemp = typeof charData?.hp?.temporary === 'number' ? charData.hp.temporary : 0;
  const grant = grantTemporaryHitPoints(heldTemp, temporary, gameSystem);
  if (!grant) return { error: 'Este sistema de jogo não controla PV temporários.' };
  if (!charData?.hp || typeof charData.hp.maximum !== 'number') {
    return { error: 'Esse personagem não controla PV.' };
  }
  const max = charData.hp.maximum;
  const current = typeof charData.hp.current === 'number' ? charData.hp.current : max;
  return { data: { ...charData, hp: { ...charData.hp, temporary: grant.take } }, hp: { current, max, temp: grant.take } };
}

/**
 * The character `characterId` names, when this socket may change it: one of
 * its campaign's, as the REST routes judge it, and the socket's own unless
 * it is the GM's; a spectator changes none. Otherwise the refusal is sent,
 * `notYours` to a player on someone else's character, and the answer is null.
 */
async function characterToChange(socket: AuthenticatedSocket, campaignId: string, characterId: string, notYours: string): Promise<Character | null> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) {
    socket.emit('error', { message: 'Personagem não encontrado.' });
    return null;
  }
  if (!(await characterInCampaign(character, campaignId))) {
    socket.emit('error', { message: 'Esse personagem não está nesta campanha.' });
    return null;
  }
  // A spectator is watching, not playing: not even a character they own,
  // since a token bound to it follows the sheet on every screen. The GM
  // can still cover for them.
  if (socket.role === 'SPECTATOR') {
    socket.emit('error', { message: 'Espectadores não podem alterar personagens.' });
    return null;
  }
  if (character.userId !== socket.userId && socket.role !== 'GM') {
    socket.emit('error', { message: notYours });
    return null;
  }
  return character;
}

export function registerCharacterHandlers(io: Server, socket: AuthenticatedSocket): void {
  socket.on('character.hp.update', async (data: { characterId: string; delta: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Você não está em uma campanha.' });
        return;
      }

      // Each change holds the character's row for a transaction, so a burst
      // of them would hold every database connection the instance has.
      if (!withinCeiling(socket, 'character.hp.update')) return;

      const { characterId, delta } = data;

      if (!characterId || typeof delta !== 'number' || !Number.isFinite(delta)) {
        socket.emit('error', { message: 'Informe o personagem e a variação (um número).' });
        return;
      }
      // Sheets store whole hit points: half a point was stored as 7.5, which
      // the sheet's schema then refused on every save.
      if (!Number.isInteger(delta) || Math.abs(delta) > MAX_HP_DELTA) {
        socket.emit('error', { message: `A variação precisa ser um número inteiro de pontos de vida, de -${MAX_HP_DELTA} a ${MAX_HP_DELTA}.` });
        return;
      }

      // The character's owner, or the GM.
      const character = await characterToChange(socket, socket.campaignId, characterId, 'Você não tem permissão para alterar os PV deste personagem.');
      if (!character) return;

      // Read and written under the row's lock, afresh. Reading before the
      // lock and writing the whole sheet back undid any save that landed in
      // between; a save arriving now waits for this one instead.
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Personagem não encontrado.' } as const;
        // A Horror d100 sheet still in the shape before 1.7.0 is converted,
        // and stored converted with its hit points changed.
        const applied = applyHpDelta(character.gameSystem, sheetAsRead(character.gameSystem, fresh.data), delta);
        if ('error' in applied) return applied;
        await tx.character.update({ where: { id: characterId }, data: { data: toJson(applied.data) } });
        return applied;
      });
      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }
      const { current, max, temp } = outcome.hp;

      // Broadcast updated HP to all campaign members
      io.to(socket.campaignId!).emit('character.hp.updated', {
        characterId,
        hp: { current, max, temp },
      });

    } catch (error) {
      logger.error('character.hp.update failed', { err: error });
      socket.emit('error', { message: 'Não foi possível atualizar os PV do personagem.' });
    }
  });

  /**
   * CHARACTER.HP.TEMPORARY: the character takes `temporary` temporary hit
   * points in place of any it has. Temporary hit points never add together,
   * and a character that has some chooses between keeping those, which
   * changes nothing, and taking the new ones, which is this. Same permission
   * rule as HP.
   */
  socket.on('character.hp.temporary', async (data: unknown) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Você não está em uma campanha.' });
        return;
      }

      if (!withinCeiling(socket, 'character.hp.temporary')) return;

      const parsed = CharacterTemporaryHpSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? TEMPORARY_HP_PAYLOAD_REFUSAL });
        return;
      }
      const { characterId, temporary } = parsed.data;

      const character = await characterToChange(socket, socket.campaignId, characterId, 'Você não tem permissão para alterar os PV deste personagem.');
      if (!character) return;

      // Under the row's lock and read afresh, for the reason given for hit
      // points above.
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Personagem não encontrado.' } as const;
        const taken = takeTemporaryHp(character.gameSystem, fresh.data, temporary);
        if ('error' in taken) return taken;
        await tx.character.update({ where: { id: characterId }, data: { data: toJson(taken.data) } });
        return taken;
      });
      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

      io.to(socket.campaignId).emit('character.hp.updated', { characterId, hp: outcome.hp });
    } catch (error) {
      logger.error('character.hp.temporary failed', { err: error });
      socket.emit('error', { message: 'Não foi possível atualizar os PV do personagem.' });
    }
  });

  /**
   * CHARACTER.HITDICE.SPEND — spend one 5E hit die.
   *
   * The roll itself goes through `dice.roll` like every other roll; this only
   * decrements the pool, so the count cannot be inflated by a client that
   * simply declines to send it. Same permission rule as HP: the character's
   * owner, or the GM covering for an absent player.
   */
  socket.on('character.hitdice.spend', async (data: { characterId: string; index: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Você não está em uma campanha.' });
        return;
      }

      if (!withinCeiling(socket, 'character.hitdice.spend')) return;

      const { characterId, index } = data ?? {};

      if (!characterId || typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
        socket.emit('error', { message: 'Informe o personagem e a posição (um número inteiro).' });
        return;
      }

      // As for hit points: the character's owner, or the GM.
      const character = await characterToChange(socket, socket.campaignId, characterId, 'Você não tem permissão para gastar os dados de vida deste personagem.');
      if (!character) return;

      if (character.gameSystem !== 'FIFTH_EDITION') {
        socket.emit('error', { message: 'Este sistema de jogo não controla dados de vida.' });
        return;
      }

      // Under the row's lock and read afresh, for the reason given for hit
      // points above.
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Personagem não encontrado.' } as const;
        const spent = spendHitDie(fresh.data, index);
        if ('error' in spent) return spent;
        return { updated: await tx.character.update({ where: { id: characterId }, data: { data: toJson(spent.data) } }) };
      });
      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }
      const updated = outcome.updated;

      // The sheet blob changed, so this goes out as `character.updated` — the
      // event an open character sheet already refreshes on — rather than a
      // narrow one of its own that nothing would listen to. No token art or
      // name changed, so nothing needs to repaint the map.
      // The sheet as each member may read it: the GM's Notes to the GM alone.
      await emitCharacterUpdated(socket.campaignId, updated, {
        characterId,
        userId: socket.userId,
        tokensChanged: false,
      });

    } catch (error) {
      logger.error('character.hitdice.spend failed', { err: error });
      socket.emit('error', { message: 'Não foi possível gastar o dado de vida.' });
    }
  });

  /**
   * CHARACTER.REST - a short or long rest for the named characters (a
   * player's own; the GM's any). One card goes out as `chat.message`; the
   * answer is `{ ok, messageId? , error? }`.
   */
  socket.on('character.rest', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    try {
      if (!socket.campaignId || !socket.userId) {
        refuseRequest(socket, ack, 'Você não está em uma campanha.');
        return;
      }
      if (!withinCeiling(socket, 'character.rest', ack)) return;
      const parsed = CharacterRestSchema.safeParse(data);
      if (!parsed.success) {
        refuseRequest(socket, ack, parsed.error.issues[0]?.message ?? 'Pedido inválido.');
        return;
      }
      const outcome = await takeRest(socket.campaignId, viewerOf(socket.role, socket.userId), parsed.data.characterIds, parsed.data.kind);
      if (!outcome.ok) {
        refuseRequest(socket, ack, outcome.error);
        return;
      }
      // The rest is stored: a failure to tell the table must not read as a failed rest.
      try {
        await announceMessage(io, socket.campaignId, outcome.messageId, outcome.card);
      } catch (err) {
        logger.warn('character.rest: card not announced; the rest stands', { err, messageId: outcome.messageId });
      }
      (ack as ((a: unknown) => void) | null)?.({ ok: true, messageId: outcome.messageId });
    } catch (error) {
      logger.error('character.rest failed', { err: error });
      refuseRequest(socket, ack, 'Não foi possível fazer o descanso.');
    }
  });

  /**
   * CHARACTER.EQUIP - put an inventory item in a body slot, or back in the
   * backpack (`slot` null), as the hand rules allow; the armour class follows.
   */
  socket.on('character.equip', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    try {
      if (!socket.campaignId || !socket.userId) {
        refuseRequest(socket, ack, 'Você não está em uma campanha.');
        return;
      }
      if (!withinCeiling(socket, 'character.equip', ack)) return;
      const parsed = CharacterEquipSchema.safeParse(data);
      if (!parsed.success) {
        refuseRequest(socket, ack, parsed.error.issues[0]?.message ?? 'Pedido inválido.');
        return;
      }
      const { characterId, itemId, slot } = parsed.data;
      const outcome = await equipItem(socket.campaignId, viewerOf(socket.role, socket.userId), characterId, itemId, slot);
      if (!outcome.ok) {
        refuseRequest(socket, ack, outcome.error);
        return;
      }
      await sheetChanged(socket.campaignId, characterId, socket.userId);
      (ack as ((a: unknown) => void) | null)?.({ ok: true, ac: outcome.ac, acUnknown: outcome.acUnknown });
    } catch (error) {
      logger.error('character.equip failed', { err: error });
      refuseRequest(socket, ack, 'Não foi possível equipar o item.');
    }
  });

  /**
   * CHARACTER.PACK.OPEN - replace one pack in the inventory by its items.
   */
  socket.on('character.pack.open', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    try {
      if (!socket.campaignId || !socket.userId) {
        refuseRequest(socket, ack, 'Você não está em uma campanha.');
        return;
      }
      if (!withinCeiling(socket, 'character.pack.open', ack)) return;
      const parsed = CharacterPackOpenSchema.safeParse(data);
      if (!parsed.success) {
        refuseRequest(socket, ack, parsed.error.issues[0]?.message ?? 'Pedido inválido.');
        return;
      }
      const { characterId, itemId } = parsed.data;
      const outcome = await openPack(socket.campaignId, viewerOf(socket.role, socket.userId), characterId, itemId);
      if (!outcome.ok) {
        refuseRequest(socket, ack, outcome.error);
        return;
      }
      await sheetChanged(socket.campaignId, characterId, socket.userId);
      (ack as ((a: unknown) => void) | null)?.({ ok: true });
    } catch (error) {
      logger.error('character.pack.open failed', { err: error });
      refuseRequest(socket, ack, 'Não foi possível abrir o pacote.');
    }
  });

  /**
   * CHARACTER.AMMO.RECOVER - outside a fight, pick up half the ammunition shot
   * since the last time (the sheet's `ammoToRecover`), with a chat line.
   */
  socket.on('character.ammo.recover', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    try {
      if (!socket.campaignId || !socket.userId) {
        refuseRequest(socket, ack, 'Você não está em uma campanha.');
        return;
      }
      if (!withinCeiling(socket, 'character.ammo.recover', ack)) return;
      const parsed = CharacterAmmoRecoverSchema.safeParse(data);
      if (!parsed.success) {
        refuseRequest(socket, ack, parsed.error.issues[0]?.message ?? 'Pedido inválido.');
        return;
      }
      const { characterId } = parsed.data;
      const outcome = await recoverAmmo(socket.campaignId, viewerOf(socket.role, socket.userId), characterId);
      if (!outcome.ok) {
        refuseRequest(socket, ack, outcome.error);
        return;
      }
      await sheetChanged(socket.campaignId, characterId, socket.userId);
      if (outcome.messageId) {
        try {
          await announceMessage(io, socket.campaignId, outcome.messageId, outcome.card);
        } catch (err) {
          logger.warn('character.ammo.recover: card not announced; the recovery stands', { err, messageId: outcome.messageId });
        }
      }
      (ack as ((a: unknown) => void) | null)?.({ ok: true, recovered: outcome.recovered });
    } catch (error) {
      logger.error('character.ammo.recover failed', { err: error });
      refuseRequest(socket, ack, 'Não foi possível recolher a munição.');
    }
  });

  /**
   * CHARACTER.ITEM.GIVE - the GM gives a character an item, from the
   * compendium (`ref`) or typed free (`name`, `notes`), into the backpack; the
   * owner gets a "Você recebeu" notice when they are a player at the table.
   * Answered `{ ok: true, noticeSent }` or `{ ok: false, error }`.
   */
  socket.on('character.item.give', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    try {
      if (!socket.campaignId || !socket.userId) {
        refuseRequest(socket, ack, 'Você não está em uma campanha.');
        return;
      }
      if (!withinCeiling(socket, 'character.item.give', ack)) return;
      // The GM check comes first, so a player learns nothing from how a payload is judged.
      if (socket.role !== 'GM') {
        refuseRequest(socket, ack, GM_ONLY);
        return;
      }
      const body = (typeof data === 'object' && data !== null ? data : {}) as {
        characterId?: unknown; ref?: unknown; name?: unknown; notes?: unknown; quantity?: unknown;
      };
      if (typeof body.characterId !== 'string' || !body.characterId) {
        refuseRequest(socket, ack, NO_CHARACTER);
        return;
      }
      if (typeof body.quantity !== 'number') {
        refuseRequest(socket, ack, GIVE_QUANTITY);
        return;
      }
      const hasRef = body.ref !== undefined && body.ref !== null;
      const hasName = body.name !== undefined && body.name !== null;
      if (hasRef === hasName) {
        refuseRequest(socket, ack, GIVE_ONE_OF);
        return;
      }
      let target: GiveTarget;
      if (hasRef) {
        const ref = body.ref as { bookId?: unknown; slug?: unknown };
        if (typeof ref !== 'object' || typeof ref.bookId !== 'string' || typeof ref.slug !== 'string') {
          refuseRequest(socket, ack, COMPENDIUM_ITEM_NOT_FOUND);
          return;
        }
        target = { ref: { bookId: ref.bookId, slug: ref.slug } };
      } else {
        if (typeof body.name !== 'string') {
          refuseRequest(socket, ack, GIVE_NAME);
          return;
        }
        if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') {
          refuseRequest(socket, ack, GIVE_NOTES);
          return;
        }
        target = { name: body.name, ...(typeof body.notes === 'string' ? { notes: body.notes } : {}) };
      }
      const outcome = await giveItem(socket.campaignId, viewerOf(socket.role, socket.userId), body.characterId, target, body.quantity);
      if (!outcome.ok) {
        refuseRequest(socket, ack, outcome.error);
        return;
      }
      await sheetChanged(socket.campaignId, body.characterId, socket.userId);
      (ack as ((a: unknown) => void) | null)?.({ ok: true, noticeSent: outcome.noticeSent });
    } catch (error) {
      logger.error('character.item.give failed', { err: error });
      refuseRequest(socket, ack, 'Failed to give the item');
    }
  });

  /**
   * GM.NOTICE - the GM sends the owner of a character a private notice (a
   * stored whisper that pops up over their map). Answered `{ ok: true }` or
   * `{ ok: false, error }`.
   */
  socket.on('gm.notice', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    try {
      if (!socket.campaignId || !socket.userId) {
        refuseRequest(socket, ack, 'Você não está em uma campanha.');
        return;
      }
      if (!withinCeiling(socket, 'gm.notice', ack)) return;
      // The GM check comes first, so a player learns nothing from how a payload is judged.
      if (socket.role !== 'GM') {
        refuseRequest(socket, ack, GM_ONLY);
        return;
      }
      const body = (typeof data === 'object' && data !== null ? data : {}) as { characterId?: unknown; text?: unknown };
      if (typeof body.characterId !== 'string' || !body.characterId) {
        refuseRequest(socket, ack, NO_CHARACTER);
        return;
      }
      if (typeof body.text !== 'string') {
        refuseRequest(socket, ack, NOTICE_LENGTH);
        return;
      }
      const outcome = await sendNotice(socket.campaignId, viewerOf(socket.role, socket.userId), body.characterId, body.text);
      if (!outcome.ok) {
        refuseRequest(socket, ack, outcome.error);
        return;
      }
      (ack as ((a: unknown) => void) | null)?.({ ok: true });
    } catch (error) {
      logger.error('gm.notice failed', { err: error });
      refuseRequest(socket, ack, 'Failed to send the notice');
    }
  });
}
