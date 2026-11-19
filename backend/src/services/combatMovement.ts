/**
 * Counting the metres the combatant whose turn it is walks.
 *
 * A move on the map adds its distance to the mover's `movedFeet` when the
 * fight is active and the token is the one acting; anyone else's walking is
 * not counted. Going over the turn's budget (speed, doubled by each Dash) is
 * never a block: the GM is whispered once that turn and the move stands.
 */

import { prisma } from '../config/database';
import logger from '../utils/logger';
import { footprintDistanceFeet } from '../utils/areaGeometry';
import { feetToMetresLabel, movementBudgetFeet } from '../utils/turnEconomy';
import type { Token } from '../websocket/shared';
import { getState, setState, withCombatLock } from '../websocket/initiativeState';
import { resendInitiative } from '../websocket/handlers/initiative';
import { whisperGm } from './gmWhisper';
import { speedFeetFor } from './actionResolver/economy';
import type { Sheet } from './actionResolver/common';

export { speedFeetFor };

interface Square {
  x: number;
  y: number;
}

/**
 * Add the walk from `from` to `to` to the token's turn, when it is the
 * combatant acting. Call it once the move is stored; a failure here is logged
 * and never undoes or delays the move.
 */
export async function recordMove(
  campaignId: string,
  mapId: string,
  token: Token,
  from: Square,
  to: Square,
  map: { feetPerSquare: number; diagonalRule: string },
): Promise<void> {
  try {
    const before = getState(campaignId);
    if (!before.active || before.currentTokenId !== token.id || !before.combatants.some((c) => c.tokenId === token.id)) return;
    const feet = footprintDistanceFeet({ ...from, width: 1, height: 1 }, { ...to, width: 1, height: 1 }, map);
    if (feet <= 0) return;

    const character = token.characterId ? await prisma.character.findUnique({ where: { id: token.characterId }, select: { data: true } }) : null;
    const speed = speedFeetFor(token, character ? (character.data as unknown as Sheet) : null);

    const warn = await withCombatLock(campaignId, (state) => {
      const spend = state.spend[token.id];
      // The turn may have passed on while the sheet was being read.
      if (!state.active || state.currentTokenId !== token.id || !spend) return null;
      const movedFeet = spend.movedFeet + feet;
      const budget = movementBudgetFeet(speed, spend);
      const over = !spend.overBudgetWarned && movedFeet > budget;
      setState(campaignId, {
        ...state,
        spend: { ...state.spend, [token.id]: { ...spend, movedFeet, overBudgetWarned: spend.overBudgetWarned || over } },
      });
      return over ? `${token.name} andou ${feetToMetresLabel(movedFeet)} m de ${feetToMetresLabel(budget)} m neste turno.` : '';
    });
    if (warn === null) return;
    await resendInitiative(campaignId);
    if (warn) await whisperGm(campaignId, warn);
  } catch (err) {
    logger.warn('Counting a combatant\'s movement failed; the move stands', { err, campaignId, mapId, tokenId: token.id });
  }
}
