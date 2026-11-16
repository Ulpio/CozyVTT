/**
 * Actions with more than one roll or more than one target: saving throws
 * (a spell's or a monster's, a breath weapon), rays and darts, several
 * chosen targets, areas, an attack whose hit forces a save, and a touch that
 * heals its caster.
 *
 * The stored card is the pending record. A save effect's damage is rolled
 * once for every target. A monster target rolls its save at once and takes
 * its damage; a player's character, or a token a player controls, waits
 * ("pending") until its player rolls (rollPendingSave), the GM rolls for the
 * rest (rollRemainingSaves), or the GM undoes it. Each target takes its
 * damage when its own save is rolled. Every change to a card is made under
 * the map's lock with the card read afresh (withCardLocked), so two saves
 * rolled on one card at once both land.
 */

import { prisma } from '../../config/database';
import { withMapsLocked } from '../../utils/mapTokens';
import { readTokens, toJson } from '../../utils/prisma-json';
import { getSpiritVisibility, tokensSentTo } from '../../utils/spirit-layer';
import { rollDice } from '../../utils/dice-parser';
import type { Token } from '../../websocket/shared';
import type { Character, Prisma } from '@prisma/client';
import { tokenDistanceFeet } from '../../rules/actions/distance';
import { attackHits, hitChance, rollAttack, rollDamage } from '../../rules/actions/attackRoll';
import { characterLevel, spellcastingModifier, type ResolvedActionSpec } from '../../rules/actions/catalogue';
import { characterSaveBonus, damageAfterSave, hasMagicResistance, monsterSaveBonus, rollSave, saveSucceeds } from '../../rules/actions/savingThrow';
import type { SaveEffect } from '../../rules/actions/monsterActions';
import {
  projectActionCard,
  type ActionCard,
  type ActionCardTarget,
  type DamagePart,
  type PlayerActionCard,
  type UndoRecord,
  type Viewer,
} from '../../rules/actions/actionCard';
import type { Rng, RollMode } from '../../rules/actions/types';
import type { ActionRequest, ResolveOutcome } from '../actionResolver';
import { cantripTier, withLongRange } from './dice';
import { areaTargets } from './areaTargets';
import {
  ALREADY_ROLLED,
  ALREADY_UNDONE,
  CANNOT_RESOLVE,
  GM_ONLY,
  INVALID_TARGET,
  NOT_YOUR_TOKEN,
  OUT_OF_RANGE,
  RECHARGE_SPENT,
  actingPlayer,
  afterCommit,
  announce,
  boundCharacterTx,
  changeHitPoints,
  chatName,
  combineModes,
  damageLines,
  defaultRng,
  footprint,
  healingDice,
  holdSheets,
  mapTokensTx,
  markSeenBy,
  maskFor,
  newEntry,
  onlookersIn,
  refuse,
  rolesIn,
  spendSlotAndConcentration,
  tokenEdits,
  withCardLocked,
  writeSheets,
  writeTokens,
  type Actor,
  type HeldSheet,
  type Refusal,
  type TokenEdits,
} from './common';

/** Whether the action is resolved here rather than as P5a's single attack, heal, cast or post. */
export function isTargetedAction(spec: ResolvedActionSpec): boolean {
  const { option } = spec;
  return option.resolution === 'save' ||
    option.targeting?.kind === 'multi' ||
    option.targeting?.kind === 'area' ||
    !!spec.rays || !!spec.autoHit || !!spec.onHitSave || !!spec.selfHeal;
}

/** How many rays or darts this cast has: by character level for a cantrip, plus one per slot above for a spell. */
function rayCount(spec: ResolvedActionSpec, sheetLevel: number, slotLevel: number | undefined): number {
  const rays = spec.rays!;
  if (rays.cantripLevels) return cantripTier(sheetLevel);
  return rays.count + (rays.perSlot ?? 0) * Math.max(0, (slotLevel ?? 0) - (spec.option.spellLevel ?? 0));
}

/** The most distinct targets this cast may pick. */
function targetLimit(spec: ResolvedActionSpec, slotLevel: number | undefined): number {
  const t = spec.option.targeting;
  if (t?.kind !== 'multi') return 1;
  return t.count + (t.perSlot ?? 0) * Math.max(0, (slotLevel ?? 0) - (spec.option.spellLevel ?? 0));
}

