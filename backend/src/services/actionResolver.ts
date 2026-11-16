/**
 * The action bar, resolved on the server.
 *
 * A player picks an action and a target; the GM does the same for any token.
 * The request names only which token acts, which action, at whom, the roll
 * mode, the spell's circle and the grip. Everything else (the attack bonus,
 * the dice, the target's armour class and hit points) is read here from the
 * stored sheet, stat block, map and compendium, so a client cannot roll a
 * bigger number than its sheet allows.
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
 * Helpers: actionResolver/dice.ts (scaling and modes) and
 * actionResolver/catalogueFor.ts (what a token can do, from stored data).
 */

import type { Character, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { withMapsLocked } from '../utils/mapTokens';
import { readTokens, toJson } from '../utils/prisma-json';
import { getSpiritVisibility, canActOnTokenPlane, tokensSentTo } from '../utils/spirit-layer';
import { applyHitPointChange } from '../utils/rules/hitPoints';
import { characterInCampaign } from '../utils/characterCampaign';
import { extractCharacterHp } from '../utils/characterHp';
import { emitCharacterUpdated, broadcastToCampaign } from '../websocket/utils';
import { applyHpDelta } from '../websocket/handlers/characters';
import { resendSoonIfCurrent, resendInitiativeFor } from '../routes/maps';
import logger from '../utils/logger';
import type { Token } from '../websocket/shared';
import type { FifthEditionCharacterData } from '../validators/game-systems/fifthEdition.schema';
import { tokenDistanceFeet } from '../rules/actions/distance';
import { rollAttack, attackHits, hitChance, rollDamage } from '../rules/actions/attackRoll';
import { rollDice } from '../utils/dice-parser';
import {
  characterLevel,
  spellcastingModifier,
  type ActionId,
  type ActionOption,
  type ResolvedActionSpec,
} from '../rules/actions/catalogue';
import type { ActionCard, ActionCardTarget, MaskedName, UndoRecord, Viewer } from '../rules/actions/actionCard';
import type { Rng, RollMode } from '../rules/actions/types';
import { catalogueFor } from './actionResolver/catalogueFor';
import { cantripTier, multiplyDice, repeatDice, withLongRange } from './actionResolver/dice';

export interface ActionRequest {
  mapId: string;
  actorTokenId: string;
  actionId: ActionId;
  targetTokenId?: string;
  mode: RollMode;
  slotLevel?: number;
  grip?: 'one' | 'two';
  replaceConcentration?: boolean;
}

export type ResolveOutcome =
  | { ok: true; messageId: string; card: ActionCard }
  | { ok: false; error: string; code?: 'needs-concentration-confirm' };

export const NOT_YOUR_TOKEN = 'Not your token';
export const INVALID_TARGET = 'Invalid target';
export const OUT_OF_RANGE = 'Out of range';
export const NO_SLOT = 'No spell slot of that level';
export const CANNOT_RESOLVE = 'This action cannot be resolved';
export const ALREADY_UNDONE = 'Already undone';
export const GM_ONLY = 'GM only';
export const NEEDS_CONCENTRATION_CONFIRM = 'Already concentrating on another spell';
const NOT_FOUND = 'Action not found';

const defaultRng: Rng = (sides) => Math.floor(Math.random() * sides) + 1;

/** An AC for a creature whose sheet or stat block gives none: an unarmoured one's. */
const DEFAULT_AC = 10;

type Refusal = { ok: false; error: string };
const refuse = (error: string): Refusal => ({ ok: false, error });

// ---------------------------------------------------------------------------
// Reading the table
// ---------------------------------------------------------------------------

type Sheet = FifthEditionCharacterData & Record<string, unknown>;

interface Actor {
  map: { id: string; campaignId: string; feetPerSquare: number; diagonalRule: string };
  token: Token;
  /** The character the token is bound to, when it is this campaign's. */
  character: Character | null;
  spec: ResolvedActionSpec[];
}

/** The campaign's member roles by user id. */
async function rolesIn(campaignId: string): Promise<Map<string, string>> {
  const rows = await prisma.campaignMembership.findMany({ where: { campaignId }, select: { userId: true, role: true } });
  return new Map(rows.map((r) => [r.userId, r.role]));
}

/** The token's character when it is bound to one of this campaign's. */
async function boundCharacter(campaignId: string, token: Token): Promise<Character | null> {
  if (!token.characterId) return null;
  const character = await prisma.character.findUnique({ where: { id: token.characterId } });
  if (!character || !(await characterInCampaign(character, campaignId))) return null;
  return character;
}

/**
 * Whether the requester acts through this token: the GM through any; a player
 * through one bound to a character they own, or one they control, on the map
 * on screen and on a plane they may act on. A spectator through none.
 */
async function mayActThrough(
  campaignId: string,
  requester: Viewer,
  token: Token,
  character: Character | null,
  mapId: string,
): Promise<boolean> {
  if (requester.role === 'GM') return true;
  if (requester.role !== 'PLAYER') return false;
  const owns = character?.userId === requester.userId || token.controlledBy === requester.userId;
  if (!owns) return false;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } });
  if (campaign?.currentMapId !== mapId) return false;
  return canActOnTokenPlane(requester.role, token, campaignId, requester.userId);
}

