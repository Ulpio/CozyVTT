/**
 * The GM takes an action back: the whole card, or one target of it.
 *
 * Hit points come back target by target, each only while they are still what
 * the action left (otherwise that target is left and marked, and the undo is
 * "partial"); a pending save is cancelled; the slot, the concentration, a
 * monster's spent recharge and a class feature's uses and state come back
 * with the whole card, and what it spent of the actor's turn (and an extra
 * action it gave) while that turn is still going. A target undone on
 * its own is skipped by the later undo of the whole card, so nothing is
 * given back twice.
 */

import type { ActionCard, Viewer } from '../../rules/actions/actionCard';
import { toJson } from '../../utils/prisma-json';
import {
  ALREADY_UNDONE,
  GM_ONLY,
  INVALID_TARGET,
  afterCommit,
  announce,
  holdSheets,
  mapTokensTx,
  refuse,
  restoreHitPoints,
  sameJson,
  withCardLocked,
  writeSheets,
  writeTokens,
  type HeldSheet,
  type Sheet,
  type TokenEdits,
} from './common';
import { giveBack } from './economy';
import { changeUses, setActiveState, setCondition } from './features';

type UndoOutcome = { ok: true; card: ActionCard; partial: boolean } | { ok: false; error: string };

/** Gives a monster's spent recharge back to its token. */
function restoreRecharge(card: ActionCard, edits: TokenEdits): void {
  const spent = card.undo.recharge;
  if (!spent || spent.mapId !== card.undo.mapId) return;
  const index = edits.tokens.findIndex((t) => t?.id === spent.tokenId);
  const list = index >= 0 ? edits.tokens[index].rechargeSpent : undefined;
  if (!list?.includes(spent.optionId)) return;
  edits.tokens[index] = { ...edits.tokens[index], rechargeSpent: list.filter((id) => id !== spent.optionId) };
  edits.changed = true;
  if (!edits.changedTokenIds.includes(spent.tokenId)) edits.changedTokenIds.push(spent.tokenId);
}

/** The GM takes an action back: hit points that nothing changed since, and the slot, concentration and recharge always. */
export async function undoAction(campaignId: string, requester: Viewer, messageId: string): Promise<UndoOutcome> {
  if (requester.role !== 'GM') return refuse(GM_ONLY);
  const outcome = await withCardLocked(campaignId, messageId, async (tx, card) => {
    if (card.undoneAt) return refuse(ALREADY_UNDONE);
    const { undo } = card;
    // A target the GM already undid on its own is not given back again.
    const alreadyUndone = new Set(card.targets.filter((t) => t.undoneAt).map((t) => t.tokenId));
    const entries = undo.hp.filter((h) => !alreadyUndone.has(h.tokenId));

    const characterIds = [
      ...entries.map((h) => h.characterId),
      undo.slot?.characterId,
      undo.concentration?.characterId,
      ...(undo.uses ?? []).map((u) => u.characterId),
      undo.state?.characterId,
      ...(undo.sheets ?? []).map((s) => s.characterId),
    ].filter((id): id is string => !!id);
    const held = await holdSheets(tx, characterIds);
    const edits = await mapTokensTx(tx, undo.mapId);

    // Latest first, so a target changed twice by this card unwinds in order.
    const left = new Set<string>();
    for (const h of [...entries].reverse()) if (!restoreHitPoints(h, held, edits)) left.add(h.tokenId);

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
      // Only the concentration this action took up is taken back; a newer one stays.
      if (sheet && sameJson(sheet.data.concentratingOn ?? null, undo.concentration.after ?? null)) {
        sheet.data.concentratingOn = (undo.concentration.before ?? null) as Sheet['concentratingOn'];
        sheet.changed = true;
      }
    }
    restoreRecharge(card, edits);
    restoreFeature(card, held, edits);
    restoreRest(card, held, edits);

    await writeTokens(tx, undo.mapId, edits);
    const written = await writeSheets(tx, held);
    const now = new Date().toISOString();
    // Every target still standing is undone with the card: a pending save is cancelled.
    const targets = card.targets.map((t) => {
      if (t.undoneAt) return t;
      const next = { ...t, undoneAt: now };
      if (left.has(t.tokenId)) next.undoSkipped = true;
      return next;
    });
    const updated: ActionCard = { ...card, targets, undoneAt: now };
    if (left.size > 0) updated.undoPartial = true;
    await tx.message.update({ where: { id: messageId }, data: { metadata: toJson(updated) } });
    return { ok: true as const, card: updated, partial: left.size > 0, after: afterCommit(written, held, edits.changedTokenIds, undo.mapId) };
  });

  if (!outcome.ok) return outcome;
  // The turn's spend comes back only while that turn is still going.
  if (outcome.card.undo.economy) await giveBack(outcome.card.undo.economy, { extraAction: outcome.card.undo.extraAction === true });
  await announce(campaignId, requester, outcome.after);
  return { ok: true, card: outcome.card, partial: outcome.partial };
}