/** Each line rolled once, with no critical. */
function rollLines(lines: { dice: string; type?: string }[], rng: Rng): DamagePart[] {
  return lines.map((line) => {
    const r = rollDamage(line.dice, false, rng);
    const part: DamagePart = { total: Math.max(0, r.total), breakdown: `${r.breakdown.expression}: ${r.breakdown.formula}` };
    if (line.type) part.type = line.type;
    return part;
  });
}

/** The damage a target takes once its save is known, as parts that keep their types. */
function partsTaken(roll: DamagePart[], saved: boolean, halfOnSave: boolean): DamagePart[] {
  const total = roll.reduce((s, d) => s + d.total, 0);
  const taken = damageAfterSave(total, saved, halfOnSave);
  if (taken === 0) return [];
  if (taken === total) return roll.map((d) => ({ ...d }));
  const parts = roll.map((d) => ({ ...d, total: Math.floor(d.total / 2) }));
  parts[0].total += taken - parts.reduce((s, d) => s + d.total, 0);
  return parts;
}

/**
 * Rolls a target's save now and applies the damage it takes. The bonus is
 * read again from the stored sheet or stat block; a Magic Resistance noted at
 * the cast adds an advantage, which a picked disadvantage cancels.
 */
function rollSaveFor(
  entry: ActionCardTarget,
  token: Token | undefined,
  sheet: HeldSheet | null,
  mode: RollMode,
  rolledBy: 'auto' | 'owner' | 'gm',
  card: ActionCard,
  edits: TokenEdits,
  rng: Rng,
): void {
  const save = entry.save!;
  if (sheet) save.bonus = characterSaveBonus(sheet.data, save.ability);
  else if (token?.statBlock) save.bonus = monsterSaveBonus(token.statBlock, save.ability);
  const m = save.advantageReason ? combineModes(mode, 'advantage') : mode;
  const roll = rollSave(save.bonus, m, rng);
  const success = saveSucceeds(roll.total, save.dc);
  Object.assign(save, { status: 'rolled', mode: m, d20s: roll.d20s, total: roll.total, success, rolledBy, rolledAt: new Date().toISOString() });
  const parts = partsTaken(card.damageRoll ?? [], success, card.save?.halfOnSave ?? false);
  if (parts.length > 0) entry.damage = [...(entry.damage ?? []), ...parts];
  if (token) changeHitPoints(entry, token, sheet, -parts.reduce((s, d) => s + d.total, 0), edits, card.undo);
}

/**
 * Starts a target's save: a player's waits for its player (its hit points are
 * shown as they stand), anything else rolls at once.
 */
function startSave(
  entry: ActionCardTarget,
  token: Token,
  sheet: HeldSheet | null,
  effect: SaveEffect,
  magicResistance: boolean,
  card: ActionCard,
  edits: TokenEdits,
  rng: Rng,
): void {
  entry.save = { ability: effect.ability, dc: effect.dc, bonus: 0, status: 'pending' };
  if (magicResistance) entry.save.advantageReason = 'magic-resistance';
  entry.save.bonus = sheet ? characterSaveBonus(sheet.data, effect.ability) : monsterSaveBonus(token.statBlock, effect.ability);
  if ((entry.controllerUserIds?.length ?? 0) > 0) {
    changeHitPoints(entry, token, sheet, 0, edits, card.undo);
    return;
  }
  rollSaveFor(entry, token, sheet, 'normal', 'auto', card, edits, rng);
}

/** A target picked by id: sent to the requester (the caster itself always) and within reach. */
interface Picked {
  token: Token;
  longRange: boolean;
}

