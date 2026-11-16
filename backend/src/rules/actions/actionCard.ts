import { RollMode } from './types';
import type { Ability } from './monsterActions';
import type { AreaSpec } from '../../utils/areaGeometry';

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

export interface TargetSave {
  ability: Ability;
  dc: number;
  bonus: number;
  status: 'pending' | 'rolled';
  mode?: RollMode;
  advantageReason?: 'magic-resistance';
  d20s?: number[];
  total?: number;
  success?: boolean;
  rolledBy?: 'auto' | 'owner' | 'gm';
  rolledAt?: string;
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
  /** 0 when the target has no hit points tracked: the card then shows neither HP nor a state. */
  hpMax: number;
  temp?: number;
  attack?: AttackResult;
  damage?: DamagePart[];
  healing?: number;
  concentrationCheckDc?: number;
  /** When the target rolled to keep concentration for this card; one roll per card. */
  concentrationRolledAt?: string;
  /** GM-only: the owner and controlledBy users of the token, set at resolve time. */
  controllerUserIds?: string[];
  /** GM-only: true when the token was masked as 'something-invisible' at resolve time. */
  concealed?: boolean;
  save?: TargetSave;
  /** How many rays/darts hit this target, with one attack result per ray. */
  rays?: number;
  attacks?: AttackResult[];
  undoneAt?: string;
  /** GM-only: the undo left this target's hit points, which had changed since. */
  undoSkipped?: boolean;
}

export interface UndoRecord {
  /** The map whose tokens the NPC entries in `hp` are on; GM-only, like the rest of the record. */
  mapId?: string;
  hp: {
    tokenId: string;
    characterId?: string;
    before: { current: number; temp: number };
    after: { current: number; temp: number };
  }[];
  slot?: { characterId: string; level: number };
  concentration?: { characterId: string; before: unknown; after: unknown };
  recharge?: { mapId: string; tokenId: string; optionId: string };
}

export interface ActionCard {
  kind: 'action';
  actor: { tokenId: string; name: string; maskedName?: MaskedName; userId?: string };
  actionName: string;
  mode: RollMode;
  disadvantageReason?: 'long-range';
  slotLevel?: number;
  targets: ActionCardTarget[];
  save?: { ability: Ability; dc: number; halfOnSave: boolean };
  /** The one damage roll shared by every target of a save effect. */
  damageRoll?: DamagePart[];
  area?: AreaSpec;
  /** GM-only. */
  recharge?: { tokenId: string; optionId: string };
  /** What the actor healed itself by draining its target (Vampiric Touch). */
  selfHealing?: number;
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
  concentrationRolledAt?: string;
  hp?: { current: number; max: number; temp?: number };
  state?: MonsterState;
  rays?: number;
  attacks?: AttackResult[];
  undoneAt?: string;
  save?: PlayerTargetSave;
  /** This viewer controls the target and its save is still pending. */
  yourSave?: true;
}

export interface PlayerTargetSave {
  ability: Ability;
  dc: number;
  status: 'pending' | 'rolled';
  mode?: RollMode;
  success?: boolean;
  rolledAt?: string;
  /** Only for a character or a player-controlled token; a monster's roll stays with the GM. */
  d20s?: number[];
  total?: number;
}

export interface PlayerActionCard {
  kind: 'action';
  actor: { tokenId: string; name?: string; maskedName?: MaskedName };
  actionName: string;
  mode: RollMode;
  disadvantageReason?: 'long-range';
  slotLevel?: number;
  targets: PlayerActionCardTarget[];
  save?: { ability: Ability; dc: number; halfOnSave: boolean };
  damageRoll?: DamagePart[];
  area?: AreaSpec;
  pendingSaves?: number;
  selfHealing?: number;
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
  // A masked target ("something") shows players a state only: exact HP would say which creature it is.
  if (t.maskedName) return false;
  if (t.showHpBar) return true;
  return t.isCharacter && viewer.role === 'PLAYER' && t.ownerUserId !== undefined && t.ownerUserId === viewer.userId;
}

