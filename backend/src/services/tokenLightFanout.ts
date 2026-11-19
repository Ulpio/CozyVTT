/**
 * Telling a map's readers that token lights changed (set by hand over the
 * socket, or lit by an item in hand): shared so both say it the same way and
 * neither leaks more than the other. Kept apart from the socket handlers so
 * services can use it.
 */

import type { Server } from 'socket.io';
import type { Map as MapRow } from '@prisma/client';
import type { WallSegment } from '../types/walls';
import type { AuthenticatedSocket } from '../websocket/auth';
import type { Token } from '../websocket/shared';
import { bestEffort, campaignSockets, stillInCampaign } from '../websocket/utils';
import { canReadMap } from './permissions';
import {
  getSpiritVisibilityBatch, filterTokensByRole, playerSightOnLitMap, viewerIdFor, mapLights, tokenLightsOf,
} from '../utils/spirit-layer';

/** What of a map decides which tokens its readers are sent and the ground its token lights light. */
export type LitMap = { tokens: Token[] } & Pick<MapRow, 'width' | 'height' | 'gridSize' | 'lightingEnabled' | 'wallSegments' | 'lights' | 'globalIllumination'>;

/**
 * Tell a map's readers of `changed` tokens' lights changing, the map having
 * gone from `before` to `after`: each token's light to the GM and to its
 * controller (`token.light.updated`), who are sent its light anyway; the map's
 * token lights as lit ground to everyone (`map.tokenLights`); and on a lit
 * map, to each player, the tokens the change brings into or takes out of
 * their sight (`token:appeared`, `token:disappeared`), their own apart. Only
 * what changed is named, so a token they never saw stays unnamed.
 * Best-effort: the light is stored by now.
 */
export async function sendTokenLightChange(
  io: Server,
  campaignId: string,
  changed: Token[],
  mapId: string,
  currentMapId: string | null,
  before: LitMap,
  after: LitMap
): Promise<void> {
  await bestEffort('token light change', async () => {
    const members = await campaignSockets(io, campaignId);
    const playerIds = members
      .map((s) => s as unknown as AuthenticatedSocket)
      .filter((a) => a.role !== 'GM' && a.userId)
      .map((a) => a.userId as string);
    const spiritVisibility = await getSpiritVisibilityBatch(campaignId, playerIds);
    const ground = { mapId, tokenLights: tokenLightsOf(after) };
    // Only when the lit ground changed: a light on a token the GM hides, or
    // one set to what it was, tells nobody else anything.
    const groundChanged = JSON.stringify(ground.tokenLights) !== JSON.stringify(tokenLightsOf(before));
    const lights = changed.map((token) => ({ token, lit: { mapId, tokenId: token.id, light: token.light ?? null } }));
    const lightsBefore = mapLights(before);
    const lightsAfter = mapLights(after);
    for (const s of stillInCampaign(members, campaignId)) {
      const member = s as unknown as AuthenticatedSocket;
      if (!canReadMap(member.role, mapId, currentMapId)) continue;
      if (member.role === 'GM') {
        for (const { lit } of lights) s.emit('token.light.updated', lit);
        if (groundChanged) s.emit('map.tokenLights', ground);
        continue;
      }
      if (!member.userId) continue;
      const viewer = viewerIdFor(member.role, member.userId);
      const spiritVisible = spiritVisibility.get(member.userId) ?? false;
      const role = member.role ?? 'PLAYER';
      const forRole = filterTokensByRole(after.tokens, role, spiritVisible, member.userId);
      for (const { token, lit } of lights) {
        if (viewer && token.controlledBy === viewer && forRole.some((t) => t.id === token.id)) s.emit('token.light.updated', lit);
      }
      if (groundChanged) s.emit('map.tokenLights', ground);
      if (!after.lightingEnabled || !groundChanged) continue;
      const sightOf = (map: LitMap, mapLit: ReturnType<typeof mapLights>) => playerSightOnLitMap(
        filterTokensByRole(map.tokens, role, spiritVisible, member.userId), viewer,
        map.wallSegments as unknown as WallSegment[], map.width, map.height, map.gridSize, mapLit, map.globalIllumination
      );
      const was = sightOf(before, lightsBefore);
      const now = sightOf(after, lightsAfter);
      for (const other of forRole) {
        if (viewer && other.controlledBy === viewer) continue;
        const seenNow = now.seesToken(other);
        if (seenNow === was.seesToken(other)) continue;
        if (seenNow) s.emit('token:appeared', { token: other, mapId });
        else s.emit('token:disappeared', { tokenId: other.id, mapId });
      }
    }
  });
}
