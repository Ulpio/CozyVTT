/**
 * Turn economy: what a combatant may still spend this turn, and what spending
 * it leaves behind. One copy for the server (which decides) and the action bar
 * (which greys things out); the two files must stay identical.
 */

/** What one combatant has spent in the turn it is taking (or last took). */
export interface TurnSpend {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  movedFeet: number;
  dashes: number;
  extraActions: number;
  attacksLeft: number;
  attackActionTaken: boolean;
  /** Features used that can be used once each turn, by id. */
  oncePerTurn: string[];
  overBudgetWarned: boolean;
}

export function freshSpend(): TurnSpend {
  return {
    action: false,
    bonus: false,
    reaction: false,
    movedFeet: 0,
    dashes: 0,
    extraActions: 0,
    attacksLeft: 1,
    attackActionTaken: false,
    oncePerTurn: [],
    overBudgetWarned: false,
  };
}

/** `attack` is a weapon attack made under the Attack action. */
export type ActionCost = 'action' | 'bonus' | 'reaction' | 'none' | 'attack';

export type EconomyRefusal =
  | 'action-spent'
  | 'bonus-spent'
  | 'reaction-spent'
  | 'not-your-turn'
  | 'once-per-turn';

export const REFUSAL_MESSAGES: Record<EconomyRefusal, string> = {
  'action-spent': 'Você já usou a ação neste turno.',
  'bonus-spent': 'Você já usou a ação bônus neste turno.',
  'reaction-spent': 'Você já usou a reação.',
  'not-your-turn': 'Não é a sua vez.',
  'once-per-turn': 'Uma vez por turno.',
};

export interface CanSpendContext {
  yourTurn: boolean;
  meleeWeapon?: boolean;
  oncePerTurnKey?: string;
}

export type CanSpendResult = { ok: true; as: ActionCost } | { ok: false; refusal: EconomyRefusal };

export function canSpend(spend: TurnSpend, cost: ActionCost, ctx: CanSpendContext): CanSpendResult {
  if (ctx.oncePerTurnKey && spend.oncePerTurn.includes(ctx.oncePerTurnKey)) {
    return { ok: false, refusal: 'once-per-turn' };
  }
  if (!ctx.yourTurn) {
    if (cost === 'reaction' || (cost === 'attack' && ctx.meleeWeapon)) {
      return spend.reaction ? { ok: false, refusal: 'reaction-spent' } : { ok: true, as: 'reaction' };
    }
    return { ok: false, refusal: 'not-your-turn' };
  }
  switch (cost) {
    case 'action':
      return !spend.action || spend.extraActions > 0
        ? { ok: true, as: 'action' }
        : { ok: false, refusal: 'action-spent' };
    case 'attack':
      return spend.attacksLeft > 0 || !spend.action || spend.extraActions > 0
        ? { ok: true, as: 'attack' }
        : { ok: false, refusal: 'action-spent' };
    case 'bonus':
      return spend.bonus ? { ok: false, refusal: 'bonus-spent' } : { ok: true, as: 'bonus' };
    case 'reaction':
      return spend.reaction ? { ok: false, refusal: 'reaction-spent' } : { ok: true, as: 'reaction' };
    default:
      return { ok: true, as: 'none' };
  }
}

/** Takes the action, or an extra action (Action Surge) when the action is already gone. */
function takeAction(spend: TurnSpend): Pick<TurnSpend, 'action' | 'extraActions'> {
  if (!spend.action) return { action: true, extraActions: spend.extraActions };
  return { action: true, extraActions: Math.max(0, spend.extraActions - 1) };
}

export function applySpend(
  spend: TurnSpend,
  as: ActionCost,
  ctx: { attacksPerAction: number; oncePerTurnKey?: string },
): TurnSpend {
  const next: TurnSpend = { ...spend, oncePerTurn: [...spend.oncePerTurn] };
  if (ctx.oncePerTurnKey && !next.oncePerTurn.includes(ctx.oncePerTurnKey)) {
    next.oncePerTurn.push(ctx.oncePerTurnKey);
  }
  switch (as) {
    case 'action':
      Object.assign(next, takeAction(spend));
      next.attacksLeft = 0;
      break;
    case 'attack':
      if (spend.attackActionTaken && spend.attacksLeft > 0) {
        next.attacksLeft = spend.attacksLeft - 1;
      } else {
        Object.assign(next, takeAction(spend));
        next.attacksLeft = Math.max(0, ctx.attacksPerAction - 1);
        next.attackActionTaken = true;
      }
      break;
    case 'bonus':
      next.bonus = true;
      break;
    case 'reaction':
      next.reaction = true;
      break;
    default:
      break;
  }
  return next;
}

export function movementBudgetFeet(speedFeet: number, spend: Pick<TurnSpend, 'dashes'>): number {
  return speedFeet * (1 + spend.dashes);
}

/** Feet shown in metres (ft x 0.3) with a comma decimal, ",0" dropped: 30 -> "9", 15 -> "4,5". */
export function feetToMetresLabel(feet: number): string {
  const metres = Math.round(feet * 0.3 * 10) / 10;
  return String(metres).replace('.', ',');
}