function projectTarget(t: ActionCardTarget, viewer: Viewer, cardUndone: boolean): PlayerActionCardTarget {
  const out: PlayerActionCardTarget = { tokenId: t.tokenId, isCharacter: t.isCharacter };
  if (t.maskedName) out.maskedName = t.maskedName;
  else out.name = t.name;
  if (t.attack) out.attack = { ...t.attack, d20s: [...t.attack.d20s] };
  if (t.damage) out.damage = t.damage.map((d) => ({ ...d }));
  if (t.healing !== undefined) out.healing = t.healing;
  if (t.concentrationCheckDc !== undefined) out.concentrationCheckDc = t.concentrationCheckDc;
  if (t.concentrationRolledAt !== undefined) out.concentrationRolledAt = t.concentrationRolledAt;
  if (t.rays !== undefined) out.rays = t.rays;
  if (t.attacks) out.attacks = t.attacks.map((a) => ({ ...a, d20s: [...a.d20s] }));
  if (t.undoneAt !== undefined) out.undoneAt = t.undoneAt;
  if (t.save) {
    const s = t.save;
    const save: PlayerTargetSave = { ability: s.ability, dc: s.dc, status: s.status };
    // A monster's roll stays with the GM, its mode too: an advantage would tell a Magic Resistance.
    const publicRoll = t.isCharacter || (t.controllerUserIds?.length ?? 0) > 0;
    if (publicRoll && s.mode !== undefined) save.mode = s.mode;
    if (s.success !== undefined) save.success = s.success;
    if (s.rolledAt !== undefined) save.rolledAt = s.rolledAt;
    if (publicRoll && s.d20s) save.d20s = [...s.d20s];
    if (publicRoll && s.total !== undefined) save.total = s.total;
    out.save = save;
    if (
      s.status === 'pending' && viewer.role === 'PLAYER' && !t.undoneAt && !cardUndone &&
      t.controllerUserIds?.includes(viewer.userId)
    ) out.yourSave = true;
  }
  // No hit points tracked (a statue, a hand-made token): neither HP nor a state, not "down".
  if (t.hpMax <= 0) return out;
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

  // A concealed target never appears, unless this viewer controls it (they know it exists).
  const visible = card.targets.filter(
    (t) => !t.concealed || (viewer.role === 'PLAYER' && t.controllerUserIds?.includes(viewer.userId)),
  );

  const out: PlayerActionCard = {
    kind: 'action',
    actor,
    actionName: card.actionName,
    mode: card.mode,
    targets: visible.map((t) => projectTarget(t, viewer, card.undoneAt !== undefined)),
  };
  if (card.save) {
    out.save = { ...card.save };
    out.pendingSaves = card.undoneAt ? 0 : visible.filter((t) => t.save?.status === 'pending' && !t.undoneAt).length;
  }
  if (card.damageRoll) out.damageRoll = card.damageRoll.map((d) => ({ ...d }));
  if (card.area) out.area = JSON.parse(JSON.stringify(card.area));
  if (card.disadvantageReason) out.disadvantageReason = card.disadvantageReason;
  if (card.slotLevel !== undefined) out.slotLevel = card.slotLevel;
  // A GM NPC's extra text is GM-only; a player character's is public.
  if (card.extraText !== undefined && card.actor.userId !== undefined) out.extraText = card.extraText;
  if (card.undoneAt !== undefined) out.undoneAt = card.undoneAt;
  if (card.selfHealing !== undefined) out.selfHealing = card.selfHealing;
  // "Partial" names a target whose hit points the undo left: only one this
  // viewer sees, or a hidden one would show through. A card from before
  // targets were marked one by one keeps its own flag.
  const marked = card.targets.some((t) => t.undoSkipped !== undefined);
  if (card.undoPartial && (!marked || visible.some((t) => t.undoSkipped))) out.undoPartial = true;
  return out;
}