/** The acting token, its character and what it can do, or why the requester may not act through it. */
async function loadActor(campaignId: string, requester: Viewer, mapId: string, actorTokenId: string): Promise<Actor | Refusal> {
  if (requester.role === 'SPECTATOR') return refuse(NOT_YOUR_TOKEN);
  const map = await prisma.map.findUnique({
    where: { id: mapId },
    select: { id: true, campaignId: true, tokens: true, feetPerSquare: true, diagonalRule: true },
  });
  if (!map || map.campaignId !== campaignId) return refuse(NOT_YOUR_TOKEN);
  const token = readTokens(map.tokens).find((t) => t?.id === actorTokenId);
  if (!token) return refuse(NOT_YOUR_TOKEN);
  const character = await boundCharacter(campaignId, token);
  if (!(await mayActThrough(campaignId, requester, token, character, mapId))) return refuse(NOT_YOUR_TOKEN);
  // Built before any seeded roll is drawn: the catalogue checks dice by rolling them.
  const spec = await catalogueFor(campaignId, token, character ? (character.data as unknown as Sheet) : null);
  return { map, token, character, spec };
}

/** Who a token's actions are a player's: its character's owner or its controller, when a player; else the GM's. */
function actingPlayer(token: Token, character: Character | null, roles: Map<string, string>): string | undefined {
  if (character && roles.get(character.userId) === 'PLAYER') return character.userId;
  if (token.controlledBy && roles.get(token.controlledBy) === 'PLAYER') return token.controlledBy;
  return undefined;
}

/**
 * How players are shown a token's identity on a card. A token not sent to
 * players at all (hidden, or on the spirit plane) is "something invisible";
 * an obscured one, which players see as a shape with no identity, is
 * "something". Otherwise its name.
 */
function maskFor(token: Token): MaskedName | undefined {
  if (token.visible === false || token.layer === 'spirit') return 'something-invisible';
  if (token.obscured === true) return 'something';
  return undefined;
}

/** A name for the chat line, which every reader receives as stored. */
function chatName(name: string, masked: MaskedName | undefined): string {
  if (masked === 'something-invisible') return 'Algo invisível';
  if (masked === 'something') return 'Algo';
  return name;
}

/** A footprint in grid squares; tokens are stored in squares. */
const footprint = (t: Token) => ({ x: t.position.x, y: t.position.y, width: t.size?.width ?? 1, height: t.size?.height ?? 1 });

/** The spell's `bookId/slug` from its action id. */
function spellRef(id: string): { bookId: string; slug: string } | undefined {
  if (!id.startsWith('spell:')) return undefined;
  const rest = id.slice('spell:'.length);
  const at = rest.indexOf('/');
  return at > 0 ? { bookId: rest.slice(0, at), slug: rest.slice(at + 1) } : undefined;
}

// ---------------------------------------------------------------------------
// listActions
// ---------------------------------------------------------------------------

/** What the token can do, as the requester may see it: the NPC summary is the GM's. */
export async function listActions(
  campaignId: string,
  requester: Viewer,
  mapId: string,
  actorTokenId: string,
): Promise<ActionOption[] | { error: string }> {
  const actor = await loadActor(campaignId, requester, mapId, actorTokenId);
  if ('ok' in actor) return { error: actor.error };
  return actor.spec.map(({ option }) => {
    const copy: ActionOption = { ...option };
    if (option.grips) copy.grips = [...option.grips];
    if (option.reach) copy.reach = { ...option.reach };
    if (requester.role !== 'GM') delete copy.summary;
    return copy;
  });
}

