/**
 * What every part of the action resolver shares: reading the table (the
 * acting token, its sheet, who may act), holding the characters' rows while
 * an action applies, changing a target's hit points with a record that undoes
 * it, and telling the table once the change is stored.
 *
 * actionResolver.ts resolves the P5a single-target actions and the undo;
 * saves.ts the saving throws, rays, several targets and areas; recharge.ts a
 * monster's recharge.
 */

import type { Character, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { withMapsLocked } from '../../utils/mapTokens';
import { readTokens, toJson } from '../../utils/prisma-json';
import { canActOnTokenPlane, getSpiritVisibilityBatch, tokensSentTo, type MapTokenSight } from '../../utils/spirit-layer';
import { applyHitPointChange } from '../../utils/rules/hitPoints';
import { characterInCampaign } from '../../utils/characterCampaign';
import { extractCharacterHp } from '../../utils/characterHp';
import { emitCharacterUpdated, broadcastToCampaign } from '../../websocket/utils';
import { applyHpDelta } from '../../websocket/handlers/characters';
import { resendSoonIfCurrent, resendInitiativeFor } from '../../routes/maps';
import logger from '../../utils/logger';
import type { Token } from '../../websocket/shared';
import type { FifthEditionCharacterData } from '../../validators/game-systems/fifthEdition.schema';
import { characterLevel, type ResolvedActionSpec } from '../../rules/actions/catalogue';
import type { ActionCard, ActionCardTarget, MaskedName, UndoRecord, Viewer } from '../../rules/actions/actionCard';
import type { Rng, RollMode } from '../../rules/actions/types';
import { catalogueFor } from './catalogueFor';
import { cantripTier, multiplyDice, repeatDice } from './dice';

export const NOT_YOUR_TOKEN = 'Not your token';
export const INVALID_TARGET = 'Invalid target';
export const OUT_OF_RANGE = 'Out of range';
export const NO_SLOT = 'No spell slot of that level';
export const CANNOT_RESOLVE = 'This action cannot be resolved';
export const ALREADY_UNDONE = 'Already undone';
export const GM_ONLY = 'GM only';
export const NEEDS_CONCENTRATION_CONFIRM = 'Already concentrating on another spell';
export const ALREADY_ROLLED = 'Already rolled';
export const RECHARGE_SPENT = 'This action is spent until it recharges';
export const NOT_SPENT = 'This action is not spent';
export const NOT_FOUND = 'Action not found';

export const defaultRng: Rng = (sides) => Math.floor(Math.random() * sides) + 1;

/** An AC for a creature whose sheet or stat block gives none: an unarmoured one's. */
const DEFAULT_AC = 10;

export type Refusal = { ok: false; error: string };
export const refuse = (error: string): Refusal => ({ ok: false, error });

export type Sheet = FifthEditionCharacterData & Record<string, unknown>;

export interface Actor {
  map: { id: string; campaignId: string; feetPerSquare: number; diagonalRule: string };
  token: Token;
  /** The character the token is bound to, when it is this campaign's. */
  character: Character | null;
  spec: ResolvedActionSpec[];
}

/** The campaign's member roles by user id. */
export async function rolesIn(campaignId: string): Promise<Map<string, string>> {
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

/** boundCharacter, read inside the action's transaction. */
export async function boundCharacterTx(tx: Prisma.TransactionClient, campaignId: string, token: Token): Promise<Character | null> {
  if (!token.characterId) return null;
  const character = await tx.character.findUnique({ where: { id: token.characterId } });
  if (!character || character.campaignId !== campaignId) return null;
  const owner = await tx.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: character.userId, campaignId } },
    select: { userId: true },
  });
  return owner ? character : null;
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
export async function loadActor(campaignId: string, requester: Viewer, mapId: string, actorTokenId: string): Promise<Actor | Refusal> {
  if (requester.role === 'SPECTATOR') return refuse(NOT_YOUR_TOKEN);
  // The bar reads 5e sheets and stat blocks only.
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gameSystem: true } });
  if (campaign?.gameSystem !== 'FIFTH_EDITION') return refuse(CANNOT_RESOLVE);
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
export function actingPlayer(token: Token, character: Character | null, roles: Map<string, string>): string | undefined {
  if (character && roles.get(character.userId) === 'PLAYER') return character.userId;
  if (token.controlledBy && roles.get(token.controlledBy) === 'PLAYER') return token.controlledBy;
  return undefined;
}