/**
 * Gives a class feature's spent uses back to its pools, and puts a state it
 * started (or ended) back as it was, with the condition on its token.
 */
function restoreFeature(card: ActionCard, held: Map<string, HeldSheet>, edits: TokenEdits): void {
  for (const use of card.undo.uses ?? []) {
    const sheet = held.get(use.characterId);
    if (sheet) changeUses(sheet, use.key, -use.amount);
  }
  const state = card.undo.state;
  if (!state) return;
  const sheet = held.get(state.characterId);
  if (sheet) setActiveState(sheet, state.featureId, !state.started);
  if (state.mapId === card.undo.mapId) setCondition(edits, state.tokenId, state.stateName, !state.started);
}

/** Puts a rest's sheet parts back as they were, and the state conditions it took off the tokens. */
function restoreRest(card: ActionCard, held: Map<string, HeldSheet>, edits: TokenEdits): void {
  for (const { characterId, before } of card.undo.sheets ?? []) {
    const sheet = held.get(characterId);
    if (!sheet) continue;
    for (const [key, value] of Object.entries(before)) {
      if (key === 'spellcasting') {
        const slots = (value as { slots?: unknown }).slots;
        sheet.data.spellcasting = { ...sheet.data.spellcasting, slots } as Sheet['spellcasting'];
      } else {
        (sheet.data as Record<string, unknown>)[key] = structuredClone(value);
      }
      if (key === 'hp') sheet.hpChanged = true;
    }
    sheet.changed = true;
  }
  for (const { tokenId, name } of card.undo.conditions ?? []) setCondition(edits, tokenId, name, true);
}

/**
 * The GM takes back what an action did to one target: its hit points when
 * nothing changed them since (else it is left, and the undo is partial), or
 * its pending save, which nobody is then asked to roll.
 */
export async function undoTarget(
  campaignId: string,
  requester: Viewer,
  input: { messageId: string; targetTokenId: string },
): Promise<UndoOutcome> {
  if (requester.role !== 'GM') return refuse(GM_ONLY);
  const { messageId, targetTokenId } = input;
  const outcome = await withCardLocked(campaignId, messageId, async (tx, card) => {
    if (card.undoneAt) return refuse(ALREADY_UNDONE);
    const target = card.targets.find((t) => t.tokenId === targetTokenId);
    if (!target) return refuse(INVALID_TARGET);
    if (target.undoneAt) return refuse(ALREADY_UNDONE);
    const entries = card.undo.hp.filter((h) => h.tokenId === targetTokenId);
    const held = await holdSheets(tx, entries.map((h) => h.characterId).filter((id): id is string => !!id));
    const edits = await mapTokensTx(tx, card.undo.mapId);
    let partial = false;
    for (const h of [...entries].reverse()) if (!restoreHitPoints(h, held, edits)) partial = true;

    await writeTokens(tx, card.undo.mapId, edits);
    const written = await writeSheets(tx, held);
    target.undoneAt = new Date().toISOString();
    if (partial) {
      target.undoSkipped = true;
      card.undoPartial = true;
    }
    await tx.message.update({ where: { id: messageId }, data: { metadata: toJson(card) } });
    return { ok: true as const, card, partial, after: afterCommit(written, held, edits.changedTokenIds, card.undo.mapId) };
  });

  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, outcome.after);
  return { ok: true, card: outcome.card, partial: outcome.partial };
}
