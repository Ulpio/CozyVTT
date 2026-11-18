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
import type { EconomySpent, UndoRecord } from '../../rules/actions/actionCard';
import { metresToFeet } from '../../rules/actions/rangeText';
import { getState, setState, withCombatLock, type CombatState } from '../../websocket/initiativeState';
import { resendInitiative } from '../../websocket/handlers/initiative';
import { REFUSAL_MESSAGES, applySpend, canSpend, movementBudgetFeet, type TurnSpend } from '../../utils/turnEconomy';
import type { Sheet } from './common';

/** The ack text for a spell whose casting time is a minute or more, refused in a fight. */
export const TOO_LONG_FOR_COMBAT = 'Leva tempo demais para conjurar em combate.';

/** The ack text for attacks that follow the Attack action (Flurry of Blows) taken before it. */
export const NEEDS_ATTACK_ACTION = 'Use a ação Atacar antes.';

/** What an action spent of a combatant's turn, kept on its card so the GM's undo can give it back. */
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
  const m = typeof text === 'string' ? text.match(/(\d+(?:[.,]\d+)?)\s*([a-zà-ú]*)/i) : null;
  if (!m) return DEFAULT_SPEED_FEET;
  const n = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Feet as written ("30 ft.", "9 pés"); metres (or no unit) are converted.
  return unit === 'ft' || unit === 'pe' || unit === 'pes' ? n : metresToFeet(n);
}

/** Whether the turn economy binds this token: the fight is on and it is in the order. */
function binds(state: CombatState, tokenId: string): boolean {
  return state.active && state.combatants.some((c) => c.tokenId === tokenId);
}

/**
 * Check the option against what the actor has left this turn and spend it.
 * No-op when the economy does not bind the actor. Run it once every other
 * reason to refuse the action has passed, so a refused resolve spends nothing.
 * `requiresAttackAction` refuses it until the actor has taken the Attack
 * action this turn; `grantExtraAction` gives the actor an extra action
 * (Action Surge) along with the spend.
 */
export async function checkAndSpend(
  campaignId: string,
  actor: Token,
  option: ActionOption,
  opts: { attacksPerAction: number; oncePerTurnKey?: string; requiresAttackAction?: boolean; grantExtraAction?: boolean },
): Promise<{ ok: true; economy?: EconomyUndo } | { ok: false; error: string }> {
  const outcome = await withCombatLock(campaignId, (state): { ok: true; economy?: EconomyUndo } | { ok: false; error: string } => {
    if (!binds(state, actor.id)) return { ok: true };
    if (option.combatUnavailable) return { ok: false, error: TOO_LONG_FOR_COMBAT };
    const before = state.spend[actor.id];
    const yourTurn = state.currentTokenId === actor.id;
    const check = canSpend(before, option.cost, { yourTurn, meleeWeapon: option.meleeWeapon === true, oncePerTurnKey: opts.oncePerTurnKey });
    if (!check.ok) return { ok: false, error: REFUSAL_MESSAGES[check.refusal] };
    if (opts.requiresAttackAction && !before.attackActionTaken) return { ok: false, error: NEEDS_ATTACK_ACTION };
    const next = applySpend(before, check.as, opts);
    const spent: EconomySpent = { as: check.as };
    // The action is taken by an `action`, or by the attack that starts the Attack action.
    const takesAction = check.as === 'action' || (check.as === 'attack' && !(before.attackActionTaken && before.attacksLeft > 0));
    if (takesAction) {
      spent.tookAction = { attacksLeft: before.attacksLeft, attackActionTaken: before.attackActionTaken };
      if (before.action) spent.extraAction = true;
    }
    if (option.id === 'common:dash' || option.id === 'common:dash:bonus') {
      next.dashes += 1;
      spent.dash = true;
    }
    if (opts.grantExtraAction) next.extraActions += 1;
    setState(campaignId, { ...state, spend: { ...state.spend, [actor.id]: next } });
    return { ok: true, economy: { campaignId, tokenId: actor.id, round: state.round, spent } };
  });
  if (outcome.ok && outcome.economy) await resendInitiative(campaignId);
  return outcome;
}

/**
 * The spend with one card's share given back, and nothing else: no other
 * card's spending, no movement, no once-per-turn mark. With `granted`, the
 * extra action the card gave (Action Surge) is taken back too. Pure.
 */
export function withoutCardSpend(now: TurnSpend, spent: EconomySpent, granted: { extraAction?: boolean } = {}): TurnSpend {
  const next: TurnSpend = { ...now, oncePerTurn: [...now.oncePerTurn] };
  if (spent.tookAction) {
    if (spent.extraAction) next.extraActions += 1;
    else next.action = false;
    next.attacksLeft = spent.tookAction.attacksLeft;
    next.attackActionTaken = spent.tookAction.attackActionTaken;
  } else if (spent.as === 'attack') {
    next.attacksLeft += 1;
  } else if (spent.as === 'bonus') {
    next.bonus = false;
  } else if (spent.as === 'reaction') {
    next.reaction = false;
  }
  if (spent.dash) next.dashes = Math.max(0, next.dashes - 1);
  if (granted.extraAction) next.extraActions = Math.max(0, next.extraActions - 1);
  return next;
}

/**
 * Give back what an action spent, when the turn it was spent in is still
 * going: the same round, and the same combatant acting (or, for a reaction,
 * only the same round). Otherwise the economy is left as it is. Also used to
 * take back a spend whose action then failed to be stored. `granted` as in
 * withoutCardSpend.
 */
export async function giveBack(economy: EconomyUndo, granted: { extraAction?: boolean } = {}): Promise<void> {
  const { campaignId, tokenId, spent } = economy;
  const changed = await withCombatLock(campaignId, (state) => {
    const now = state.spend[tokenId];
    if (!binds(state, tokenId) || !now || state.round !== economy.round) return false;
    if (spent.as !== 'reaction' && state.currentTokenId !== tokenId) return false;
    setState(campaignId, { ...state, spend: { ...state.spend, [tokenId]: withoutCardSpend(now, spent, granted) } });
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