/** Resolves an action from actionResolver.resolveAction that is one of this file's. */
export async function resolveTargetedAction(
  campaignId: string,
  requester: Viewer,
  req: ActionRequest,
  actor: Actor,
  spec: ResolvedActionSpec,
  rng: Rng = defaultRng,
): Promise<ResolveOutcome> {
  const { option } = spec;
  if (option.resolution === 'save' && !spec.save) return refuse(CANNOT_RESOLVE);
  if (option.resolution === 'attack' && (spec.damage.length === 0 || (!spec.autoHit && typeof spec.attackBonus !== 'number'))) return refuse(CANNOT_RESOLVE);
  if (option.resolution === 'heal' && !spec.healing) return refuse(CANNOT_RESOLVE);
  if (option.resolution === 'cast' || option.resolution === 'post') return refuse(CANNOT_RESOLVE);
  const mode: RollMode = req.mode === 'advantage' || req.mode === 'disadvantage' ? req.mode : 'normal';
  const roles = await rolesIn(campaignId);
  const spiritVisible = requester.role === 'GM' ? true : await getSpiritVisibility(campaignId, requester.userId);
  const onlookers = await onlookersIn(campaignId, roles);
  const mapId = req.mapId;

  const outcome = await withMapsLocked([mapId], async (tx) => {
    const map = await tx.map.findUniqueOrThrow({ where: { id: mapId } });
    const tokens = readTokens(map.tokens);
    const actorToken = tokens.find((t) => t?.id === req.actorTokenId);
    if (!actorToken) return refuse(NOT_YOUR_TOKEN);
    if (requester.role !== 'GM') {
      const owns = actor.character?.userId === requester.userId || actorToken.controlledBy === requester.userId;
      if (!owns) return refuse(NOT_YOUR_TOKEN);
    }
    const spellLevel = option.group === 'spell' ? option.spellLevel ?? 0 : 0;
    const asked = spellLevel > 0 ? req.slotLevel ?? spellLevel : undefined;
    const sheetLevel = actor.character ? characterLevel(actor.character.data as never) : 1;

    // Who the action reaches: whoever the area catches, or the ids picked.
    let picked: Picked[];
    const targeting = option.targeting;
    if (targeting?.kind === 'area') {
      if (!req.area) return refuse(INVALID_TARGET);
      const caught = areaTargets(tokens, actorToken, { ...option, targeting }, req.area, map);
      if ('ok' in caught) return caught;
      picked = caught.map((token) => ({ token, longRange: false }));
    } else {
      let ids = req.targetTokenIds ?? (req.targetTokenId !== undefined ? [req.targetTokenId] : []);
      // A draining touch reads "Pessoal", but touches someone else.
      const reach = spec.selfHeal && option.reach?.kind === 'self' ? { kind: 'touch' as const } : option.reach;
      if (reach?.kind === 'self' && !spec.rays && targeting?.kind !== 'multi') {
        if (ids.some((id) => id !== actorToken.id) || ids.length > 1) return refuse(INVALID_TARGET);
        ids = [actorToken.id];
      }
      if (spec.rays) {
        if (ids.length !== rayCount(spec, sheetLevel, asked)) return refuse(INVALID_TARGET);
      } else if (targeting?.kind === 'multi') {
        if (ids.length < 1 || ids.length > targetLimit(spec, asked)) return refuse(INVALID_TARGET);
        if (targeting.distinct && new Set(ids).size !== ids.length) return refuse(INVALID_TARGET);
      } else if (ids.length !== 1) {
        return refuse(INVALID_TARGET);
      }
      const sent = requester.role === 'GM' ? tokens : tokensSentTo(map, requester.role, spiritVisible, requester.userId);
      picked = [];
      for (const id of ids) {
        const token = id === actorToken.id ? actorToken : sent.some((t) => t?.id === id) ? tokens.find((t) => t?.id === id) : undefined;
        if (!token) return refuse(INVALID_TARGET);
        const feet = tokenDistanceFeet(footprint(actorToken), footprint(token), map);
        let longRange = false;
        if (reach?.kind === 'touch' && feet > 5) return refuse(OUT_OF_RANGE);
        if (reach?.kind === 'feet') {
          if (feet > (reach.long ?? reach.normal)) return refuse(OUT_OF_RANGE);
          longRange = feet > reach.normal;
        }
        picked.push({ token, longRange });
      }
    }

    // The characters it reads or writes, locked in id order.
    const characters = new Map<string, Character | null>();
    for (const { token } of picked) {
      if (characters.has(token.id)) continue;
      characters.set(token.id, token.characterId && token.characterId === actor.character?.id ? actor.character : await boundCharacterTx(tx, campaignId, token));
    }
    // An area catches creatures: a sheet of this campaign, or a stat block.
    if (targeting?.kind === 'area') picked = picked.filter(({ token }) => characters.get(token.id) || (token.statBlock && typeof token.statBlock === 'object'));
    const held = await holdSheets(tx, [actor.character?.id, ...[...characters.values()].map((c) => c?.id)].filter((id): id is string => !!id));
    const actorSheet = actor.character ? held.get(actor.character.id) ?? null : null;
    const sheetOf = (token: Token) => {
      const c = characters.get(token.id);
      return c ? held.get(c.id) ?? null : null;
    };

    const undo: UndoRecord = { mapId, hp: [] };
    const spent = spendSlotAndConcentration(spec, actorSheet, req, undo);
    if ('ok' in spent) return spent;
    const { slotLevel } = spent;

    const edits = tokenEdits(tokens);
    const card: ActionCard = { kind: 'action', actor: { tokenId: actorToken.id, name: actorToken.name }, actionName: option.name, mode, targets: [], undo };
    // A monster's recharge is spent on its token until it is rolled back.
    if (option.recharge) {
      if (actorToken.rechargeSpent?.includes(option.id)) return refuse(RECHARGE_SPENT);
      const index = tokens.findIndex((t) => t?.id === actorToken.id);
      tokens[index] = { ...tokens[index], rechargeSpent: [...(tokens[index].rechargeSpent ?? []), option.id] };
      edits.changed = true;
      // The map goes out again even when only sheets took damage, so the bar shows the button spent.
      if (!edits.changedTokenIds.includes(actorToken.id)) edits.changedTokenIds.push(actorToken.id);
      undo.recharge = { mapId, tokenId: actorToken.id, optionId: option.id };
      card.recharge = { tokenId: actorToken.id, optionId: option.id };
    }

    const entries = new Map<string, ActionCardTarget>();
    const entryFor = (token: Token) => {
      let entry = entries.get(token.id);
      if (!entry) {
        entry = newEntry(token, sheetOf(token), characters.get(token.id) ?? null, roles);
        entries.set(token.id, entry);
      }
      return entry;
    };
    const magicResistance = (token: Token) => spec.source === 'spell' && actor.character !== null && !sheetOf(token) && hasMagicResistance(token.statBlock);

    if (option.resolution === 'save') {
      const effect = spec.save!;
      const lines = damageLines(spec, undefined, actorSheet?.data ?? null, slotLevel);
      if (lines.length > 0) card.damageRoll = rollLines(lines, rng);
      card.save = { ability: effect.ability, dc: effect.dc, halfOnSave: effect.halfOnSave };
      if (targeting?.kind === 'area') card.area = { ...targeting.area };
      for (const { token } of picked) {
        if (entries.has(token.id)) continue;
        startSave(entryFor(token), token, sheetOf(token), effect, magicResistance(token), card, edits, rng);
      }
    } else if (option.resolution === 'heal') {
      const rolled = rollDice(healingDice(spec, slotLevel) as string, rng).total;
      const healing = Math.max(0, rolled + (spec.healing?.addModifier && actorSheet ? spellcastingModifier(actorSheet.data) : 0));
      for (const { token } of picked) {
        if (entries.has(token.id)) continue;
        const entry = entryFor(token);
        entry.healing = healing;
        changeHitPoints(entry, token, sheetOf(token), healing, edits, undo);
      }
    } else {
      // Attacks: one roll per ray (or per target), each against that target's AC.
      const lines = damageLines(spec, undefined, actorSheet?.data ?? null, slotLevel);
      const dealt = new Map<string, number>();
      for (const { token, longRange } of picked) {
        const entry = entryFor(token);
        let hit = true;
        let critical = false;
        if (!spec.autoHit) {
          const bonus = spec.attackBonus as number;
          const m = longRange ? withLongRange(mode) : mode;
          if (longRange) card.disadvantageReason = 'long-range';
          entry.hitChance = hitChance(bonus, entry.ac, m);
          const roll = rollAttack(bonus, m, rng);
          ({ hit, critical } = attackHits(roll, entry.ac));
          const result = { d20s: roll.d20s, natural: roll.natural, total: roll.total, hit, critical };
          if (spec.rays) entry.attacks = [...(entry.attacks ?? []), result];
          else entry.attack = result;
        }
        if (spec.rays) entry.rays = (entry.rays ?? 0) + 1;
        if (!hit) continue;
        const parts = lines.map((line) => {
          const r = rollDamage(line.dice, critical, rng);
          const part: DamagePart = { total: Math.max(0, r.total), breakdown: `${r.breakdown.expression}: ${r.breakdown.formula}` };
          if (line.type) part.type = line.type;
          return part;
        });
        entry.damage = [...(entry.damage ?? []), ...parts];
        dealt.set(token.id, (dealt.get(token.id) ?? 0) + parts.reduce((s, d) => s + d.total, 0));
      }
      // Each target's hits land together; one missed by every ray still shows its hit points.
      const tokenById = (id: string) => picked.find((p) => p.token.id === id)!.token;
      for (const entry of entries.values()) {
        const token = tokenById(entry.tokenId);
        changeHitPoints(entry, token, sheetOf(token), -(dealt.get(entry.tokenId) ?? 0), edits, undo);
      }
      // A hit that forces a save: the save's damage is rolled once, and each hit target saves.
      if (spec.onHitSave && dealt.size > 0) {
        const effect = spec.onHitSave;
        card.save = { ability: effect.ability, dc: effect.dc, halfOnSave: effect.halfOnSave };
        if (effect.damage.length > 0) card.damageRoll = rollLines(effect.damage, rng);
        for (const tokenId of dealt.keys()) {
          const token = tokenById(tokenId);
          startSave(entries.get(tokenId)!, token, sheetOf(token), effect, magicResistance(token), card, edits, rng);
        }
      }
      // A draining touch heals its caster by half the damage it dealt.
      if (spec.selfHeal === 'half-damage' && dealt.size > 0) {
        const healing = Math.floor([...dealt.values()].reduce((s, n) => s + n, 0) / 2);
        card.selfHealing = healing;
        const scratch = newEntry(actorToken, actorSheet, actor.character, roles);
        changeHitPoints(scratch, actorToken, actorSheet, healing, edits, undo);
      }
    }
    card.targets = [...entries.values()];
    // An area catches what the caster cannot see, and any target may be out of another player's sight.
    markSeenBy(card.targets, map, onlookers);

    const actorMask = maskFor(actorToken);
    if (actorMask) card.actor.maskedName = actorMask;
    const player = actingPlayer(actorToken, actor.character, roles);
    if (player) card.actor.userId = player;
    if (slotLevel !== undefined) card.slotLevel = slotLevel;
    const extra = spec.save?.extraText ?? spec.onHitSave?.extraText ?? spec.extraText;
    if (extra) card.extraText = extra;

    await writeTokens(tx, mapId, edits);
    const written = await writeSheets(tx, held);
    // The line every reader receives as stored names no target: a hidden one would show through.
    const message = await tx.message.create({
      data: { campaignId, userId: requester.userId, type: 'CHARACTER_ACTION', content: `${chatName(actorToken.name, actorMask)}: ${option.name}`, metadata: toJson(card) },
      select: { id: true },
    });
    return { ok: true as const, messageId: message.id, card, after: afterCommit(written, held, edits.changedTokenIds, mapId) };
  });

  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, outcome.after);
  return { ok: true, messageId: outcome.messageId, card: outcome.card };
}

