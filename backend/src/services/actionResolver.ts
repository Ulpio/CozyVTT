/**
 * The action bar, resolved on the server.
 *
 * A player picks an action and a target; the GM does the same for any token.
 * The request names only which token acts, which action, at whom (or, for an
 * area, where it is aimed), the roll mode, the spell's circle and the grip.
 * Everything else (the attack bonus, the dice, the save DC, the target's
 * armour class and hit points) is read here from the stored sheet, stat
 * block, map and compendium, so a client cannot roll a bigger number than its
 * sheet allows.
 *
 * Each action is resolved under the map's lock (withMapsLocked), with every
 * character it touches locked by row inside the same transaction, read
 * afresh once the locks are held. Two actions landing on one creature
 * therefore apply one after the other, never over each other: the goblin's
 * hit points in the map's token list, a character's in its sheet. The
 * chat message holding the card is written in that same transaction.
 *
 * Every change is recorded on the card (`undo`) so the GM can take it back.
 *
 * This file resolves the single-target attack, heal, cast and post, and the
 * concentration roll. The rest lives beside it in actionResolver/:
 * saves.ts (saving throws, rays, several targets, areas and pending saves),
 * undo.ts (the GM's undo, of a whole card or one target), recharge.ts (a
 * monster's recharge), areaTargets.ts (who an area catches), economy.ts (what
 * a combatant may still spend this turn), common.ts (what they share),
 * dice.ts and catalogueFor.ts.
 */

import { prisma } from '../config/database';
import { withMapsLocked } from '../utils/mapTokens';
import { readTokens, toJson } from '../utils/prisma-json';
import { getSpiritVisibility, tokensSentTo } from '../utils/spirit-layer';
import type { Token } from '../websocket/shared';
import { tokenDistanceFeet } from '../rules/actions/distance';
import { rollAttack, attackHits, hitChance, rollDamage } from '../rules/actions/attackRoll';
import { characterSaveBonus } from '../rules/actions/savingThrow';
import { rollDice } from '../utils/dice-parser';
import { spellcastingModifier, type ActionId, type ActionOption } from '../rules/actions/catalogue';
import type { ActionCard, ActionCardTarget, MaskedName, UndoRecord, Viewer } from '../rules/actions/actionCard';
import type { Rng, RollMode } from '../rules/actions/types';
import { withLongRange } from './actionResolver/dice';
import {
  ALREADY_ROLLED,
  ALREADY_UNDONE,
  CANNOT_RESOLVE,
  INVALID_TARGET,
  NOT_FOUND,
  NOT_YOUR_TOKEN,
  OUT_OF_RANGE,
  actingPlayer,
  afterCommit,
  announce,
  boundCharacterTx,
  cardOf,
  changeHitPoints,
  chatName,
  damageLines,
  defaultRng,
  footprint,
  healingDice,
  holdSheets,
  loadActor,
  maskFor,
  newEntry,
  refuse,
  rolesIn,
  spendSlotAndConcentration,
  tokenEdits,
  writeSheets,
  type Sheet,
} from './actionResolver/common';
import { isTargetedAction, resolveTargetedAction } from './actionResolver/saves';
import { attacksPerActionFor, checkAndSpend, combatFor, giveBack, type CombatTurn, type EconomyUndo } from './actionResolver/economy';

export {
  NOT_YOUR_TOKEN,
  INVALID_TARGET,
  OUT_OF_RANGE,
  NO_SLOT,
  CANNOT_RESOLVE,
  ALREADY_UNDONE,
  GM_ONLY,
  NEEDS_CONCENTRATION_CONFIRM,
  ALREADY_ROLLED,
  RECHARGE_SPENT,
  NOT_SPENT,
} from './actionResolver/common';
export { undoAction, undoTarget } from './actionResolver/undo';
export { rollPendingSave, rollRemainingSaves, listPendingSaves } from './actionResolver/saves';
export { rollRecharge, resetRecharge } from './actionResolver/recharge';

