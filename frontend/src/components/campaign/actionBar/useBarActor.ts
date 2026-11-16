// ============================================
// Whose bar it is
//
// A player's own character, by its token on the map being played: with
// several, the one picked by portrait, remembered per campaign. The GM's is
// the selected token, a character's or an NPC's, and none while nothing is
// selected. A spectator, a viewer outside a campaign, or any viewer of a
// campaign that is not 5e (the server resolves 5e sheets only) has no bar.
//
// `useActorSheet` reads the sheet of a character actor (its AC, its spell
// slots, its checks), kept current from the table's live updates. Only the
// actor's own sheet is ever read, never another token's numbers.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import socketClient from '@/services/socket';
import { optionalStorage } from '@/utils/optionalStorage';
import type { Character, Token } from '@/types';

export interface BarActor { token: Token; kind: 'character' | 'npc' }

const storageKey = (campaignId: string) => `cozyvtt-action-bar-actor:${campaignId}`;

/** The actor, with the player's own tokens to pick from and the way to pick one. */
export function useBarActorChoice(): { actor: BarActor | null; candidates: Token[]; choose: (tokenId: string) => void } {
  const { userRole, campaign, currentMap } = useCampaign();
  const { user } = useAuth();
  const tokens = useGameStore((s) => s.tokens);
  const tokenOrder = useGameStore((s) => s.tokenOrder);
  const tokensMapId = useGameStore((s) => s.tokensMapId);
  const selectedTokenId = useGameStore((s) => s.selectedTokenId);
  const campaignId = campaign?.id;
  const fifthEdition = campaign?.gameSystem === 'FIFTH_EDITION';
  const [chosen, setChosen] = useState<string | null>(() => (campaignId ? optionalStorage.getItem(storageKey(campaignId)) : null));

  // A campaign of another id brings its own remembered pick.
  useEffect(() => {
    setChosen(campaignId ? optionalStorage.getItem(storageKey(campaignId)) : null);
  }, [campaignId]);

  const choose = useCallback((tokenId: string) => {
    setChosen(tokenId);
    if (campaignId) optionalStorage.setItem(storageKey(campaignId), tokenId);
  }, [campaignId]);

  const candidates = useMemo(() => {
    if (!fifthEdition || userRole !== 'PLAYER' || !user || !currentMap || tokensMapId !== currentMap.id) return [];
    const mine = new Set((campaign?.characters ?? []).filter((c) => c.userId === user.id).map((c) => c.id));
    return tokenOrder.map((id) => tokens[id]).filter((t): t is Token => !!t && t.characterId !== null && mine.has(t.characterId));
  }, [fifthEdition, userRole, user, currentMap, tokensMapId, campaign?.characters, tokenOrder, tokens]);

  const actor = useMemo<BarActor | null>(() => {
    if (!fifthEdition) return null;
    if (userRole === 'GM') {
      const selected = selectedTokenId ? tokens[selectedTokenId] : undefined;
      if (!selected || !currentMap || tokensMapId !== currentMap.id) return null;
      return { token: selected, kind: selected.characterId ? 'character' : 'npc' };
    }
    const picked = candidates.find((t) => t.id === chosen) ?? candidates[0];
    return picked ? { token: picked, kind: 'character' } : null;
  }, [fifthEdition, userRole, selectedTokenId, tokens, currentMap, tokensMapId, candidates, chosen]);

  return { actor, candidates, choose };
}

export function useBarActor(): BarActor | null {
  return useBarActorChoice().actor;
}

/** The sheet of a character actor, fetched and kept current; null for an NPC or while unread. */
export function useActorSheet(characterId: string | null): Character | null {
  const [sheet, setSheet] = useState<{ id: string; character: Character } | null>(null);

  useEffect(() => {
    if (!characterId) return;
    let live = true;
    const load = () => {
      api.getCharacter(characterId)
        .then(({ character }) => { if (live) setSheet({ id: characterId, character }); })
        .catch(() => { /* No sheet: the bar goes without its numbers. */ });
    };
    load();
    const onUpdated = (data: { characterId?: string; character?: Character }) => {
      if (data?.characterId === characterId && data.character) setSheet({ id: characterId, character: data.character });
    };
    const onHp = (data: { characterId?: string }) => { if (data?.characterId === characterId) load(); };
    socketClient.on('character.updated', onUpdated);
    socketClient.on('character.hp.updated', onHp);
    return () => {
      live = false;
      socketClient.off('character.updated', onUpdated);
      socketClient.off('character.hp.updated', onHp);
    };
  }, [characterId]);

  return sheet && sheet.id === characterId ? sheet.character : null;
}
