/**
 * A monster's recharge ("Recarrega 5–6"). Using the action marks it spent on
 * that token (saves.ts), so two dragons of one kind keep their own breath.
 * The GM rolls a d6 to bring it back, which posts a small card to the chat,
 * or brings it back by hand. `Token.rechargeSpent` is the GM's: players are
 * never sent it.
 */

import type { Prisma } from '@prisma/client';
import { withMapsLocked } from '../../utils/mapTokens';
import { readTokens, toJson } from '../../utils/prisma-json';
import { npcActions } from '../../rules/actions/catalogue';
import type { MaskedName, Viewer } from '../../rules/actions/actionCard';
import type { Rng } from '../../rules/actions/types';
import type { NpcStatBlockInput } from '../../validators/statBlock';
import type { Token } from '../../websocket/shared';
import {
  CANNOT_RESOLVE,
  GM_ONLY,
  INVALID_TARGET,
  NOT_SPENT,
  announce,
  chatName,
  defaultRng,
  maskFor,
  refuse,
  type Refusal,
} from './common';

/** The small card a recharge roll posts. A token players are not sent is named as "something invisible", and its id is left out. */
export interface RechargeCard {
  kind: 'recharge';
  tokenId?: string;
  name?: string;
  maskedName?: MaskedName;
  actionName: string;
  min: number;
  d6: number;
  recharged: boolean;
}

interface RechargeInput {
  mapId: string;
  tokenId: string;
  optionId: string;
}

/**
 * Under the map's lock, finds the token's spent recharge and asks `decide`
 * whether it comes back; brings it back when so.
 */
async function onSpentRecharge<T>(
  campaignId: string,
  input: RechargeInput,
  decide: (tx: Prisma.TransactionClient, token: Token, actionName: string, min: number) => Promise<{ back: boolean; result: T }>,
): Promise<{ ok: true; result: T } | Refusal> {
  return withMapsLocked([input.mapId], async (tx) => {
    const map = await tx.map.findUnique({ where: { id: input.mapId }, select: { campaignId: true, tokens: true } });
    if (!map || map.campaignId !== campaignId) return refuse(INVALID_TARGET);
    const tokens = readTokens(map.tokens);
    const index = tokens.findIndex((t) => t?.id === input.tokenId);
    if (index < 0) return refuse(INVALID_TARGET);
    const token = tokens[index];
    const spent = token.rechargeSpent ?? [];
    if (!spent.includes(input.optionId)) return refuse(NOT_SPENT);
    const option = token.statBlock && typeof token.statBlock === 'object'
      ? npcActions(token.statBlock as unknown as NpcStatBlockInput).find((s) => s.option.id === input.optionId)?.option
      : undefined;
    const min = option?.recharge?.min;
    if (!option || min === undefined) return refuse(CANNOT_RESOLVE);
    const { back, result } = await decide(tx, token, option.name, min);
    if (back) {
      tokens[index] = { ...token, rechargeSpent: spent.filter((id) => id !== input.optionId) };
      await tx.map.update({ where: { id: input.mapId }, data: { tokens: toJson(tokens) } });
    }
    return { ok: true as const, result };
  });
}

/** The GM's token changed: send the map again (its recharge is GM-only, so only the GM's copy shows it). */
async function tellTable(campaignId: string, requester: Viewer, input: RechargeInput): Promise<void> {
  await announce(campaignId, requester, { characters: [], hpCharacterIds: new Set(), tokenIds: [input.tokenId], mapId: input.mapId });
}

/** The GM rolls a d6 for a spent recharge: at or above its number, the action is back. Posts the roll to the chat. */
export async function rollRecharge(
  campaignId: string,
  requester: Viewer,
  input: RechargeInput,
  rng: Rng = defaultRng,
): Promise<{ ok: true; messageId: string; card: RechargeCard; recharged: boolean; d6: number } | Refusal> {
  if (requester.role !== 'GM') return refuse(GM_ONLY);
  const outcome = await onSpentRecharge(campaignId, input, async (tx, token, actionName, min) => {
    const d6 = rng(6);
    const recharged = d6 >= min;
    const masked = maskFor(token);
    const card: RechargeCard = { kind: 'recharge', actionName, min, d6, recharged };
    if (masked) card.maskedName = masked;
    else card.name = token.name;
    if (masked !== 'something-invisible') card.tokenId = token.id;
    const range = min < 6 ? `${min}–6` : '6';
    const created = await tx.message.create({
      data: {
        campaignId,
        userId: requester.userId,
        type: 'CHARACTER_ACTION',
        content: `${chatName(token.name, masked)}: recarga de ${actionName} (${range}): ${d6}, ${recharged ? 'recarregou' : 'ainda gasta'}`,
        metadata: toJson(card),
      },
      select: { id: true },
    });
    return { back: recharged, result: { messageId: created.id, card, recharged, d6 } };
  });
  if (!outcome.ok) return outcome;
  if (outcome.result.recharged) await tellTable(campaignId, requester, input);
  return { ok: true, ...outcome.result };
}

/** The GM brings a spent recharge back by hand, with no roll and nothing posted. */
export async function resetRecharge(campaignId: string, requester: Viewer, input: RechargeInput): Promise<{ ok: true } | Refusal> {
  if (requester.role !== 'GM') return refuse(GM_ONLY);
  const outcome = await onSpentRecharge(campaignId, input, async () => ({ back: true, result: null }));
  if (!outcome.ok) return outcome;
  await tellTable(campaignId, requester, input);
  return { ok: true };
}