/** The players who answer for a target: its character's owner and its controller, when they are players. */
export function controllersOf(token: Token, character: Character | null, roles: Map<string, string>): string[] {
  const ids = [character?.userId, token.controlledBy ?? undefined].filter(
    (id): id is string => !!id && roles.get(id) === 'PLAYER',
  );
  return [...new Set(ids)];
}

/**
 * How players are shown a token's identity on a card. A token not sent to
 * players at all (hidden, or on the spirit plane) is "something invisible";
 * an obscured one, which players see as a shape with no identity, is
 * "something". Otherwise its name.
 */
export function maskFor(token: Token): MaskedName | undefined {
  if (token.visible === false || token.layer === 'spirit') return 'something-invisible';
  if (token.obscured === true) return 'something';
  return undefined;
}

/** A name for the chat line, which every reader receives as stored. */
export function chatName(name: string, masked: MaskedName | undefined): string {
  if (masked === 'something-invisible') return 'Algo invisível';
  if (masked === 'something') return 'Algo';
  return name;
}

/** A footprint in grid squares; tokens are stored in squares. */
export const footprint = (t: Token) => ({ x: t.position.x, y: t.position.y, width: t.size?.width ?? 1, height: t.size?.height ?? 1 });

/** The spell's `bookId/slug` from its action id. */
export function spellRef(id: string): { bookId: string; slug: string } | undefined {
  if (!id.startsWith('spell:')) return undefined;
  const rest = id.slice('spell:'.length);
  const at = rest.indexOf('/');
  return at > 0 ? { bookId: rest.slice(0, at), slug: rest.slice(at + 1) } : undefined;
}

/** Two roll modes together: advantage and disadvantage cancel, as for any d20. */
export function combineModes(a: RollMode, b: RollMode): RollMode {
  if (a === 'normal') return b;
  if (b === 'normal' || a === b) return a;
  return 'normal';
}

/** The members who are not the GM, each with the plane they see: whose sight a card's targets are checked against. */
export interface Onlooker { userId: string; role: string; spiritVisible: boolean }

export async function onlookersIn(campaignId: string, roles: Map<string, string>): Promise<Onlooker[]> {
  const ids = [...roles].filter(([, role]) => role !== 'GM').map(([id]) => id);
  const planes = await getSpiritVisibilityBatch(campaignId, ids);
  return ids.map((userId) => ({ userId, role: roles.get(userId)!, spiritVisible: planes.get(userId) ?? false }));
}

/**
 * Marks each target some onlooker is not sent (out of their sight on a lit
 * map, on another plane, hidden) with who is: the projection leaves it off
 * every other reader's card, so an area cannot tell a player what is in the dark.
 */
export function markSeenBy(targets: ActionCardTarget[], map: MapTokenSight, onlookers: Onlooker[]): void {
  const sent = onlookers.map((o) => ({ userId: o.userId, ids: new Set(tokensSentTo(map, o.role, o.spiritVisible, o.userId).map((t) => t?.id)) }));
  for (const target of targets) {
    const seenBy = sent.filter((s) => s.ids.has(target.tokenId)).map((s) => s.userId);
    if (seenBy.length < sent.length) target.seenBy = seenBy;
  }
}

/** What one target's entry starts as: who it is, who answers for it, and what players may know of it. */
export function newEntry(token: Token, sheet: HeldSheet | null, character: Character | null, roles: Map<string, string>): ActionCardTarget {
  const entry: ActionCardTarget = {
    tokenId: token.id,
    name: token.name,
    isCharacter: sheet !== null,
    showHpBar: token.showHpBar === true,
    ac: armourClass(token, sheet?.data ?? null),
    hpBefore: 0,
    hpAfter: 0,
    hpMax: 0,
    controllerUserIds: controllersOf(token, character, roles),
    concealed: maskFor(token) === 'something-invisible',
  };
  const masked = maskFor(token);
  if (masked) entry.maskedName = masked;
  if (sheet && roles.get(sheet.character.userId) === 'PLAYER') entry.ownerUserId = sheet.character.userId;
  return entry;
}

