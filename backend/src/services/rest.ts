/**
 * Short and long rests, taken from the character sheet's side of the table.
 *
 * A short rest gives back the pools that recover on one (`recovers: 'short'`)
 * and a warlock's spell slots. A long rest gives back hit points up to the
 * maximum, zeroes temporary hit points, every slot and pool, half the hit dice
 * (at least one) of each pool, and ends every running state with its condition
 * on the character's tokens on the current map. Neither is possible while a
 * fight is on. One card is posted per rest, listing for each character what
 * came back, and it records the sheets as they were so the GM can undo it.
 */

import { prisma } from '../config/database';
import { toJson } from '../utils/prisma-json';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';
import { whisperGm } from './gmWhisper';
import { characterInCampaign } from '../utils/characterCampaign';
import { getState } from '../websocket/initiativeState';
import { resourcePools, type ActorFeature } from '../rules/actions/features';
import type { ActionCard, Viewer } from '../rules/actions/actionCard';
import { NOT_YOUR_TOKEN, afterCommit, announce, chatName, holdSheets, inMapLock, mapTokensTx, refuse, writeSheets, writeTokens, type HeldSheet, type Refusal, type Sheet } from './actionResolver/common';
import { featuresFor } from './actionResolver/catalogueFor';
import { setCondition, stateNameOf } from './actionResolver/features';

export const COMBAT_REFUSAL = 'Não dá para descansar durante o combate.';
const NOT_FOUND_CHARACTER = 'Personagem não encontrado.';
const NOT_FIFTH_EDITION = 'Só fichas de D&D 5e descansam aqui.';
const SPECTATOR = 'Espectadores não podem usar ações.';

export type RestOutcome = { ok: true; messageId: string; card: ActionCard } | Refusal;

/** Whether a sheet is a warlock's: its origin class is "bruxo", or the class is named so (ignoring accents and case). */
function isWarlock(sheet: Sheet): boolean {
  const plain = (s: unknown) => (typeof s === 'string' ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '');
  return sheet.origin?.class?.slug === 'bruxo' || plain(sheet.class) === 'bruxo';
}

/** How many dice a hit dice pool holds at full: its `maximum`, else the count in a legacy `total` such as "3d10". */
function poolMaximum(pool: { maximum?: unknown; total?: unknown }): number | null {
  if (typeof pool.maximum === 'number') return pool.maximum;
  const match = typeof pool.total === 'string' ? /^\s*(\d+)/.exec(pool.total) : null;
  return match ? Number(match[1]) : null;
}

/** The parts of a sheet a rest may change, as they are, for the undo. */
function snapshot(sheet: Sheet): Record<string, unknown> {
  const before: Record<string, unknown> = {};
  if (sheet.hp) before.hp = structuredClone(sheet.hp);
  if (sheet.spellcasting?.slots) before.spellcasting = { slots: structuredClone(sheet.spellcasting.slots) };
  if (sheet.featureUses) before.featureUses = structuredClone(sheet.featureUses);
  if (sheet.hitDice) before.hitDice = structuredClone(sheet.hitDice);
  if (sheet.activeStates) before.activeStates = structuredClone(sheet.activeStates);
  return before;
}

/** The name a pool goes by on the card: the feature that declares it. */
function poolLabel(features: ActorFeature[], key: string): string {
  const declaring = features.filter((f) => (f.action.resources ?? []).some((r) => r.key === key));
  return (declaring.find((f) => f.action.key === key) ?? declaring[0])?.name ?? key;
}

const RATION_SLUG = 'racoes-de-viagem-1-dia';

const plain = (s: unknown): string => (typeof s === 'string' ? s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() : '');

/**
 * Eats one ration from a held sheet: the first item with the travel-rations
 * slug, else the first whose plain name starts with "racao" or "racoes" (one
 * with none left is passed over). An item eaten down to 0 stays in the list at 0,
 * as a spent stack of ammunition does. Gives the item an id when it has none.
 * Returns what was eaten, for the undo, or null when there was nothing to eat.
 */