// ---------------------------------------------------------------------------
// Pending saves
// ---------------------------------------------------------------------------

type CardOutcome = { ok: true; card: ActionCard } | Refusal;

/** Rolls these pending targets' saves on a card held under its lock, applies their damage and stores the card. */
async function rollOnCard(
  tx: Prisma.TransactionClient,
  campaignId: string,
  messageId: string,
  card: ActionCard,
  targets: ActionCardTarget[],
  mode: RollMode,
  rolledBy: 'owner' | 'gm',
  rng: Rng,
) {
  const mapId = card.undo.mapId;
  const edits = await mapTokensTx(tx, mapId);
  const tokenOf = (id: string) => edits.tokens.find((t) => t?.id === id);
  const characters = new Map<string, Character | null>();
  for (const t of targets) {
    const token = tokenOf(t.tokenId);
    characters.set(t.tokenId, token ? await boundCharacterTx(tx, campaignId, token) : null);
  }
  const held = await holdSheets(tx, [...characters.values()].map((c) => c?.id).filter((id): id is string => !!id));
  for (const t of targets) {
    const c = characters.get(t.tokenId);
    rollSaveFor(t, tokenOf(t.tokenId), c ? held.get(c.id) ?? null : null, mode, rolledBy, card, edits, rng);
  }
  await writeTokens(tx, mapId, edits);
  const written = await writeSheets(tx, held);
  await tx.message.update({ where: { id: messageId }, data: { metadata: toJson(card) } });
  return { ok: true as const, card, after: afterCommit(written, held, edits.changedTokenIds, mapId) };
}

