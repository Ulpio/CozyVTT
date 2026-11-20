/**
 * Sending a map to the table again after a change to what players are sent,
 * when it is the map on screen. Kept apart from the routes so services that
 * change tokens (darkvision, the actions) can use it without importing them.
 */

import { prisma } from '../config/database';
import logger from '../utils/logger';
import { inBackgroundAfter } from '../utils/backgroundWork';
import { broadcastMapData } from '../websocket/shared';
import { getSocketInstance } from '../websocket/utils';

export async function resendIfCurrent(campaignId: string, map: Parameters<typeof broadcastMapData>[2]): Promise<void> {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } });
    if (campaign?.currentMapId === map.id) await broadcastMapData(getSocketInstance(), campaignId, map);
  } catch (err) {
    logger.warn('Map not re-sent to the table; the change stands', { err, mapId: map.id });
  }
}

/**
 * resendIfCurrent for the token routes, which a player may call for a token
 * they control as often as the request limit allows. Each re-send builds the
 * map for every member, with sight on a lit map, so these routes ask for one
 * and it goes at most once per TOKEN_RESEND_MS for each map, read as it
 * stands when it goes: a burst of changes reaches the table as one map
 * carrying them all. The window is fixed from the first request, so a steady
 * stream cannot put the re-send off, or multiply it.
 */
const TOKEN_RESEND_MS = 100;
const pendingTokenResends = new Set<string>();

export function resendSoonIfCurrent(campaignId: string, mapId: string): void {
  const key = `${campaignId}:${mapId}`;
  if (pendingTokenResends.has(key)) return;
  pendingTokenResends.add(key);
  inBackgroundAfter('the map re-sent after a token change', TOKEN_RESEND_MS, async () => {
    pendingTokenResends.delete(key);
    try {
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (map && map.campaignId === campaignId) await resendIfCurrent(campaignId, map);
    } catch (err) {
      logger.warn('Map not re-sent to the table after a token change; the change stands', { err, mapId });
    }
  });
}