function eatRation(held: HeldSheet): NonNullable<ActionCard['undo']['rations']>[number] | null {
  type Item = { id?: string; name?: string; quantity?: number; compendiumRef?: { bookId: string; type?: string; slug: string } };
  const items = (Array.isArray(held.data.inventory) ? held.data.inventory : []) as Item[];
  const left = (i: Item) => (i.quantity ?? 1) > 0;
  const stack = items.find((i) => i.compendiumRef?.slug === RATION_SLUG && left(i)) ?? items.find((i) => /^(racao|racoes)/.test(plain(i.name)) && left(i));
  if (!stack) return null;
  if (!stack.id) stack.id = `inv-${randomUUID().slice(0, 8)}`;
  stack.quantity = (stack.quantity ?? 1) - 1;
  held.changed = true;
  return { characterId: '', itemId: stack.id, name: stack.name ?? '', ...(stack.compendiumRef ? { compendiumRef: stack.compendiumRef } : {}), amount: 1 };
}

/** Gives back what the rest gives to one held sheet; returns what came back, in words, and the states ended. */
function rest(held: HeldSheet, features: ActorFeature[], kind: 'short' | 'long'): { came: string[]; ended: ActorFeature[] } {
  const sheet = held.data;
  const came: string[] = [];
  const long = kind === 'long';

  if (long && sheet.hp && typeof sheet.hp.maximum === 'number') {
    const max = sheet.hp.maximum;
    const temp = typeof sheet.hp.temporary === 'number' ? sheet.hp.temporary : 0;
    if (sheet.hp.current !== max || temp > 0) {
      sheet.hp = { ...sheet.hp, current: max, temporary: 0 };
      held.changed = held.hpChanged = true;
      came.push(`PV ${max}/${max}`);
    }
  }

  const slots = sheet.spellcasting?.slots as Record<string, { total: number; expended: number }> | undefined;
  if (slots && (long || isWarlock(sheet))) {
    let any = false;
    const next: typeof slots = {};
    for (const [level, slot] of Object.entries(slots)) {
      if (slot && slot.expended > 0) any = true;
      next[level] = slot && slot.expended > 0 ? { ...slot, expended: 0 } : slot;
    }
    if (any) {
      sheet.spellcasting = { ...sheet.spellcasting, slots: next } as Sheet['spellcasting'];
      held.changed = true;
      came.push('Espaços de magia');
    }
  }

  const pools = resourcePools(features, sheet);
  const uses = { ...(sheet.featureUses ?? {}) };
  let usesChanged = false;
  for (const [key, pool] of Object.entries(pools)) {
    if (pool.spent <= 0 || (!long && pool.recovers !== 'short')) continue;
    delete uses[key];
    usesChanged = true;
    came.push(`${poolLabel(features, key)} ${pool.max}/${pool.max}`);
  }
  if (long && sheet.featureUses && Object.keys(uses).length > 0) {
    // Whatever else is spent (a pool the books no longer declare) is given back too.
    for (const key of Object.keys(uses)) delete uses[key];
    usesChanged = true;
  }
  if (usesChanged) {
    sheet.featureUses = uses;
    held.changed = true;
  }

  if (long && Array.isArray(sheet.hitDice)) {
    let gained = 0;
    sheet.hitDice = sheet.hitDice.map((pool) => {
      const max = poolMaximum(pool);
      if (max === null) return pool;
      const remaining = typeof pool.remaining === 'number' ? pool.remaining : 0;
      const back = Math.min(Math.max(1, Math.floor(max / 2)), Math.max(0, max - remaining));
      if (back <= 0) return pool;
      gained += back;
      return { ...pool, remaining: remaining + back };
    });
    if (gained > 0) {
      held.changed = true;
      came.push(`Dados de vida +${gained}`);
    }
  }

  const ended: ActorFeature[] = [];
  if (long && Array.isArray(sheet.activeStates) && sheet.activeStates.length > 0) {
    const running = new Set(sheet.activeStates);
    ended.push(...features.filter((f) => running.has(f.id)));
    sheet.activeStates = [];
    held.changed = true;
    for (const f of ended) came.push(`fim de ${stateNameOf(f)}`);
  }
  return { came, ended };
}

/**
 * A rest for the named characters: a player's own, the GM's any of the
 * campaign's. Refused while a fight is on. Posts one card.
 */
