/**
 * Class feature buttons, resolved: a feature's use spent from its pool on the
 * sheet (`featureUses`), its share of the turn spent like any other action,
 * and then what the feature does by its kind:
 *
 * - `use`: a card saying it was used;
 * - `heal`: dice (plus an ability modifier and the class level where the
 *   feature says) on the actor itself, or an amount chosen from the pool on
 *   the actor or a creature within touch (Lay on Hands);
 * - `extraAction`: one more action this turn (Action Surge);
 * - `state`: a state that runs until it is ended (Rage), kept in the sheet's
 *   `activeStates` and shown as a condition on the actor's token; clicking it
 *   again ends it, for nothing, at any time;
 * - `attacks`: unarmed strikes, one target each (Flurry of Blows), after the
 *   Attack action where the feature asks for it.
 *
 * Everything is recorded on the card's undo record, and ending a fight ends
 * every state (endAllStates).
 */

import type { Character, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { withMapsLocked } from '../../utils/mapTokens';
import { readTokens, toJson } from '../../utils/prisma-json';
import { getSpiritVisibility, tokensSentTo } from '../../utils/spirit-layer';
import { rollDice } from '../../utils/dice-parser';
import { sheetAbilityModifier } from '../../utils/rules/fifthEdition';
import type { Token } from '../../websocket/shared';
import { tokenDistanceFeet } from '../../rules/actions/distance';
import { attackHits, hitChance, rollAttack, rollDamage } from '../../rules/actions/attackRoll';
import { characterLevel } from '../../rules/actions/catalogue';
import { atLevel, resourcePools, type ActorFeature } from '../../rules/actions/features';
import type { ActionCard, ActionCardTarget, DamagePart, UndoRecord, Viewer } from '../../rules/actions/actionCard';
import type { Rng, RollMode } from '../../rules/actions/types';
import type { ActionRequest, ResolveOutcome } from '../actionResolver';
import {
  CANNOT_RESOLVE,
  INVALID_TARGET,
  NOT_YOUR_TOKEN,
  NO_USES,
  OUT_OF_RANGE,
  actingPlayer,
  afterCommit,
  announce,
  boundCharacterTx,
  changeHitPoints,
  chatName,
  defaultRng,
  footprint,
  holdSheets,
  mapTokensTx,
  markSeenBy,
  maskFor,
  newEntry,
  onlookersIn,
  refuse,
  rolesIn,
  tokenEdits,
  writeSheets,
  writeTokens,
  type Actor,
  type HeldSheet,
  type Sheet,
  type TokenEdits,
} from './common';
import { featuresFor } from './catalogueFor';
import { attacksPerActionFor, checkAndSpend, giveBack, type EconomyUndo } from './economy';

/** How far a touch reaches, and an unarmed strike. */
const TOUCH_FEET = 5;

/** The damage type of an unarmed strike, as the sheets write it. */
const UNARMED_DAMAGE_TYPE = 'contundente';

const ABILITY_NAMES = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' } as const;

/** The condition a state feature shows on its token: its state name, else the feature's. */
export function stateNameOf(feature: ActorFeature): string {
  return feature.action.stateName ?? feature.name;
}

/** Puts a condition on a token, or takes it off, once; marks the token changed when it did. */
export function setCondition(edits: TokenEdits, tokenId: string, name: string, on: boolean): void {
  const index = edits.tokens.findIndex((t) => t?.id === tokenId);
  if (index < 0) return;
  const now = Array.isArray(edits.tokens[index].conditions) ? edits.tokens[index].conditions : [];
  const has = now.includes(name);
  if (has === on) return;
  edits.tokens[index] = { ...edits.tokens[index], conditions: on ? [...now, name] : now.filter((c) => c !== name) };
  edits.changed = true;
  if (!edits.changedTokenIds.includes(tokenId)) edits.changedTokenIds.push(tokenId);
}

/** Adds a feature id to a sheet's running states, or takes it out. */
export function setActiveState(sheet: HeldSheet, featureId: string, on: boolean): void {
  const now = Array.isArray(sheet.data.activeStates) ? sheet.data.activeStates : [];
  if (now.includes(featureId) === on) return;
  sheet.data.activeStates = on ? [...now, featureId] : now.filter((id) => id !== featureId);
  sheet.changed = true;
}

/** Changes what a sheet has spent of a pool by `delta`, never below nothing. */
export function changeUses(sheet: HeldSheet, key: string, delta: number): void {
  const uses = { ...(sheet.data.featureUses ?? {}) };
  uses[key] = Math.max(0, (typeof uses[key] === 'number' ? uses[key] : 0) + delta);
  sheet.data.featureUses = uses;
  sheet.changed = true;
}

/** The target ids the request names, either way it may name them; null when the two ways disagree. */
function requestedIds(req: ActionRequest): string[] | null {
  if (req.targetTokenIds !== undefined) {
    if (req.targetTokenId !== undefined && (req.targetTokenIds.length !== 1 || req.targetTokenIds[0] !== req.targetTokenId)) return null;
    return req.targetTokenIds;
  }
  return req.targetTokenId !== undefined ? [req.targetTokenId] : [];
}

/** An unarmed strike: proficiency plus the better of STR and DEX to hit, the feature's die plus that to damage. */
function unarmedStrike(sheet: Sheet, dice: string): { bonus: number; damage: string } {
  const mod = Math.max(sheetAbilityModifier(sheet, 'strength'), sheetAbilityModifier(sheet, 'dexterity'));
  const proficiency = typeof sheet.proficiencyBonus === 'number' ? sheet.proficiencyBonus : 2;
  return { bonus: proficiency + mod, damage: mod === 0 ? dice : `${dice}${mod > 0 ? '+' : '-'}${Math.abs(mod)}` };
}

/** What a dice heal rolls up to: its dice, an ability modifier and the class level where the feature says. */
function healAmount(feature: ActorFeature, dice: string, sheet: Sheet, level: number, rng: Rng): number {
  const { action } = feature;
  let total = rollDice(dice, rng).total;
  if (action.addAbility === 'best-str-dex') total += Math.max(sheetAbilityModifier(sheet, 'strength'), sheetAbilityModifier(sheet, 'dexterity'));
  else if (action.addAbility) total += sheetAbilityModifier(sheet, ABILITY_NAMES[action.addAbility]);
  if (action.addClassLevel) total += level;
  return Math.max(0, total);
}

/** Resolves a class feature's button, for actionResolver.resolveAction. */
export async function resolveFeature(
  campaignId: string,
  requester: Viewer,
  req: ActionRequest,
  actor: Actor,
  feature: ActorFeature,
  rng: Rng = defaultRng,
): Promise<ResolveOutcome> {
  const { action } = feature;
  const spec = actor.spec.find((s) => s.option.id === feature.id);
  if (!spec || !actor.character) return refuse(CANNOT_RESOLVE);
  const { option } = spec;
  if (req.area !== undefined) return refuse(INVALID_TARGET);
  // An amount is chosen only for a feature that spends what the player chooses.
  const chosen = action.spends?.chosen === true;
  if (chosen ? !Number.isInteger(req.amount) || (req.amount as number) < 1 : req.amount !== undefined) return refuse(CANNOT_RESOLVE);
  if (action.kind === 'attacks' && !action.attacks) return refuse(CANNOT_RESOLVE);
  const mode: RollMode = req.mode === 'advantage' || req.mode === 'disadvantage' ? req.mode : 'normal';

  // Every feature of the actor: a pool may be declared by another (the ki of Flurry of Blows).
  const { features } = actor;
  const roles = await rolesIn(campaignId);
  const spiritVisible = requester.role === 'GM' ? true : await getSpiritVisibility(campaignId, requester.userId);
  const onlookers = await onlookersIn(campaignId, roles);
  const mapId = req.mapId;

  // What the feature spends of the actor's turn, given back if storing it fails.
  let economy: EconomyUndo | undefined;
  let granted = false;
  const outcome = await withMapsLocked([mapId], async (tx) => {
    const map = await tx.map.findUniqueOrThrow({ where: { id: mapId } });
    const tokens = readTokens(map.tokens);
    const actorToken = tokens.find((t) => t?.id === req.actorTokenId);
    if (!actorToken) return refuse(NOT_YOUR_TOKEN);
    if (requester.role !== 'GM') {
      const owns = actor.character?.userId === requester.userId || actorToken.controlledBy === requester.userId;
      if (!owns) return refuse(NOT_YOUR_TOKEN);
    }

    // Who it reaches: the actor, one creature within touch, or one per strike.
    const ids = requestedIds(req);
    if (!ids) return refuse(INVALID_TARGET);
    const sent = requester.role === 'GM' ? tokens : tokensSentTo(map, requester.role, spiritVisible, requester.userId);
    const within = (id: string): Token | 'invalid' | 'far' => {
      const token = id === actorToken.id ? actorToken : sent.some((t) => t?.id === id) ? tokens.find((t) => t?.id === id) : undefined;
      if (!token) return 'invalid';
      return tokenDistanceFeet(footprint(actorToken), footprint(token), map) > TOUCH_FEET ? 'far' : token;
    };
    const picked: Token[] = [];
    if (action.kind === 'attacks') {
      if (ids.length !== action.attacks!.count) return refuse(INVALID_TARGET);
    } else if (action.kind === 'heal' && chosen) {
      if (ids.length > 1) return refuse(INVALID_TARGET);
    } else if (action.kind === 'heal') {
      // A dice heal is the actor's own.
      if (ids.some((id) => id !== actorToken.id)) return refuse(INVALID_TARGET);
    } else if (ids.length > 0) {
      return refuse(INVALID_TARGET);
    }
    if (action.kind === 'heal' && ids.length === 0) picked.push(actorToken);
    for (const id of action.kind === 'attacks' || action.kind === 'heal' ? ids : []) {
      const token = within(id);
      if (token === 'invalid') return refuse(INVALID_TARGET);
      if (token === 'far') return refuse(OUT_OF_RANGE);
      picked.push(token);
    }

    // The characters it reads or writes, locked in id order.
    const characters = new Map<string, Character | null>();
    for (const token of picked) {
      if (characters.has(token.id)) continue;
      characters.set(token.id, token.characterId && token.characterId === actor.character?.id ? actor.character : await boundCharacterTx(tx, campaignId, token));
    }
    const held = await holdSheets(tx, [actor.character!.id, ...[...characters.values()].map((c) => c?.id)].filter((id): id is string => !!id));
    const actorSheet = held.get(actor.character!.id);
    if (!actorSheet) return refuse(CANNOT_RESOLVE);
    const sheetOf = (token: Token) => {
      const c = characters.get(token.id);
      return c ? held.get(c.id) ?? null : null;
    };
    const level = characterLevel(actorSheet.data);

    const undo: UndoRecord = { mapId, hp: [] };
    const edits = tokenEdits(tokens);
    const card: ActionCard = { kind: 'action', actor: { tokenId: actorToken.id, name: actorToken.name }, actionName: option.name, mode: 'normal', targets: [], undo };
    const running = action.kind === 'state' && (actorSheet.data.activeStates ?? []).includes(feature.id);

    if (running) {
      // Ending a state costs nothing: no use, no part of the turn.
      const stateName = stateNameOf(feature);
      setActiveState(actorSheet, feature.id, false);
      setCondition(edits, actorToken.id, stateName, false);
      undo.state = { characterId: actorSheet.character.id, featureId: feature.id, tokenId: actorToken.id, mapId, stateName, started: false };
      card.actionName = `${option.name}: fim`;
    } else {
      // The pool, refused when it has too little left.
      const amount = chosen ? (req.amount as number) : action.spends?.amount ?? 1;
      if (action.spends) {
        const pool = resourcePools(features, actorSheet.data)[action.spends.key];
        if (!pool || amount > pool.max - pool.spent) return refuse(NO_USES);
      }
      // A dice heal with no dice at this level has nothing to roll.
      const healDice = action.kind === 'heal' && !chosen && action.dice ? atLevel(action.dice, level) : undefined;
      if (action.kind === 'heal' && !chosen && !healDice) return refuse(CANNOT_RESOLVE);

      // The turn: refused when already spent, spent before anything is rolled.
      const turn = await checkAndSpend(campaignId, actorToken, option, {
        attacksPerAction: attacksPerActionFor(actorSheet.data, features),
        requiresAttackAction: action.attacks?.requiresAttackAction === true,
        grantExtraAction: action.kind === 'extraAction',
      });
      if (!turn.ok) return turn;
      if (turn.economy) {
        undo.economy = economy = turn.economy;
        if (action.kind === 'extraAction') granted = undo.extraAction = true;
      }

      if (action.spends) {
        changeUses(actorSheet, action.spends.key, amount);
        undo.uses = [{ characterId: actorSheet.character.id, key: action.spends.key, amount }];
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

      if (action.kind === 'state') {
        const stateName = stateNameOf(feature);
        setActiveState(actorSheet, feature.id, true);
        setCondition(edits, actorToken.id, stateName, true);
        undo.state = { characterId: actorSheet.character.id, featureId: feature.id, tokenId: actorToken.id, mapId, stateName, started: true };
      } else if (action.kind === 'heal') {
        const healing = chosen ? amount : healAmount(feature, healDice as string, actorSheet.data, level, rng);
        const target = picked[0];
        const entry = entryFor(target);
        entry.healing = healing;
        changeHitPoints(entry, target, sheetOf(target), healing, edits, undo);
      } else if (action.kind === 'attacks') {
        // One unarmed strike per target named, each against that target's AC.
        card.mode = mode;
        const strike = unarmedStrike(actorSheet.data, atLevel(action.attacks!.unarmedDice, level) ?? '1');
        const dealt = new Map<string, number>();
        for (const token of picked) {
          const entry = entryFor(token);
          entry.hitChance = hitChance(strike.bonus, entry.ac, mode);
          const roll = rollAttack(strike.bonus, mode, rng);
          const { hit, critical } = attackHits(roll, entry.ac);
          entry.attacks = [...(entry.attacks ?? []), { d20s: roll.d20s, natural: roll.natural, total: roll.total, hit, critical }];
          if (!hit) continue;
          const r = rollDamage(strike.damage, critical, rng);
          const part: DamagePart = { total: Math.max(0, r.total), type: UNARMED_DAMAGE_TYPE, breakdown: `${r.breakdown.expression}: ${r.breakdown.formula}` };
          entry.damage = [...(entry.damage ?? []), part];
          dealt.set(token.id, (dealt.get(token.id) ?? 0) + part.total);
        }
        // Each target's hits land together; one every strike missed still shows its hit points.
        for (const entry of entries.values()) {
          const token = picked.find((t) => t.id === entry.tokenId)!;
          changeHitPoints(entry, token, sheetOf(token), -(dealt.get(entry.tokenId) ?? 0), edits, undo);
        }
      }
      card.targets = [...entries.values()];
      markSeenBy(card.targets, map, onlookers);
    }

    const actorMask = maskFor(actorToken);
    if (actorMask) card.actor.maskedName = actorMask;
    const player = actingPlayer(actorToken, actor.character, roles);
    if (player) card.actor.userId = player;

    await writeTokens(tx, mapId, edits);
    const written = await writeSheets(tx, held);
    // The line every reader receives as stored names no target: a hidden one would show through.
    const message = await tx.message.create({
      data: { campaignId, userId: requester.userId, type: 'CHARACTER_ACTION', content: `${chatName(actorToken.name, actorMask)}: ${card.actionName}`, metadata: toJson(card) },
      select: { id: true },
    });
    return { ok: true as const, messageId: message.id, card, after: afterCommit(written, held, edits.changedTokenIds, mapId) };
  }).catch(async (error: unknown) => {
    if (economy) await giveBack(economy, { extraAction: granted });
    throw error;
  });

  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, outcome.after);
  return { ok: true, messageId: outcome.messageId, card: outcome.card };
}

/**
 * Ends every running state of the campaign's characters (the fight is over):
 * empties their `activeStates` and takes the states' conditions off the
 * tokens bound to them, on every map of the campaign.
 */
export async function endAllStates(campaignId: string, byUserId = ''): Promise<void> {
  const rows = await prisma.character.findMany({ where: { campaignId }, select: { id: true, data: true } });
  const running = rows.filter((c) => {
    const states = (c.data as { activeStates?: unknown } | null)?.activeStates;
    return Array.isArray(states) && states.length > 0;
  });
  if (running.length === 0) return;

  // The conditions each character's running states show.
  const names = new Map<string, string[]>();
  for (const c of running) {
    const sheet = c.data as unknown as Sheet;
    const features = await featuresFor(campaignId, sheet);
    const ids = new Set(sheet.activeStates ?? []);
    names.set(c.id, features.filter((f) => ids.has(f.id)).map(stateNameOf));
  }
  const maps = await prisma.map.findMany({ where: { campaignId }, select: { id: true, tokens: true } });
  const mapIds = maps.filter((m) => readTokens(m.tokens).some((t) => t?.characterId && names.has(t.characterId))).map((m) => m.id);

  const run = async (tx: Prisma.TransactionClient) => {
    const held = await holdSheets(tx, [...names.keys()]);
    for (const sheet of held.values()) {
      if ((sheet.data.activeStates ?? []).length === 0) continue;
      sheet.data.activeStates = [];
      sheet.changed = true;
    }
    const changed: { mapId: string; tokenIds: string[] }[] = [];
    for (const mapId of mapIds) {
      const edits = await mapTokensTx(tx, mapId);
      for (const token of [...edits.tokens]) {
        const off = token?.characterId ? names.get(token.characterId) : undefined;
        for (const name of off ?? []) setCondition(edits, token.id, name, false);
      }
      await writeTokens(tx, mapId, edits);
      if (edits.changedTokenIds.length > 0) changed.push({ mapId, tokenIds: edits.changedTokenIds });
    }
    return { written: await writeSheets(tx, held), changed };
  };
  const { written, changed } = mapIds.length > 0 ? await withMapsLocked(mapIds, run) : await prisma.$transaction(run);

  const by: Viewer = { role: 'GM', userId: byUserId };
  await announce(campaignId, by, { characters: written, hpCharacterIds: new Set(), tokenIds: [] });
  for (const { mapId, tokenIds } of changed) await announce(campaignId, by, { characters: [], hpCharacterIds: new Set(), tokenIds, mapId });
}
