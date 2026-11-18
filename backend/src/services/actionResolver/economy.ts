/**
 * The turn economy on the server: whether an action the bar resolves may be
 * taken with what its combatant has left this turn, spending it when it may,
 * and giving it back on an undo.
 *
 * It applies only while the campaign's fight is active and the acting token
 * is in the order; otherwise nothing is checked or spent. The read-modify-
 * write of a combatant's spending runs under the campaign's combat lock, so
 * two actions arriving together cannot both spend the one attack left.
 */

import type { Token } from '../../websocket/shared';
import type { ActionOption } from '../../rules/actions/catalogue';
import type { UndoRecord } from '../../rules/actions/actionCard';
import { metresToFeet } from '../../rules/actions/rangeText';
import { getState, setState, withCombatLock, type CombatState } from '../../websocket/initiativeState';
import { resendInitiative } from '../../websocket/handlers/initiative';
import { REFUSAL_MESSAGES, applySpend, canSpend, movementBudgetFeet, type TurnSpend } from '../../utils/turnEconomy';
import type { Sheet } from './common';

/** The ack text for a spell whose casting time is a minute or more, refused in a fight. */
export const TOO_LONG_FOR_COMBAT = 'Leva tempo demais para conjurar em combate.';

/**
 * What an action spent of a combatant's turn, kept on its card so the GM's
 * undo can give it back. `reaction`: spent off turn, as a reaction (an
 * opportunity attack included).
 */
export type EconomyUndo = NonNullable<UndoRecord['economy']>;

/** Speed the movement budget counts from when nothing on the sheet or stat block reads as one. */
const DEFAULT_SPEED_FEET = 30;

/**
 * How many weapon attacks one Attack action allows. A creature with no
 * sheet (a monster) is trusted with its Multiattack: it may go on attacking
 * once it has spent its action on an attack.
 */
export function attacksPerActionFor(sheet: Sheet | null): number {
  return sheet ? 1 : 100;
}

/** The token's speed in feet: its sheet's, or the first number of its stat block's (metres). */
export function speedFeetFor(token: Token, sheet: Sheet | null): number {
  if (sheet) return typeof sheet.speed === 'number' ? sheet.speed : DEFAULT_SPEED_FEET;
  const text = (token.statBlock as { speed?: unknown } | null | undefined)?.speed;
  const m = typeof text === 'string' ? text.match(/\d+(?:[.,]\d+)?/) : null;
  return m ? metresToFeet(parseFloat(m[0].replace(',', '.'))) : DEFAULT_SPEED_FEET;
}

/** Whether the turn economy binds this token: the fight is on and it is in the order. */
function binds(state: CombatState, tokenId: string): boolean {
  return state.active && state.combatants.some((c) => c.tokenId === tokenId);
}

/**
 * Check the option against what the actor has left this turn and spend it.
 * No-op when the economy does not bind the actor. Run it once every other
 * reason to refuse the action has passed, so a refused resolve spends nothing.
 */
export async function checkAndSpend(
  campaignId: string,
  actor: Token,
  option: ActionOption,
  opts: { attacksPerAction: number; oncePerTurnKey?: string },
): Promise<{ ok: true; economy?: EconomyUndo } | { ok: false; error: string }> {
  const outcome = await withCombatLock(campaignId, (state): { ok: true; economy?: EconomyUndo } | { ok: false; error: string } => {
    if (!binds(state, actor.id)) return { ok: true };
    if (option.combatUnavailable) return { ok: false, error: TOO_LONG_FOR_COMBAT };
    const before = state.spend[actor.id];
    const yourTurn = state.currentTokenId === actor.id;
    const check = canSpend(before, option.cost, { yourTurn, meleeWeapon: option.meleeWeapon === true, oncePerTurnKey: opts.oncePerTurnKey });
    if (!check.ok) return { ok: false, error: REFUSAL_MESSAGES[check.refusal] };
    const next = applySpend(before, check.as, opts);
    if (option.id === 'common:dash') next.dashes += 1;
    setState(campaignId, { ...state, spend: { ...state.spend, [actor.id]: next } });
    const economy: EconomyUndo = { campaignId, tokenId: actor.id, round: state.round, before };
    if (!yourTurn) economy.reaction = true;
    return { ok: true, economy };
  });
  if (outcome.ok && outcome.economy) await resendInitiative(campaignId);
  return outcome;
}

/**
 * Give back what an action spent, when the turn it was spent in is still
 * going: the same round, and the same combatant acting (or, for a reaction,
 * only the same round). Otherwise the economy is left as it is. Also used to
 * take back a spend whose action then failed to be stored.
 */
export async function giveBack(economy: EconomyUndo): Promise<void> {
  const { campaignId, tokenId } = economy;
  const changed = await withCombatLock(campaignId, (state) => {
    const now = state.spend[tokenId];
    if (!binds(state, tokenId) || !now || state.round !== economy.round) return false;
    let restored: TurnSpend;
    if (economy.reaction) restored = { ...now, reaction: economy.before.reaction };
    else if (state.currentTokenId === tokenId) restored = { ...economy.before, oncePerTurn: [...economy.before.oncePerTurn] };
    else return false;
    setState(campaignId, { ...state, spend: { ...state.spend, [tokenId]: restored } });
    return true;
  });
  if (changed) await resendInitiative(campaignId);
}

/** The actor's turn as the bar shows it. */
export interface CombatTurn {
  yourTurn: boolean;
  spend: TurnSpend;
  attacksPerAction: number;
  budgetFeet: number;
}

/** What the bar shows of the actor's turn, when the economy binds it. */
export function combatFor(campaignId: string, token: Token, sheet: Sheet | null): CombatTurn | undefined {
  const state = getState(campaignId);
  const spend = state.spend[token.id];
  if (!binds(state, token.id) || !spend) return undefined;
  return {
    yourTurn: state.currentTokenId === token.id,
    spend: { ...spend, oncePerTurn: [...spend.oncePerTurn] },
    attacksPerAction: attacksPerActionFor(sheet),
    budgetFeet: movementBudgetFeet(speedFeetFor(token, sheet), spend),
  };
}