/** A target's player (or the GM) rolls its pending save; its damage enters with the result. */
export async function rollPendingSave(
  campaignId: string,
  requester: Viewer,
  input: { messageId: string; targetTokenId: string; mode: RollMode },
  rng: Rng = defaultRng,
): Promise<CardOutcome> {
  if (requester.role === 'SPECTATOR') return refuse(NOT_YOUR_TOKEN);
  const mode: RollMode = input.mode === 'advantage' || input.mode === 'disadvantage' ? input.mode : 'normal';
  const outcome = await withCardLocked(campaignId, input.messageId, async (tx, card) => {
    const target = card.targets.find((t) => t.tokenId === input.targetTokenId && t.save);
    // A player is told the same whether or not the id is a target they cannot see.
    if (requester.role !== 'GM' && !target?.controllerUserIds?.includes(requester.userId)) return refuse(NOT_YOUR_TOKEN);
    if (!target) return refuse(INVALID_TARGET);
    if (card.undoneAt || target.undoneAt) return refuse(ALREADY_UNDONE);
    if (target.save!.status !== 'pending') return refuse(ALREADY_ROLLED);
    return rollOnCard(tx, campaignId, input.messageId, card, [target], mode, requester.role === 'GM' ? 'gm' : 'owner', rng);
  });
  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, outcome.after);
  return { ok: true, card: outcome.card };
}