// ---------------------------------------------------------------------------
// Holding the characters' rows
// ---------------------------------------------------------------------------

/** A character's sheet held under its row lock for the length of one action. */
export interface HeldSheet {
  character: Character;
  data: Sheet;
  changed: boolean;
  hpChanged: boolean;
}

/** Locks the characters' rows in id order and reads them afresh. */
export async function holdSheets(tx: Prisma.TransactionClient, ids: string[]): Promise<Map<string, HeldSheet>> {
  const held = new Map<string, HeldSheet>();
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${id} FOR UPDATE`;
    const character = await tx.character.findUnique({ where: { id } });
    if (character) held.set(id, { character, data: structuredClone(character.data) as unknown as Sheet, changed: false, hpChanged: false });
  }
  return held;
}

export async function writeSheets(tx: Prisma.TransactionClient, held: Map<string, HeldSheet>): Promise<Character[]> {
  const written: Character[] = [];
  for (const h of held.values()) {
    if (!h.changed) continue;
    written.push(await tx.character.update({ where: { id: h.character.id }, data: { data: toJson(h.data) } }));
  }
  return written;
}

/** What goes out once the transaction holding the change has committed. */
export interface AfterCommit {
  characters: Character[];
  hpCharacterIds: Set<string>;
  tokenIds: string[];
  mapId?: string;
}

export function afterCommit(written: Character[], held: Map<string, HeldSheet>, tokenIds: string[], mapId?: string): AfterCommit {
  return {
    characters: written,
    hpCharacterIds: new Set([...held.values()].filter((h) => h.hpChanged).map((h) => h.character.id)),
    tokenIds,
    mapId,
  };
}

/** Tell the table; the change stands whatever happens here. */
export async function announce(campaignId: string, requester: Viewer, after: AfterCommit): Promise<void> {
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

// ---------------------------------------------------------------------------
// Dice, armour, slots
// ---------------------------------------------------------------------------

/** The dice each damage line rolls for this cast or swing, before any critical. */
export function damageLines(spec: ResolvedActionSpec, grip: 'one' | 'two' | undefined, sheet: Sheet | null, slotLevel: number | undefined) {
  let lines = spec.damage.map((d) => ({ ...d }));
  // The two-handed line replaces the main one. With no main line it is the
  // only damage the weapon has, so it is used whichever grip is chosen.
  if (spec.versatileDamage && (grip === 'two' || lines.length === 0)) {
    lines = grip === 'two' ? [{ ...spec.versatileDamage }, ...lines.slice(1)] : [{ ...spec.versatileDamage }];
  }
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

export function healingDice(spec: ResolvedActionSpec, slotLevel: number | undefined): string | null {
  if (!spec.healing) return null;
  const extra = slotLevel !== undefined ? repeatDice(spec.scaling?.perSlot, slotLevel - (spec.option.spellLevel ?? 0)) : null;
  return extra ? `${spec.healing.dice}+${extra}` : spec.healing.dice;
}

/** A target's armour class from its sheet or stat block. */
export function armourClass(token: Token, sheet: Sheet | null): number {
  if (sheet) return typeof sheet.armorClass === 'number' ? sheet.armorClass : DEFAULT_AC;
  const ac = (token.statBlock as { ac?: unknown } | null | undefined)?.ac;
  return typeof ac === 'number' ? ac : DEFAULT_AC;
}

type Slots = Record<string, { total: number; expended: number }>;

/**
 * Spends the spell's slot and takes up its concentration on the caster's
 * sheet, recording both on `undo`. Refuses when the slot is missing or empty,
 * or when another concentration would be dropped without the caster's say.
 */
export function spendSlotAndConcentration(
  spec: ResolvedActionSpec,
  actorSheet: HeldSheet | null,
  requested: { slotLevel?: number; replaceConcentration?: boolean },
  undo: UndoRecord,
): { slotLevel: number | undefined } | Refusal | { ok: false; error: string; code: 'needs-concentration-confirm' } {
  const { option } = spec;
  const spellLevel = option.group === 'spell' ? option.spellLevel ?? 0 : 0;
  let slotLevel: number | undefined;
  if (option.group === 'spell' && spellLevel > 0) {
    slotLevel = requested.slotLevel ?? spellLevel;
    if (!Number.isInteger(slotLevel) || slotLevel < spellLevel || slotLevel > 9 || !actorSheet) return refuse(NO_SLOT);
    const slot = (actorSheet.data.spellcasting?.slots as Slots | undefined)?.[String(slotLevel)];
    if (!slot || typeof slot.total !== 'number' || (slot.expended ?? 0) >= slot.total) return refuse(NO_SLOT);
  }
  if (option.concentration && actorSheet && actorSheet.data.concentratingOn && !requested.replaceConcentration) {
    return { ok: false, error: NEEDS_CONCENTRATION_CONFIRM, code: 'needs-concentration-confirm' };
  }
  if (slotLevel !== undefined && actorSheet) {
    const slots = actorSheet.data.spellcasting!.slots as unknown as Slots;
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
  return { slotLevel };
}

// ---------------------------------------------------------------------------
// Hit points
// ---------------------------------------------------------------------------

/** The map's token list being changed under the lock, and what changed in it. */
export interface TokenEdits {
  tokens: Token[];
  changedTokenIds: string[];
  changed: boolean;
}

export function tokenEdits(tokens: Token[]): TokenEdits {
  return { tokens, changedTokenIds: [], changed: false };
}

/**
 * Changes a target's hit points by `delta` (negative is damage): its sheet's
 * for a character, its token's for anything else, temporary hit points first.
 * Fills the card entry's before, after and maximum, records the change on
 * `undo` and asks for a concentration check when a concentrating character
 * takes damage. A second change to the same target on one card extends its
 * undo entry while nothing else has touched its hit points between the two.
 */
export function changeHitPoints(
  entry: ActionCardTarget,
  target: Token,
  sheet: HeldSheet | null,
  delta: number,
  edits: TokenEdits,
  undo: UndoRecord,
): void {
  const prior = [...undo.hp].reverse().find((h) => h.tokenId === target.id);
  const record = (before: { current: number; temp: number }, after: { current: number; temp: number }, characterId?: string) => {
    if (delta === 0) return;
    if (prior && prior.after.current === before.current && prior.after.temp === before.temp) {
      prior.after = after;
    } else {
      undo.hp.push(characterId ? { tokenId: target.id, characterId, before, after } : { tokenId: target.id, before, after });
    }
  };
  if (sheet) {
    const before = extractCharacterHp(sheet.character.gameSystem, sheet.data as Record<string, unknown>);
    const applied = before ? applyHpDelta(sheet.character.gameSystem, sheet.data, delta) : { error: 'no hp' };
    if (!before || 'error' in applied) return;
    if (!prior) entry.hpBefore = before.current;
    entry.hpAfter = applied.hp.current;
    entry.hpMax = applied.hp.max;
    if (applied.hp.temp > 0) entry.temp = applied.hp.temp;
    else delete entry.temp;
    if (delta !== 0) {
      sheet.data = applied.data as Sheet;
      sheet.changed = true;
      sheet.hpChanged = true;
      record({ current: before.current, temp: before.temp }, { current: applied.hp.current, temp: applied.hp.temp }, sheet.character.id);
    }
    if (delta < 0 && sheet.data.concentratingOn) entry.concentrationCheckDc = Math.max(10, Math.floor(-delta / 2));
    return;
  }
  const index = edits.tokens.findIndex((t) => t?.id === target.id);
  const hp = index >= 0 ? edits.tokens[index].hp : target.hp;
  if (!hp || typeof hp.max !== 'number') return;
  const before = { current: hp.current, max: hp.max, temp: hp.temp ?? 0 };
  const after = applyHitPointChange(before, delta);
  if (!prior) entry.hpBefore = before.current;
  entry.hpAfter = after.current;
  entry.hpMax = after.max;
  if (after.temp > 0) entry.temp = after.temp;
  else delete entry.temp;
  if (delta !== 0 && index >= 0) {
    edits.tokens[index] = { ...edits.tokens[index], hp: after };
    edits.changed = true;
    if (!edits.changedTokenIds.includes(target.id)) edits.changedTokenIds.push(target.id);
    record({ current: before.current, temp: before.temp }, { current: after.current, temp: after.temp });
  }
}

/**
 * Puts one undo entry's hit points back when they are still what the action
 * left; returns false (and changes nothing) when something has changed them since.
 */
export function restoreHitPoints(
  h: UndoRecord['hp'][number],
  held: Map<string, HeldSheet>,
  edits: TokenEdits,
): boolean {
  if (h.characterId) {
    const sheet = held.get(h.characterId);
    const hp = sheet ? extractCharacterHp(sheet.character.gameSystem, sheet.data as Record<string, unknown>) : null;
    if (!sheet || !hp || hp.current !== h.after.current || hp.temp !== h.after.temp) return false;
    const hpBlock = (sheet.data as { hp: Record<string, unknown> }).hp;
    const next: Record<string, unknown> = { ...hpBlock, current: h.before.current };
    if ('temporary' in hpBlock || h.before.temp !== 0) next.temporary = h.before.temp;
    (sheet.data as { hp: Record<string, unknown> }).hp = next;
    sheet.changed = true;
    sheet.hpChanged = true;
    return true;
  }
  const index = edits.tokens.findIndex((t) => t?.id === h.tokenId);
  const hp = index >= 0 ? edits.tokens[index].hp : null;
  if (!hp || hp.current !== h.after.current || (hp.temp ?? 0) !== h.after.temp) return false;
  edits.tokens[index] = { ...edits.tokens[index], hp: { ...hp, current: h.before.current, temp: h.before.temp } };
  edits.changed = true;
  if (!edits.changedTokenIds.includes(h.tokenId)) edits.changedTokenIds.push(h.tokenId);
  return true;
}

// ---------------------------------------------------------------------------
// Stored cards
// ---------------------------------------------------------------------------

/** The stored action card a message holds, or null. */
export function cardOf(metadata: Prisma.JsonValue | null): ActionCard | null {
  const card = metadata as unknown as ActionCard | null;
  return card && typeof card === 'object' && card.kind === 'action' && card.undo ? card : null;
}

/** Whether two JSON values are equal, whatever their keys' order or where they were read from. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export async function inMapLock<T>(mapId: string | undefined, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return mapId ? withMapsLocked([mapId], fn) : prisma.$transaction(fn);
}

/**
 * Reads an action card for a change: under the map's lock (every write to a
 * card, and every hit point change on that map, takes it) and the message
 * row's own lock, read afresh once both are held. Two saves rolled on one
 * card at the same moment therefore apply one after the other.
 */
export async function withCardLocked<T>(
  campaignId: string,
  messageId: string,
  fn: (tx: Prisma.TransactionClient, card: ActionCard) => Promise<T | Refusal>,
): Promise<T | Refusal> {
  const first = await prisma.message.findFirst({ where: { id: messageId, campaignId, type: 'CHARACTER_ACTION' }, select: { metadata: true } });
  const stored = first ? cardOf(first.metadata) : null;
  if (!stored) return refuse(NOT_FOUND);
  return inMapLock(stored.undo.mapId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Message" WHERE id = ${messageId} FOR UPDATE`;
    const fresh = await tx.message.findUnique({ where: { id: messageId }, select: { metadata: true } });
    const card = fresh ? cardOf(fresh.metadata) : null;
    if (!card) return refuse(NOT_FOUND);
    return fn(tx, card);
  });
}

/** The map's tokens, read under its lock, ready to change. */
export async function mapTokensTx(tx: Prisma.TransactionClient, mapId: string | undefined): Promise<TokenEdits> {
  const map = mapId ? await tx.map.findUnique({ where: { id: mapId }, select: { tokens: true } }) : null;
  return tokenEdits(map ? readTokens(map.tokens) : []);
}

export async function writeTokens(tx: Prisma.TransactionClient, mapId: string | undefined, edits: TokenEdits): Promise<void> {
  if (mapId && edits.changed) await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(edits.tokens) } });
}