/** A point on the map, in pixels with y counted from the top. */
export interface MapPoint {
  x: number;
  y: number;
}

export interface ActionRequest {
  mapId: string;
  actorTokenId: string;
  actionId: ActionId;
  targetTokenId?: string;
  /** Several targets, or one per ray; never with `area`. */
  targetTokenIds?: string[];
  /** Where an area is aimed: its centre (a point area) or the mouse (one that leaves the caster). */
  area?: { anchor: MapPoint; aim?: MapPoint };
  mode: RollMode;
  slotLevel?: number;
  grip?: 'one' | 'two';
  replaceConcentration?: boolean;
}

export type ResolveOutcome =
  | { ok: true; messageId: string; card: ActionCard }
  | { ok: false; error: string; code?: 'needs-concentration-confirm' };

// ---------------------------------------------------------------------------
// listActions
// ---------------------------------------------------------------------------

/** What the token can do and, in a fight, what it has left this turn. */
export interface ActionList {
  options: ActionOption[];
  combat?: CombatTurn;
}

/**
 * What the token can do, as the requester may see it (the NPC summary is the
 * GM's), and, while the turn economy binds it, its turn as the bar shows it.
 */
export async function listActions(
  campaignId: string,
  requester: Viewer,
  mapId: string,
  actorTokenId: string,
): Promise<ActionList | { error: string }> {
  const actor = await loadActor(campaignId, requester, mapId, actorTokenId);
  if ('ok' in actor) return { error: actor.error };
  const options = actor.spec.map(({ option }) => {
    const copy: ActionOption = { ...option };
    if (option.grips) copy.grips = [...option.grips];
    if (option.reach) copy.reach = { ...option.reach };
    if (requester.role !== 'GM') delete copy.summary;
    return copy;
  });
  const combat = combatFor(campaignId, actor.token, actor.character ? (actor.character.data as unknown as Sheet) : null);
  return combat ? { options, combat } : { options };
}

// ---------------------------------------------------------------------------
// resolveAction
// ---------------------------------------------------------------------------

