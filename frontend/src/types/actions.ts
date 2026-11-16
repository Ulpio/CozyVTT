// What the action bar knows of one thing a token can do. Mirrors the server's
// ActionOption (backend/src/rules/actions/catalogue.ts): no AC, no HP.

export type ActionRollMode = 'normal' | 'advantage' | 'disadvantage';

export type ActionReach = { kind: 'self' | 'touch' } | { kind: 'feet'; normal: number; long?: number };

export interface ActionOption {
  id: string;
  name: string;
  group: 'attack' | 'spell' | 'npc';
  resolution: 'attack' | 'heal' | 'cast' | 'post';
  spellLevel?: number;
  concentration?: boolean;
  grips?: ('one' | 'two')[];
  reach?: ActionReach;
  /** NPC options only: the attack bonus and dice, for the GM. */
  summary?: string;
}

/** What the client may send: never a bonus or dice. */
export interface ActionRequest {
  mapId: string;
  actorTokenId: string;
  actionId: string;
  targetTokenId?: string;
  mode: ActionRollMode;
  slotLevel?: number;
  grip?: 'one' | 'two';
  replaceConcentration?: boolean;
}

export interface ActionResolveAck {
  ok: boolean;
  messageId?: string;
  error?: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// The card a bar action leaves in the chat. Mirrors the server's
// (backend/src/rules/actions/actionCard.ts): a player is sent the player
// shape, the GM the full one.
// ---------------------------------------------------------------------------

export type ActionMaskedName = 'something' | 'something-invisible';
export type ActionMonsterState = 'unharmed' | 'wounded' | 'badly-wounded' | 'down';

export interface ActionAttackResult {
  d20s: number[];
  natural: number;
  total: number;
  hit: boolean;
  critical: boolean;
}

export interface ActionDamagePart {
  total: number;
  type?: string;
  breakdown: string;
}

export interface ActionCardTarget {
  tokenId: string;
  name: string;
  maskedName?: ActionMaskedName;
  isCharacter: boolean;
  ownerUserId?: string;
  showHpBar: boolean;
  ac: number;
  hitChance?: number;
  hpBefore: number;
  hpAfter: number;
  /** 0 when no hit points are tracked: the card then shows neither HP nor a state. */
  hpMax: number;
  temp?: number;
  attack?: ActionAttackResult;
  damage?: ActionDamagePart[];
  healing?: number;
  concentrationCheckDc?: number;
  concentrationRolledAt?: string;
}

export interface ActionCard {
  kind: 'action';
  actor: { tokenId: string; name: string; maskedName?: ActionMaskedName; userId?: string };
  actionName: string;
  mode: ActionRollMode;
  disadvantageReason?: 'long-range';
  slotLevel?: number;
  targets: ActionCardTarget[];
  extraText?: string;
  undo: unknown;
  undoneAt?: string;
  undoPartial?: boolean;
}

export interface PlayerActionCardTarget {
  tokenId: string;
  /** Present only when the name is not masked. */
  name?: string;
  maskedName?: ActionMaskedName;
  isCharacter: boolean;
  attack?: ActionAttackResult;
  damage?: ActionDamagePart[];
  healing?: number;
  concentrationCheckDc?: number;
  concentrationRolledAt?: string;
  hp?: { current: number; max: number; temp?: number };
  state?: ActionMonsterState;
}

export interface PlayerActionCard {
  kind: 'action';
  actor: { tokenId: string; name?: string; maskedName?: ActionMaskedName };
  actionName: string;
  mode: ActionRollMode;
  disadvantageReason?: 'long-range';
  slotLevel?: number;
  targets: PlayerActionCardTarget[];
  extraText?: string;
  undoneAt?: string;
  undoPartial?: boolean;
}

export type ActionCardView = ActionCard | PlayerActionCard;

/** The small message a concentration roll posts. */
export interface ConcentrationCard {
  kind: 'concentration';
  actionMessageId: string;
  tokenId: string;
  name?: string;
  maskedName?: ActionMaskedName;
  dc: number;
  d20: number;
  bonus: number;
  total: number;
  kept: boolean;
}