// ---------------------------------------------------------------------------
// resolveAction
// ---------------------------------------------------------------------------

/** A character's sheet held under its row lock for the length of one action. */
interface HeldSheet {
  character: Character;
  data: Sheet;
  changed: boolean;
  hpChanged: boolean;
}

/** Locks the characters' rows in id order and reads them afresh. */
async function holdSheets(tx: Prisma.TransactionClient, ids: string[]): Promise<Map<string, HeldSheet>> {
  const held = new Map<string, HeldSheet>();
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${id} FOR UPDATE`;
    const character = await tx.character.findUnique({ where: { id } });
    if (character) held.set(id, { character, data: structuredClone(character.data) as unknown as Sheet, changed: false, hpChanged: false });
  }
  return held;
}

async function writeSheets(tx: Prisma.TransactionClient, held: Map<string, HeldSheet>): Promise<Character[]> {
  const written: Character[] = [];
  for (const h of held.values()) {
    if (!h.changed) continue;
    written.push(await tx.character.update({ where: { id: h.character.id }, data: { data: toJson(h.data) } }));
  }
  return written;
}

/** What goes out once the transaction holding the change has committed. */
interface AfterCommit {
  characters: Character[];
  hpCharacterIds: Set<string>;
  tokenIds: string[];
  mapId?: string;
}

/** Tell the table; the change stands whatever happens here. */
async function announce(campaignId: string, requester: Viewer, after: AfterCommit): Promise<void> {
  for (const character of after.characters) {
    try {
      await emitCharacterUpdated(campaignId, character, { characterId: character.id, userId: requester.userId, tokensChanged: false });
      if (after.hpCharacterIds.has(character.id)) {
        const hp = extractCharacterHp(character.gameSystem, character.data as Record<string, unknown>);
        if (hp) broadcastToCampaign(campaignId, 'character.hp.updated', { characterId: character.id, hp });
      }
    } catch (err) {
      logger.warn('Bar action: character change not broadcast; the change stands', { err, characterId: character.id });
    }
  }
  if (after.mapId && after.tokenIds.length > 0) {
    try {
      resendSoonIfCurrent(campaignId, after.mapId);
      for (const tokenId of after.tokenIds) await resendInitiativeFor(campaignId, tokenId);
    } catch (err) {
      logger.warn('Bar action: token change not broadcast; the change stands', { err, mapId: after.mapId });
    }
  }
}

/** The dice each damage line rolls for this cast or swing, before any critical. */
function damageLines(spec: ResolvedActionSpec, req: ActionRequest, sheet: Sheet | null, slotLevel: number | undefined) {
  let lines = spec.damage.map((d) => ({ ...d }));
  if (req.grip === 'two' && spec.versatileDamage) lines = [{ ...spec.versatileDamage }, ...lines.slice(1)];
  const level = spec.option.spellLevel ?? 0;
  if (spec.option.group === 'spell' && level === 0 && spec.scaling?.cantrip) {
    const tier = cantripTier(sheet ? characterLevel(sheet) : 1);
    lines = lines.map((d) => ({ ...d, dice: multiplyDice(d.dice, tier) }));
  }
  if (slotLevel !== undefined && lines.length > 0) {
    const extra = repeatDice(spec.scaling?.perSlot, slotLevel - level);
    if (extra) lines[0] = { ...lines[0], dice: `${lines[0].dice}+${extra}` };
  }
  return lines;
}

function healingDice(spec: ResolvedActionSpec, slotLevel: number | undefined): string | null {
  if (!spec.healing) return null;
  const extra = slotLevel !== undefined ? repeatDice(spec.scaling?.perSlot, slotLevel - (spec.option.spellLevel ?? 0)) : null;
  return extra ? `${spec.healing.dice}+${extra}` : spec.healing.dice;
}

/** A target's armour class from its sheet or stat block. */
function armourClass(token: Token, sheet: Sheet | null): number {
  if (sheet) return typeof sheet.armorClass === 'number' ? sheet.armorClass : DEFAULT_AC;
  const ac = (token.statBlock as { ac?: unknown } | null | undefined)?.ac;
  return typeof ac === 'number' ? ac : DEFAULT_AC;
}

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
  if (option.resolution === 'attack' && (typeof spec.attackBonus !== 'number' || (spec.damage.length === 0 && !spec.versatileDamage))) {
    return refuse(CANNOT_RESOLVE);
  }
  if (option.resolution === 'heal' && !spec.healing) return refuse(CANNOT_RESOLVE);
  const mode: RollMode = req.mode === 'advantage' || req.mode === 'disadvantage' ? req.mode : 'normal';

  const roles = await rolesIn(campaignId);
  const spiritVisible = requester.role === 'GM' ? true : await getSpiritVisibility(campaignId, requester.userId);
  // Which tokens on the map, by id, are characters of this campaign.
  const mapId = req.mapId;

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
    const spellLevel = option.group === 'spell' ? option.spellLevel ?? 0 : 0;
    let slotLevel: number | undefined;
    if (option.group === 'spell' && spellLevel > 0) {
      slotLevel = req.slotLevel ?? spellLevel;
      if (!Number.isInteger(slotLevel) || slotLevel < spellLevel || slotLevel > 9 || !actorSheet) return refuse(NO_SLOT);
      const slot = (actorSheet.data.spellcasting?.slots as Record<string, { total: number; expended: number }> | undefined)?.[String(slotLevel)];
      if (!slot || typeof slot.total !== 'number' || (slot.expended ?? 0) >= slot.total) return refuse(NO_SLOT);
    }
    if (option.concentration && actorSheet) {
      const current = actorSheet.data.concentratingOn;
      if (current && !req.replaceConcentration) {
        return { ok: false as const, error: NEEDS_CONCENTRATION_CONFIRM, code: 'needs-concentration-confirm' as const };
      }
    }
    if (slotLevel !== undefined && actorSheet) {
      const slots = actorSheet.data.spellcasting!.slots as unknown as Record<string, { total: number; expended: number }>;
      slots[String(slotLevel)] = { ...slots[String(slotLevel)], expended: (slots[String(slotLevel)].expended ?? 0) + 1 };
      actorSheet.changed = true;
      undo.slot = { characterId: actorSheet.character.id, level: slotLevel };
    }
    if (option.concentration && actorSheet) {
      const before = actorSheet.data.concentratingOn ?? null;
      const ref = spellRef(option.id);
      const after = ref ? { name: option.name, compendiumRef: ref } : { name: option.name };
      actorSheet.data.concentratingOn = after;
      actorSheet.changed = true;
      undo.concentration = { characterId: actorSheet.character.id, before, after };
    }

    // The roll.
    const effectiveMode = longRange && option.resolution === 'attack' ? withLongRange(mode) : mode;
    const cardTargets: ActionCardTarget[] = [];
    const changedTokenIds: string[] = [];
    let tokensChanged = false;
    if (target && (option.resolution === 'attack' || option.resolution === 'heal')) {
      const sheet = targetSheet?.data ?? null;
      const ac = armourClass(target, sheet);
      const entry: ActionCardTarget = {
        tokenId: target.id,
        name: target.name,
        isCharacter: targetSheet !== null,
        showHpBar: target.showHpBar === true,
        ac,
        hpBefore: 0,
        hpAfter: 0,
        hpMax: 0,
      };
      const masked = maskFor(target);
      if (masked) entry.maskedName = masked;
      if (targetSheet && roles.get(targetSheet.character.userId) === 'PLAYER') entry.ownerUserId = targetSheet.character.userId;

      let delta = 0;
      if (option.resolution === 'attack') {
        const bonus = spec.attackBonus as number;
        entry.hitChance = hitChance(bonus, ac, effectiveMode);
        const roll = rollAttack(bonus, effectiveMode, rng);
        const { hit, critical } = attackHits(roll, ac);
        entry.attack = { d20s: roll.d20s, natural: roll.natural, total: roll.total, hit, critical };
        if (hit) {
          entry.damage = damageLines(spec, req, actorSheet?.data ?? null, slotLevel).map((line) => {
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
      if (targetSheet) {
        const before = extractCharacterHp(targetSheet.character.gameSystem, targetSheet.data as Record<string, unknown>);
        const applied = before ? applyHpDelta(targetSheet.character.gameSystem, targetSheet.data, delta) : { error: 'no hp' };
        if (before && !('error' in applied)) {
          entry.hpBefore = before.current;
          entry.hpAfter = applied.hp.current;
          entry.hpMax = applied.hp.max;
          if (applied.hp.temp > 0) entry.temp = applied.hp.temp;
          if (delta !== 0) {
            targetSheet.data = applied.data as Sheet;
            targetSheet.changed = true;
            targetSheet.hpChanged = true;
            undo.hp.push({
              tokenId: target.id,
              characterId: targetSheet.character.id,
              before: { current: before.current, temp: before.temp },
              after: { current: applied.hp.current, temp: applied.hp.temp },
            });
          }
          if (delta < 0 && targetSheet.data.concentratingOn) entry.concentrationCheckDc = Math.max(10, Math.floor(-delta / 2));
        }
      } else if (target.hp && typeof target.hp.max === 'number') {
        const before = { current: target.hp.current, max: target.hp.max, temp: target.hp.temp ?? 0 };
        const after = applyHitPointChange(before, delta);
        entry.hpBefore = before.current;
        entry.hpAfter = after.current;
        entry.hpMax = after.max;
        if (after.temp > 0) entry.temp = after.temp;
        if (delta !== 0) {
          const index = tokens.findIndex((t) => t?.id === target!.id);
          tokens[index] = { ...tokens[index], hp: after };
          tokensChanged = true;
          changedTokenIds.push(target.id);
          undo.hp.push({ tokenId: target.id, before: { current: before.current, temp: before.temp }, after: { current: after.current, temp: after.temp } });
        }
      }
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
    const extra = option.resolution === 'post' ? spec.description : spec.extraText;
    if (extra) card.extraText = extra;

    if (tokensChanged) await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
    const written = await writeSheets(tx, held);
    const actorLabel = chatName(actorToken.name, actorMask);
    const content = cardTargets.length > 0
      ? `${actorLabel} → ${chatName(cardTargets[0].name, cardTargets[0].maskedName)}: ${option.name}`
      : `${actorLabel}: ${option.name}`;
    const message = await tx.message.create({
      data: { campaignId, userId: requester.userId, type: 'CHARACTER_ACTION', content, metadata: toJson(card) },
      select: { id: true },
    });
    const after: AfterCommit = {
      characters: written,
      hpCharacterIds: new Set([...held.values()].filter((h) => h.hpChanged).map((h) => h.character.id)),
      tokenIds: changedTokenIds,
      mapId,
    };
    return { ok: true as const, messageId: message.id, card, after };
  });

  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, outcome.after);
  return { ok: true, messageId: outcome.messageId, card: outcome.card };
}

/** boundCharacter, read inside the action's transaction. */
async function boundCharacterTx(tx: Prisma.TransactionClient, campaignId: string, token: Token): Promise<Character | null> {
  if (!token.characterId) return null;
  const character = await tx.character.findUnique({ where: { id: token.characterId } });
  if (!character || character.campaignId !== campaignId) return null;
  const owner = await tx.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: character.userId, campaignId } },
    select: { userId: true },
  });
  return owner ? character : null;
}

// ---------------------------------------------------------------------------
// undoAction
// ---------------------------------------------------------------------------

/** The stored action card a message holds, or null. */
function cardOf(metadata: Prisma.JsonValue | null): ActionCard | null {
  const card = metadata as unknown as ActionCard | null;
  return card && typeof card === 'object' && card.kind === 'action' && card.undo ? card : null;
}

async function inMapLock<T>(mapId: string | undefined, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return mapId ? withMapsLocked([mapId], fn) : prisma.$transaction(fn);
}

/** The GM takes an action back: hit points if nothing changed them since, and the slot and concentration always. */
export async function undoAction(
  campaignId: string,
  requester: Viewer,
  messageId: string,
): Promise<{ ok: true; card: ActionCard; partial: boolean } | { ok: false; error: string }> {
  if (requester.role !== 'GM') return refuse(GM_ONLY);
  const first = await prisma.message.findFirst({ where: { id: messageId, campaignId, type: 'CHARACTER_ACTION' }, select: { metadata: true } });
  const stored = first ? cardOf(first.metadata) : null;
  if (!stored) return refuse(NOT_FOUND);
  if (stored.undoneAt) return refuse(ALREADY_UNDONE);
  const mapId = stored.undo.mapId;

  const outcome = await inMapLock(mapId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Message" WHERE id = ${messageId} FOR UPDATE`;
    const fresh = await tx.message.findUnique({ where: { id: messageId }, select: { metadata: true } });
    const card = fresh ? cardOf(fresh.metadata) : null;
    if (!card) return refuse(NOT_FOUND);
    if (card.undoneAt) return refuse(ALREADY_UNDONE);
    const { undo } = card;

    const characterIds = [
      ...undo.hp.map((h) => h.characterId),
      undo.slot?.characterId,
      undo.concentration?.characterId,
    ].filter((id): id is string => !!id);
    const held = await holdSheets(tx, characterIds);
    const map = mapId ? await tx.map.findUnique({ where: { id: mapId }, select: { tokens: true } }) : null;
    const tokens = map ? readTokens(map.tokens) : [];

    // Hit points come back only if every one is still what the action left.
    const unchanged = undo.hp.every((h) => {
      if (h.characterId) {
        const sheet = held.get(h.characterId);
        const hp = sheet ? extractCharacterHp(sheet.character.gameSystem, sheet.data as Record<string, unknown>) : null;
        return !!hp && hp.current === h.after.current && hp.temp === h.after.temp;
      }
      const hp = tokens.find((t) => t?.id === h.tokenId)?.hp;
      return !!hp && hp.current === h.after.current && (hp.temp ?? 0) === h.after.temp;
    });

    const changedTokenIds: string[] = [];
    if (unchanged) {
      for (const h of undo.hp) {
        if (h.characterId) {
          const sheet = held.get(h.characterId)!;
          const hpBlock = (sheet.data as { hp: Record<string, unknown> }).hp;
          const next: Record<string, unknown> = { ...hpBlock, current: h.before.current };
          if ('temporary' in hpBlock || h.before.temp !== 0) next.temporary = h.before.temp;
          (sheet.data as { hp: Record<string, unknown> }).hp = next;
          sheet.changed = true;
          sheet.hpChanged = true;
        } else {
          const index = tokens.findIndex((t) => t?.id === h.tokenId);
          const hp = tokens[index].hp!;
          tokens[index] = { ...tokens[index], hp: { ...hp, current: h.before.current, temp: h.before.temp } };
          changedTokenIds.push(h.tokenId);
        }
      }
    }
    if (undo.slot) {
      const sheet = held.get(undo.slot.characterId);
      const slots = sheet?.data.spellcasting?.slots as Record<string, { total: number; expended: number }> | undefined;
      const slot = slots?.[String(undo.slot.level)];
      if (sheet && slots && slot) {
        slots[String(undo.slot.level)] = { ...slot, expended: Math.max(0, (slot.expended ?? 0) - 1) };
        sheet.changed = true;
      }
    }
    if (undo.concentration) {
      const sheet = held.get(undo.concentration.characterId);
      if (sheet) {
        sheet.data.concentratingOn = (undo.concentration.before ?? null) as Sheet['concentratingOn'];
        sheet.changed = true;
      }
    }

    if (changedTokenIds.length > 0 && mapId) await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
    const written = await writeSheets(tx, held);
    const updated: ActionCard = { ...card, undoneAt: new Date().toISOString() };
    if (!unchanged) updated.undoPartial = true;
    await tx.message.update({ where: { id: messageId }, data: { metadata: toJson(updated) } });
    const after: AfterCommit = {
      characters: written,
      hpCharacterIds: new Set([...held.values()].filter((h) => h.hpChanged).map((h) => h.character.id)),
      tokenIds: changedTokenIds,
      mapId,
    };
    return { ok: true as const, card: updated, partial: !unchanged, after };
  });

  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, outcome.after);
  return { ok: true, card: outcome.card, partial: outcome.partial };
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
  const save = (sheet.savingThrows as { constitution?: { bonus?: unknown } } | undefined)?.constitution?.bonus;
  if (typeof save === 'number') return save;
  const mod = (sheet.stats as { constitution?: { modifier?: unknown } } | undefined)?.constitution?.modifier;
  return typeof mod === 'number' ? mod : 0;
}

/** The target of a damaging action rolls to keep concentration: its owner, or the GM for them. */
export async function rollConcentration(
  campaignId: string,
  requester: Viewer,
  messageId: string,
  targetTokenId: string,
  rng: Rng = defaultRng,
): Promise<
  | { ok: true; total: number; dc: number; kept: boolean; messageId: string; card: ConcentrationCard }
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
  const dc = target.concentrationCheckDc as number;

  const outcome = await prisma.$transaction(async (tx) => {
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
    return { ok: true as const, total, dc, kept, messageId: created.id, card: small, written };
  });

  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, { characters: outcome.written, hpCharacterIds: new Set(), tokenIds: [] });
  const { written: _written, ...result } = outcome;
  return result;
}