export async function resolveAction(
  campaignId: string,
  requester: Viewer,
  req: ActionRequest,
  rng: Rng = defaultRng,
): Promise<ResolveOutcome> {
  const actor = await loadActor(campaignId, requester, req.mapId, req.actorTokenId);
  if ('ok' in actor) return actor;
  const spec = actor.spec.find((s) => s.option.id === req.actionId);
  if (!spec) return refuse(CANNOT_RESOLVE);
  const { option } = spec;
  // An area is aimed, never given targets; anything else is never aimed.
  const isArea = option.targeting?.kind === 'area';
  if (isArea ? req.targetTokenIds !== undefined || req.targetTokenId !== undefined : req.area !== undefined) return refuse(INVALID_TARGET);
  if (isTargetedAction(spec)) return resolveTargetedAction(campaignId, requester, req, actor, spec, rng);
  if (req.targetTokenIds !== undefined) {
    // A single-target action names its one target either way.
    if (req.targetTokenIds.length !== 1 || (req.targetTokenId !== undefined && req.targetTokenId !== req.targetTokenIds[0])) return refuse(INVALID_TARGET);
    req = { ...req, targetTokenId: req.targetTokenIds[0] };
  }
  if (option.resolution === 'attack' && (typeof spec.attackBonus !== 'number' || (spec.damage.length === 0 && !spec.versatileDamage))) {
    return refuse(CANNOT_RESOLVE);
  }
  if (option.resolution === 'heal' && !spec.healing) return refuse(CANNOT_RESOLVE);
  const mode: RollMode = req.mode === 'advantage' || req.mode === 'disadvantage' ? req.mode : 'normal';

  const roles = await rolesIn(campaignId);
  const spiritVisible = requester.role === 'GM' ? true : await getSpiritVisibility(campaignId, requester.userId);
  const mapId = req.mapId;

  // What the action spends of the actor's turn, given back if storing it fails.
  let economy: EconomyUndo | undefined;
  const outcome = await withMapsLocked([mapId], async (tx) => {
    const map = await tx.map.findUniqueOrThrow({ where: { id: mapId } });
    const tokens = readTokens(map.tokens);
    const actorToken = tokens.find((t) => t?.id === req.actorTokenId);
    if (!actorToken) return refuse(NOT_YOUR_TOKEN);
    // The controller may have changed since the read above.
    if (requester.role !== 'GM') {
      const owns = actor.character?.userId === requester.userId || actorToken.controlledBy === requester.userId;
      if (!owns) return refuse(NOT_YOUR_TOKEN);
    }

    // The target, among the tokens the requester is sent.
    const reach = option.reach;
    let target: Token | null = null;
    let longRange = false;
    if (option.resolution === 'attack' || option.resolution === 'heal' || reach?.kind === 'self') {
      if (reach?.kind === 'self') {
        if (req.targetTokenId !== undefined && req.targetTokenId !== actorToken.id) return refuse(INVALID_TARGET);
        target = actorToken;
      } else {
        if (!req.targetTokenId) return refuse(INVALID_TARGET);
        const sent = requester.role === 'GM' ? tokens : tokensSentTo(map, requester.role, spiritVisible, requester.userId);
        if (!sent.some((t) => t?.id === req.targetTokenId)) return refuse(INVALID_TARGET);
        target = tokens.find((t) => t?.id === req.targetTokenId) ?? null;
        if (!target) return refuse(INVALID_TARGET);
        const feet = tokenDistanceFeet(footprint(actorToken), footprint(target), map);
        if (reach?.kind === 'touch') {
          if (feet > 5) return refuse(OUT_OF_RANGE);
        } else if (reach?.kind === 'feet') {
          const limit = reach.long ?? reach.normal;
          if (feet > limit) return refuse(OUT_OF_RANGE);
          longRange = feet > reach.normal;
        }
      }
    }
    // A cast with a reach of its own but nothing to roll posts and spends; it names no target.
    if (option.resolution === 'cast' && reach?.kind === 'self') target = null;

    // The characters this action reads or writes, locked in id order.
    const targetCharacter = target?.characterId && target.characterId === actor.character?.id
      ? actor.character
      : target ? await boundCharacterTx(tx, campaignId, target) : null;
    const held = await holdSheets(tx, [actor.character?.id, targetCharacter?.id].filter((id): id is string => !!id));
    const actorSheet = actor.character ? held.get(actor.character.id) ?? null : null;
    const targetSheet = targetCharacter ? held.get(targetCharacter.id) ?? null : null;

    // Spell slot and concentration.
    const undo: UndoRecord = { mapId, hp: [] };
    const spent = spendSlotAndConcentration(spec, actorSheet, req, undo);
    if ('ok' in spent) return spent;
    const { slotLevel } = spent;

    // The turn: refused when already spent, spent before anything is rolled.
    const turn = await checkAndSpend(campaignId, actorToken, option, { attacksPerAction: attacksPerActionFor(actorSheet?.data ?? null) });
    if (!turn.ok) return turn;
    if (turn.economy) undo.economy = economy = turn.economy;

    // The roll.
    const effectiveMode = longRange && option.resolution === 'attack' ? withLongRange(mode) : mode;
    const cardTargets: ActionCardTarget[] = [];
    const edits = tokenEdits(tokens);
    if (target && (option.resolution === 'attack' || option.resolution === 'heal')) {
      // Who answers for the target, and whether players are sent it at all (a hidden one leaves their cards).
      const entry = newEntry(target, targetSheet, targetCharacter, roles);
      const ac = entry.ac;

      let delta = 0;
      if (option.resolution === 'attack') {
        const bonus = spec.attackBonus as number;
        entry.hitChance = hitChance(bonus, ac, effectiveMode);
        const roll = rollAttack(bonus, effectiveMode, rng);
        const { hit, critical } = attackHits(roll, ac);
        entry.attack = { d20s: roll.d20s, natural: roll.natural, total: roll.total, hit, critical };
        if (hit) {
          entry.damage = damageLines(spec, req.grip, actorSheet?.data ?? null, slotLevel).map((line) => {
            const r = rollDamage(line.dice, critical, rng);
            const part = { total: Math.max(0, r.total), breakdown: `${r.breakdown.expression}: ${r.breakdown.formula}` } as { total: number; type?: string; breakdown: string };
            if (line.type) part.type = line.type;
            return part;
          });
          delta = -entry.damage.reduce((sum, d) => sum + d.total, 0);
        }
      } else {
        const dice = healingDice(spec, slotLevel) as string;
        const rolled = rollDice(dice, rng).total;
        const modifier = spec.healing?.addModifier && actorSheet ? spellcastingModifier(actorSheet.data) : 0;
        entry.healing = Math.max(0, rolled + modifier);
        delta = entry.healing;
      }

      // Hit points: the sheet's for a character, the token's for anything else.
      changeHitPoints(entry, target, targetSheet, delta, edits, undo);
      cardTargets.push(entry);
    }

    const card: ActionCard = {
      kind: 'action',
      actor: { tokenId: actorToken.id, name: actorToken.name },
      actionName: option.name,
      mode: option.resolution === 'attack' ? effectiveMode : mode,
      targets: cardTargets,
      undo,
    };
    const actorMask = maskFor(actorToken);
    if (actorMask) card.actor.maskedName = actorMask;
    const player = actingPlayer(actorToken, actor.character, roles);
    if (player) card.actor.userId = player;
    if (longRange && option.resolution === 'attack') card.disadvantageReason = 'long-range';
    if (slotLevel !== undefined) card.slotLevel = slotLevel;
    const extra = option.resolution === 'post' || option.resolution === 'cast' ? spec.description : spec.extraText;
    if (extra) card.extraText = extra;

    if (edits.changed) await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(edits.tokens) } });
    const written = await writeSheets(tx, held);
    const actorLabel = chatName(actorToken.name, actorMask);
    // The line every reader receives as stored names no target players are not sent.
    const content = cardTargets.length > 0 && !cardTargets[0].concealed
      ? `${actorLabel} → ${chatName(cardTargets[0].name, cardTargets[0].maskedName)}: ${option.name}`
      : `${actorLabel}: ${option.name}`;
    const message = await tx.message.create({
      data: { campaignId, userId: requester.userId, type: 'CHARACTER_ACTION', content, metadata: toJson(card) },
      select: { id: true },
    });
    return { ok: true as const, messageId: message.id, card, after: afterCommit(written, held, edits.changedTokenIds, mapId) };
  }).catch(async (error: unknown) => {
    if (economy) await giveBack(economy);
    throw error;
  });

  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, outcome.after);
  return { ok: true, messageId: outcome.messageId, card: outcome.card };
}