/** The GM rolls every save still pending on a card, each with no advantage picked. */
export async function rollRemainingSaves(
  campaignId: string,
  requester: Viewer,
  input: { messageId: string },
  rng: Rng = defaultRng,
): Promise<CardOutcome> {
  if (requester.role !== 'GM') return refuse(GM_ONLY);
  const outcome = await withCardLocked(campaignId, input.messageId, async (tx, card) => {
    if (card.undoneAt) return refuse(ALREADY_UNDONE);
    const pending = card.targets.filter((t) => t.save?.status === 'pending' && !t.undoneAt);
    if (pending.length === 0) return refuse(ALREADY_ROLLED);
    return rollOnCard(tx, campaignId, input.messageId, card, pending, 'normal', 'gm', rng);
  });
  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, outcome.after);
  return { ok: true, card: outcome.card };
}

/** The most cards a pending-save listing reads back. */
const PENDING_LIMIT = 200;

/**
 * Every card with a save still waiting on this requester (the GM: on anyone),
 * as the requester may read it. A page asks for it on joining, so a prompt
 * from a message older than the chat it loaded still shows.
 */
export async function listPendingSaves(
  campaignId: string,
  requester: Viewer,
): Promise<{ messageId: string; card: PlayerActionCard | ActionCard }[]> {
  if (requester.role === 'SPECTATOR') return [];
  const rows = await prisma.message.findMany({
    where: { campaignId, type: 'CHARACTER_ACTION', metadata: { path: ['targets'], array_contains: [{ save: { status: 'pending' } }] } },
    orderBy: { createdAt: 'desc' },
    take: PENDING_LIMIT,
    select: { id: true, metadata: true },
  });
  const out: { messageId: string; card: PlayerActionCard | ActionCard }[] = [];
  for (const row of rows.reverse()) {
    const card = row.metadata as unknown as ActionCard | null;
    if (!card || card.kind !== 'action' || card.undoneAt) continue;
    const waiting = card.targets.some((t) =>
      t.save?.status === 'pending' && !t.undoneAt && (requester.role === 'GM' || t.controllerUserIds?.includes(requester.userId)));
    if (waiting) out.push({ messageId: row.id, card: projectActionCard(card, requester) });
  }
  return out;
}
