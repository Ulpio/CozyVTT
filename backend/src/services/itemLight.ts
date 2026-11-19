/**
 * A torch, lamp, lantern or candle in a character's hands lights their tokens.
 * The light follows the hands: it is worked out again after every equip change
 * and when a token is placed. A light the GM or a player set by hand
 * (`source: 'manual'`) is never touched; only a light this service lit
 * (`source: 'item'`) is changed or put out.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { readTokens, toJson } from '../utils/prisma-json';
import { withMapsLocked } from '../utils/mapTokens';
import type { Item } from '../utils/inventory';
import type { TokenLight } from '../utils/tokenLights';
import logger from '../utils/logger';
import { getSocketInstance } from '../websocket/utils';
import type { Token } from '../websocket/shared';
import { sendTokenLightChange, type LitMap } from './tokenLightFanout';

const WARM = '#ffcc66';

/** Light by compendium slug: bright and dim radius in squares. `lanterna-furta-fogo` is not a light. */
const BY_SLUG: Record<string, [number, number]> = {
  tocha: [4, 8],
  lampada: [3, 6],
  'lanterna-coberta': [6, 12],
  vela: [1, 2],
};

/** Light by the start of a hand-typed name (accents and case ignored). */
const BY_NAME: Array<[string[], [number, number]]> = [
  [['tocha', 'torch'], [4, 8]],
  [['lampiao', 'lampada', 'lamp'], [3, 6]],
  [['lanterna', 'lantern'], [6, 12]],
  [['vela', 'candle'], [1, 2]],
];

const HANDS = new Set(['main', 'off', 'both']);

function plain(text: unknown): string {
  return typeof text === 'string' ? text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() : '';
}

function radiiOf(item: Item): [number, number] | null {
  const ref = item.compendiumRef;
  if (ref && typeof ref.slug === 'string') return BY_SLUG[ref.slug] ?? null;
  const name = plain(item.name);
  for (const [prefixes, radii] of BY_NAME) if (prefixes.some((p) => name.startsWith(p))) return radii;
  return null;
}

/** Whether the item is a light (a torch, lamp, lantern or candle), wherever it is carried. */
export function givesLight(item: Item): boolean {
  return radiiOf(item) !== null;
}

/**
 * The light the items in the hands give: the biggest (by `dimRadius`) of the
 * light items in `main`, `off` or `both`, or null when none is held.
 */
export function itemLightFor(inventory: Item[]): TokenLight | null {
  let best: { radii: [number, number]; item: Item } | null = null;
  for (const item of Array.isArray(inventory) ? inventory : []) {
    if (!item || !HANDS.has(item.slot as string)) continue;
    const radii = radiiOf(item);
    if (radii && (!best || radii[1] > best.radii[1])) best = { radii, item };
  }
  if (!best) return null;
  return {
    brightRadius: best.radii[0],
    dimRadius: best.radii[1],
    color: WARM,
    source: 'item',
    ...(typeof best.item.id === 'string' ? { itemId: best.item.id } : {}),
  };
}

const sameLight = (a: TokenLight | null | undefined, b: TokenLight | null): boolean =>
  (a ?? null) === null || b === null
    ? (a ?? null) === b
    : a!.brightRadius === b.brightRadius && a!.dimRadius === b.dimRadius && a!.color === b.color && a!.source === b.source && a!.itemId === b.itemId;

const inventoryOf = (sheet: unknown): Item[] => {
  const inventory = typeof sheet === 'object' && sheet !== null ? (sheet as { inventory?: unknown }).inventory : undefined;
  return Array.isArray(inventory) ? (inventory as Item[]) : [];
};

/**
 * The light a new token of this character starts with: the item light of what
 * the sheet holds, or null. Only for a 5e sheet.
 */
export function itemLightForSheet(sheet: unknown, gameSystem: string | null): TokenLight | null {
  return gameSystem === 'FIFTH_EDITION' ? itemLightFor(inventoryOf(sheet)) : null;
}

/**
 * Set every token of the character, on every map, to the light their hands
 * give, skipping tokens with a manual light and writing only the tokens whose
 * light changes. Players and the GM are told as a light set by hand is. Returns
 * how many tokens changed.
 */
export async function syncItemLight(characterId: string): Promise<number> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true, gameSystem: true } });
  if (!character || character.gameSystem !== 'FIFTH_EDITION') return 0;
  const light = itemLightFor(inventoryOf(character.data));
  const maps = await prisma.$queryRaw<Array<{ id: string; campaignId: string }>>`
    SELECT id, "campaignId" FROM "Map" WHERE tokens @> ${JSON.stringify([{ characterId }])}::jsonb
  `;
  let changed = 0;
  for (const map of maps) {
    const outcome = await withMapsLocked([map.id], async (tx: Prisma.TransactionClient) => {
      const fresh = await tx.map.findUniqueOrThrow({
        where: { id: map.id },
        select: {
          tokens: true, width: true, height: true, gridSize: true, lightingEnabled: true, wallSegments: true,
          lights: true, globalIllumination: true, campaign: { select: { currentMapId: true } },
        },
      });
      const tokens = readTokens(fresh.tokens);
      const touched: Token[] = [];
      const next = tokens.map((t) => {
        if (t?.characterId !== characterId || t.light?.source === 'manual' || sameLight(t.light, light)) return t;
        const updated = { ...t, light };
        touched.push(updated as Token);
        return updated;
      });
      if (touched.length === 0) return null;
      await tx.map.update({ where: { id: map.id }, data: { tokens: toJson(next) } });
      return {
        touched,
        currentMapId: fresh.campaign.currentMapId,
        before: { ...fresh, tokens } as LitMap,
        after: { ...fresh, tokens: next } as LitMap,
      };
    });
    if (!outcome) continue;
    changed += outcome.touched.length;
    try {
      await sendTokenLightChange(getSocketInstance(), map.campaignId, outcome.touched, map.id, outcome.currentMapId, outcome.before, outcome.after);
    } catch (error) {
      logger.warn('Item light not sent to the table; the change stands', { err: error, mapId: map.id });
    }
  }
  return changed;
}