// ---------------------------------------------------------------------------
// rollConcentration
// ---------------------------------------------------------------------------

/** The small card a concentration roll posts. Holds nothing a player may not see. */
export interface ConcentrationCard {
  kind: 'concentration';
  actionMessageId: string;
  tokenId: string;
  name?: string;
  maskedName?: MaskedName;
  dc: number;
  d20: number;
  bonus: number;
  total: number;
  kept: boolean;
}

/** The character's Constitution saving throw bonus, from the sheet. */
function constitutionSave(sheet: Sheet): number {
  return characterSaveBonus(sheet, 'con');
}

/** The target of a damaging action rolls to keep concentration: its owner, or the GM for them. */
export async function rollConcentration(
  campaignId: string,
  requester: Viewer,
  messageId: string,
  targetTokenId: string,
  rng: Rng = defaultRng,
): Promise<
  | { ok: true; total: number; dc: number; kept: boolean; messageId: string; card: ConcentrationCard; actionCard: ActionCard }
  | { ok: false; error: string }
> {
  if (requester.role === 'SPECTATOR') return refuse(NOT_YOUR_TOKEN);
  const message = await prisma.message.findFirst({ where: { id: messageId, campaignId, type: 'CHARACTER_ACTION' }, select: { metadata: true } });
  const card = message ? cardOf(message.metadata) : null;
  if (!card) return refuse(NOT_FOUND);
  const target = card.targets.find((t) => t.tokenId === targetTokenId && t.concentrationCheckDc !== undefined);
  const characterId = card.undo.hp.find((h) => h.tokenId === targetTokenId)?.characterId;
  if (!target || !characterId) return refuse(INVALID_TARGET);
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { userId: true } });
  if (!character) return refuse(INVALID_TARGET);
  if (requester.role !== 'GM' && character.userId !== requester.userId) return refuse(NOT_YOUR_TOKEN);
  if (card.undoneAt || target.undoneAt) return refuse(ALREADY_UNDONE);
  if (target.concentrationRolledAt) return refuse(ALREADY_ROLLED);
  const dc = target.concentrationCheckDc as number;

  const outcome = await prisma.$transaction(async (tx) => {
    // The action's card is read again under its row's lock, as undoAction
    // reads it: an undo or another roll landing since the read above wins.
    await tx.$queryRaw`SELECT id FROM "Message" WHERE id = ${messageId} FOR UPDATE`;
    const fresh = await tx.message.findUnique({ where: { id: messageId }, select: { metadata: true } });
    const action = fresh ? cardOf(fresh.metadata) : null;
    if (!action) return refuse(NOT_FOUND);
    if (action.undoneAt) return refuse(ALREADY_UNDONE);
    const entry = action.targets.find((t) => t.tokenId === targetTokenId && t.concentrationCheckDc !== undefined);
    if (!entry) return refuse(INVALID_TARGET);
    if (entry.undoneAt) return refuse(ALREADY_UNDONE);
    if (entry.concentrationRolledAt) return refuse(ALREADY_ROLLED);
    const held = await holdSheets(tx, [characterId]);
    const sheet = held.get(characterId);
    if (!sheet) return refuse(INVALID_TARGET);
    const bonus = constitutionSave(sheet.data);
    const d20 = rng(20);
    const total = d20 + bonus;
    const kept = total >= dc;
    if (!kept && sheet.data.concentratingOn) {
      sheet.data.concentratingOn = null;
      sheet.changed = true;
    }
    const written = await writeSheets(tx, held);
    // One roll per target per card: recorded on the action card itself.
    entry.concentrationRolledAt = new Date().toISOString();
    await tx.message.update({ where: { id: messageId }, data: { metadata: toJson(action) } });
    const small: ConcentrationCard = { kind: 'concentration', actionMessageId: messageId, tokenId: targetTokenId, dc, d20, bonus, total, kept };
    if (target.maskedName) small.maskedName = target.maskedName;
    else small.name = target.name;
    const label = chatName(target.name, target.maskedName);
    const created = await tx.message.create({
      data: {
        campaignId,
        userId: requester.userId,
        type: 'CHARACTER_ACTION',
        content: `${label}: teste de concentração (CD ${dc}): ${total}, ${kept ? 'mantém' : 'perde'} a concentração`,
        metadata: toJson(small),
      },
      select: { id: true },
    });
    return { ok: true as const, total, dc, kept, messageId: created.id, card: small, actionCard: action, written };
  });

  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, { characters: outcome.written, hpCharacterIds: new Set(), tokenIds: [] });
  const { written: _written, ...result } = outcome;
  return result;
}