export async function takeRest(campaignId: string, requester: Viewer, characterIds: string[], kind: 'short' | 'long'): Promise<RestOutcome> {
  if (requester.role === 'SPECTATOR') return refuse(SPECTATOR);
  const ids = [...new Set(characterIds)];
  if (ids.length === 0) return refuse(NOT_FOUND_CHARACTER);

  const characters = await prisma.character.findMany({ where: { id: { in: ids } } });
  if (characters.length !== ids.length) return refuse(NOT_FOUND_CHARACTER);
  for (const c of characters) {
    if (!(await characterInCampaign(c, campaignId))) return refuse(NOT_FOUND_CHARACTER);
    if (c.gameSystem !== 'FIFTH_EDITION') return refuse(NOT_FIFTH_EDITION);
    if (requester.role !== 'GM' && c.userId !== requester.userId) return refuse(NOT_YOUR_TOKEN);
  }
  if (getState(campaignId).active) return refuse(COMBAT_REFUSAL);

  // What each character's class gives it, read from the books once; the sheet itself is read afresh under its lock.
  const features = new Map<string, ActorFeature[]>();
  for (const c of characters) features.set(c.id, await featuresFor(campaignId, c.data as unknown as Sheet));
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true, detailLevel: true } });
  const mapId = campaign?.currentMapId ?? undefined;
  const faithful = campaign?.detailLevel === 'FAITHFUL';

  const outcome = await inMapLock(mapId, async (tx) => {
    const held = await holdSheets(tx, ids);
    if (held.size !== ids.length) return refuse(NOT_FOUND_CHARACTER);
    const edits = await mapTokensTx(tx, mapId);
    const undo: ActionCard['undo'] = { mapId, hp: [], sheets: [] };
    const lines: string[] = [];
    const conditions: { tokenId: string; name: string }[] = [];
    const hungry: string[] = [];

    for (const id of ids) {
      const sheet = held.get(id)!;
      const before = snapshot(sheet.data);
      const { came, ended } = rest(sheet, features.get(id) ?? [], kind);
      undo.sheets!.push({ characterId: id, before });
      const eaten = faithful && kind === 'long' ? eatRation(sheet) : undefined;
      if (eaten) {
        came.push('comeu 1 ração');
        (undo.rations ??= []).push({ ...eaten, characterId: id });
      }
      if (eaten === null) {
        hungry.push(sheet.character.name);
        if (came.length > 0) lines.push(`${sheet.character.name}: ${came.join(', ')}`);
        lines.push(`${sheet.character.name} ficou sem ração.`);
      } else {
        lines.push(`${sheet.character.name}: ${came.length > 0 ? came.join(', ') : 'nada a recuperar'}`);
      }
      // The conditions the ended states showed, taken off this character's tokens.
      for (const token of [...edits.tokens]) {
        if (token?.characterId !== id) continue;
        for (const f of ended) {
          const name = stateNameOf(f);
          if (!Array.isArray(token.conditions) || !token.conditions.includes(name)) continue;
          setCondition(edits, token.id, name, false);
          conditions.push({ tokenId: token.id, name });
        }
      }
    }
    if (conditions.length > 0) undo.conditions = conditions;

    const tokenOf = edits.tokens.find((t) => t?.characterId && ids.includes(t.characterId));
    const names = ids.map((id) => held.get(id)!.character.name).join(', ');
    const card: ActionCard = {
      kind: 'action',
      actor: { tokenId: tokenOf?.id ?? '', name: names, userId: requester.userId },
      actionName: kind === 'short' ? 'Descanso curto' : 'Descanso longo',
      mode: 'normal',
      targets: [],
      extraText: lines.join('\n'),
      undo,
    };
    await writeTokens(tx, mapId, edits);
    const written = await writeSheets(tx, held);
    const message = await tx.message.create({
      data: { campaignId, userId: requester.userId, type: 'CHARACTER_ACTION', content: `${chatName(names, undefined)}: ${card.actionName}`, metadata: toJson(card) },
      select: { id: true },
    });
    return { ok: true as const, messageId: message.id, card, hungry, after: afterCommit(written, held, edits.changedTokenIds, mapId) };
  });

  if (!outcome.ok) return outcome;
  await announce(campaignId, requester, outcome.after);
  // One whisper for the whole rest, naming everyone who had no ration; a failure to send it never undoes the rest.
  if (outcome.hungry.length > 0) {
    try { await whisperGm(campaignId, `Sem ração no descanso: ${outcome.hungry.join(', ')}.`); } catch (error) { logger.warn('Could not whisper the GM about rations', { err: error, campaignId }); }
  }
  return { ok: true, messageId: outcome.messageId, card: outcome.card };
}
