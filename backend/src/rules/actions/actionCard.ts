import { RollMode } from './types';

export type MaskedName = 'something' | 'something-invisible';
export type MonsterState = 'unharmed' | 'wounded' | 'badly-wounded' | 'down';

export interface AttackResult {
  d20s: number[];
  natural: number;
  total: number;
  hit: boolean;
  critical: boolean;
}

export interface DamagePart {
  total: number;
  type?: string;
  breakdown: string;
}

export interface ActionCardTarget {
  tokenId: string;
  name: string;
  maskedName?: MaskedName;
  isCharacter: boolean;
  ownerUserId?: string;
  showHpBar: boolean;
  ac: number;
  hitChance?: number;
  hpBefore: number;
  hpAfter: number;
  hpMax: number;
  temp?: number;
  attack?: AttackResult;
  damage?: DamagePart[];
  healing?: number;
  concentrationCheckDc?: number;
}

export interface UndoRecord {
  hp: {
    tokenId: string;
    characterId?: string;
    before: { current: number; temp: number };
    after: { current: number; temp: number };
  }[];
  slot?: { characterId: string; level: number };
  concentration?: { characterId: string; before: unknown; after: unknown };
}

export interface ActionCard {
  kind: 'action';
  actor: { tokenId: string; name: string; maskedName?: MaskedName; userId?: string };
  actionName: string;
  mode: RollMode;
  disadvantageReason?: 'long-range';
  slotLevel?: number;
  targets: ActionCardTarget[];
  extraText?: string;
  undo: UndoRecord;
  undoneAt?: string;
  undoPartial?: boolean;
}

export type Viewer = { role: 'GM' | 'PLAYER' | 'SPECTATOR'; userId: string };

/** What a non-GM reader receives: no AC, hit chance, undo record or hidden HP. */
export interface PlayerActionCardTarget {
  tokenId: string;
  /** Present only when the name is not masked. */
  name?: string;
  maskedName?: MaskedName;
  isCharacter: boolean;
  attack?: AttackResult;
  damage?: DamagePart[];
  healing?: number;
  concentrationCheckDc?: number;
  hp?: { current: number; max: number; temp?: number };
  state?: MonsterState;
}

export interface PlayerActionCard {
  kind: 'action';
  actor: { tokenId: string; name?: string; maskedName?: MaskedName };
  actionName: string;
  mode: RollMode;
  disadvantageReason?: 'long-range';
  slotLevel?: number;
  targets: PlayerActionCardTarget[];
  extraText?: string;
  undoneAt?: string;
  undoPartial?: boolean;
}

export function monsterState(current: number, max: number): MonsterState {
  if (current <= 0) return 'down';
  if (current >= max) return 'unharmed';
  if (current > max / 2) return 'wounded';
  return 'badly-wounded';
}

function canSeeHp(t: ActionCardTarget, viewer: Viewer): boolean {
  if (t.showHpBar) return true;
  return t.isCharacter && viewer.role === 'PLAYER' && t.ownerUserId !== undefined && t.ownerUserId === viewer.userId;
}

function projectTarget(t: ActionCardTarget, viewer: Viewer): PlayerActionCardTarget {
  const out: PlayerActionCardTarget = { tokenId: t.tokenId, isCharacter: t.isCharacter };
  if (t.maskedName) out.maskedName = t.maskedName;
  else out.name = t.name;
  if (t.attack) out.attack = { ...t.attack, d20s: [...t.attack.d20s] };
  if (t.damage) out.damage = t.damage.map((d) => ({ ...d }));
  if (t.healing !== undefined) out.healing = t.healing;
  if (t.concentrationCheckDc !== undefined) out.concentrationCheckDc = t.concentrationCheckDc;
  if (canSeeHp(t, viewer)) {
    out.hp = { current: t.hpAfter, max: t.hpMax };
    if (t.temp !== undefined) out.hp.temp = t.temp;
  } else {
    out.state = monsterState(t.hpAfter, t.hpMax);
  }
  return out;
}

export function projectActionCard(card: ActionCard, viewer: Viewer): PlayerActionCard | ActionCard {
  if (viewer.role === 'GM') return card;

  const actor: PlayerActionCard['actor'] = { tokenId: card.actor.tokenId };
  if (card.actor.maskedName) actor.maskedName = card.actor.maskedName;
  else actor.name = card.actor.name;

  const out: PlayerActionCard = {
    kind: 'action',
    actor,
    actionName: card.actionName,
    mode: card.mode,
    targets: card.targets.map((t) => projectTarget(t, viewer)),
  };
  if (card.disadvantageReason) out.disadvantageReason = card.disadvantageReason;
  if (card.slotLevel !== undefined) out.slotLevel = card.slotLevel;
  // A GM NPC's extra text is GM-only; a player character's is public.
  if (card.extraText !== undefined && card.actor.userId !== undefined) out.extraText = card.extraText;
  if (card.undoneAt !== undefined) out.undoneAt = card.undoneAt;
  if (card.undoPartial !== undefined) out.undoPartial = card.undoPartial;
  return out;
}
