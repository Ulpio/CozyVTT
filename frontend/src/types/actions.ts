// What the action bar knows of one thing a token can do. Mirrors the server's
// ActionOption (backend/src/rules/actions/catalogue.ts): no AC, no HP.

import type { AreaSpec } from '@/utils/areaGeometry';
import type { Pt } from '@/utils/aoeGeometry';
import type { ActionCost, TurnSpend } from '@/utils/turnEconomy';

export type ActionRollMode = 'normal' | 'advantage' | 'disadvantage';

export type ActionReach = { kind: 'self' | 'touch' } | { kind: 'feet'; normal: number; long?: number };

export type ActionAbility = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/**
 * Whom the action is aimed at. Absent: one target (or none). `multi` with
 * `distinct` is up to `count` different creatures; without it, one target per
 * ray, exactly `count`, repeats allowed. `count` already counts the caster's
 * level for a cantrip; `perSlot` adds one per slot above the spell's level.
 */
export type ActionTargeting =
  | { kind: 'single' }
  | { kind: 'multi'; count: number; perSlot?: number; distinct: boolean }
  | { kind: 'area'; area: AreaSpec; origin: 'self' | 'point'; rangeFeet?: number };

export interface ActionOption {
  id: string;
  name: string;
  group: 'attack' | 'spell' | 'npc' | 'common' | 'feature';
  resolution: 'attack' | 'heal' | 'cast' | 'post' | 'save' | 'feature';
  targeting?: ActionTargeting;
  recharge?: { min: number; spent: boolean };
  saveAbility?: ActionAbility;
  /** Character spells only: public to the caster. */
  saveDc?: number;
  spellLevel?: number;
  concentration?: boolean;
  grips?: ('one' | 'two')[];
  reach?: ActionReach;
  /** NPC options only: the attack bonus and dice, for the GM. */
  summary?: string;
  /** What taking it spends in the turn. */
  cost: ActionCost;
  /** Spells: the book's casting time, as written. */
  castingTime?: string;
  /** Casting time of a minute or more: not something to do in a fight. */
  combatUnavailable?: true;
  /** A melee weapon attack: it can be an opportunity attack off turn. */
  meleeWeapon?: true;
  /** A monster's Multiattack: it takes the Attack action, so its attacks that follow pass as part of it. */
  startsAttackAction?: true;
  /** Class features: the uses left in the pool the feature spends. */
  uses?: { left: number; max: number };
  /** Class feature that heals an amount the player chooses (Lay on Hands): the bar asks for it. */
  chosenAmount?: true;
  /** Class feature states: running now. */
  active?: true;
  /** Weapon attacks: the features that can add to the hit (Sneak Attack, Divine Smite). */
  riders?: ActionFeatureRider[];
}

/** A feature that adds to a weapon attack's hit; `slot` when it spends a spell slot. */
export interface ActionFeatureRider {
  featureId: string;
  name: string;
  uses?: { left: number; max: number };
  slot?: true;
}

/** Where an area is aimed, in map pixels (top-left origin). The server decides who is in it. */
export interface ActionAreaPlacement {
  anchor: Pt;
  aim?: Pt;
}

/** A rider chosen for a weapon attack; a rider that spends a spell slot names its level. */
export interface ActionRiderChoice {
  featureId: string;
  slotLevel?: number;
}

/** What the client may send: never a bonus or dice. */
export interface ActionRequest {
  mapId: string;
  actorTokenId: string;
  actionId: string;
  targetTokenId?: string;
  targetTokenIds?: string[];
  area?: ActionAreaPlacement;
  mode: ActionRollMode;
  slotLevel?: number;
  grip?: 'one' | 'two';
  replaceConcentration?: boolean;
  /** Lay on Hands: how much of the pool to spend. */
  amount?: number;
  riders?: ActionRiderChoice[];
}

/** The actor's turn in a fight, as `action.list` sends it with the options. */
export interface ActionCombatTurn {
  yourTurn: boolean;
  spend: TurnSpend;
  attacksPerAction: number;
  budgetFeet: number;
}

/** What `action.list` answers: the options and, while the actor is in an active fight, its turn. */
export interface ActionList {
  options: ActionOption[];
  combat?: ActionCombatTurn;
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

/** A target's saving throw on a card, as the GM reads it. */
export interface ActionTargetSave {
  ability: ActionAbility;
  dc: number;
  bonus: number;
  status: 'pending' | 'rolled';
  mode?: ActionRollMode;
  advantageReason?: 'magic-resistance';
  d20s?: number[];
  total?: number;
  success?: boolean;
  rolledBy?: 'auto' | 'owner' | 'gm';
  rolledAt?: string;
}

/** A target's saving throw as a player reads it: a monster's dice, total and mode stay with the GM. */
export interface PlayerActionTargetSave {
  ability: ActionAbility;
  dc: number;
  status: 'pending' | 'rolled';
  mode?: ActionRollMode;
  success?: boolean;
  rolledAt?: string;
  d20s?: number[];
  total?: number;
}

/** The save an action asks of its targets, the same for each. */
export interface ActionCardSave {
  ability: ActionAbility;
  dc: number;
  halfOnSave: boolean;
}
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
  /** The feature that added this line to a weapon hit (Sneak Attack, Divine Smite). */
  label?: string;
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
  controllerUserIds?: string[];
  concealed?: boolean;
  seenBy?: string[];
  save?: ActionTargetSave;
  rays?: number;
  attacks?: ActionAttackResult[];
  undoneAt?: string;
  undoSkipped?: boolean;
}

export interface ActionCard {
  kind: 'action';
  actor: { tokenId: string; name: string; maskedName?: ActionMaskedName; userId?: string };
  actionName: string;
  mode: ActionRollMode;
  disadvantageReason?: 'long-range';
  slotLevel?: number;
  targets: ActionCardTarget[];
  save?: ActionCardSave;
  /** The one damage roll shared by every target of a save effect. */
  damageRoll?: ActionDamagePart[];
  area?: AreaSpec;
  recharge?: { tokenId: string; optionId: string };
  selfHealing?: number;
  /** The riders chosen for an attack that missed: not used. */
  ridersUnused?: string[];
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
  rays?: number;
  attacks?: ActionAttackResult[];
  undoneAt?: string;
  save?: PlayerActionTargetSave;
  /** This viewer controls the target and its save is still pending. */
  yourSave?: true;
}

export interface PlayerActionCard {
  kind: 'action';
  actor: { tokenId: string; name?: string; maskedName?: ActionMaskedName };
  actionName: string;
  mode: ActionRollMode;
  disadvantageReason?: 'long-range';
  slotLevel?: number;
  targets: PlayerActionCardTarget[];
  save?: ActionCardSave;
  damageRoll?: ActionDamagePart[];
  area?: AreaSpec;
  /** How many saves this viewer sees still pending. */
  pendingSaves?: number;
  selfHealing?: number;
  ridersUnused?: string[];
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

/** The small card a recharge roll posts (a whisper to the GM alone for a token players are not sent). */
export interface RechargeCard {
  kind: 'recharge';
  tokenId?: string;
  name?: string;
  maskedName?: ActionMaskedName;
  actionName: string;
  min: number;
  d6: number;
  recharged: boolean;
}

/** One card with a save waiting on the requester, from `action.pendingSaves`. */
export interface PendingSaveCard {
  messageId: string;
  card: ActionCardView;
}
