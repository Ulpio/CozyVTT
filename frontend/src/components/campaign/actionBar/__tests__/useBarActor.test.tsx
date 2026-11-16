/**
 * Whose bar it is: a player's own character token on this map (the one chosen
 * by portrait when there are several, remembered per campaign), the GM's
 * selected token, nobody for a spectator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGameStore } from '@/stores/gameStore';
import { h, token } from './barHarness';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: h.role, campaign: { id: 'camp-1', characters: h.characters }, currentMap: { id: 'map-1' } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.userId } }) }));

import { useBarActor, useBarActorChoice } from '../useBarActor';

beforeEach(() => {
  h.role = 'PLAYER';
  h.userId = 'u1';
  h.characters = [{ id: 'c1', userId: 'u1', name: 'A' }, { id: 'c2', userId: 'u1', name: 'B' }, { id: 'c3', userId: 'u2', name: 'C' }];
  window.localStorage.clear();
  act(() => {
    useGameStore.getState().clearGameState();
    useGameStore.getState().setTokens([
      token({ id: 't1', characterId: 'c1' }), token({ id: 't2', characterId: 'c2' }), token({ id: 't3', characterId: 'c3' }),
      token({ id: 'npc' }),
    ], 'map-1');
  });
});

describe('useBarActor', () => {
  it("is a player's own character token", () => {
    h.characters = h.characters.filter((c) => c.id !== 'c2');
    const { result } = renderHook(() => useBarActor());
    expect(result.current?.token.id).toBe('t1');
    expect(result.current?.kind).toBe('character');
  });

  it('with several, takes the first and then the one chosen, remembered', () => {
    const { result, rerender } = renderHook(() => useBarActorChoice());
    expect(result.current.actor?.token.id).toBe('t1');
    expect(result.current.candidates.map((t) => t.id)).toEqual(['t1', 't2']);
    act(() => result.current.choose('t2'));
    expect(result.current.actor?.token.id).toBe('t2');
    expect(window.localStorage.getItem('cozyvtt-action-bar-actor:camp-1')).toBe('t2');
    rerender();
    const again = renderHook(() => useBarActor());
    expect(again.result.current?.token.id).toBe('t2');
  });

  it('is null when the player has no token here', () => {
    h.userId = 'u9';
    const { result } = renderHook(() => useBarActor());
    expect(result.current).toBeNull();
  });

  it('is null for a spectator', () => {
    h.role = 'SPECTATOR';
    const { result } = renderHook(() => useBarActor());
    expect(result.current).toBeNull();
  });

  it('is the GM\'s selected token, npc or character, and null with none', () => {
    h.role = 'GM';
    h.userId = 'gm';
    const { result } = renderHook(() => useBarActor());
    expect(result.current).toBeNull();
    act(() => { useGameStore.getState().selectToken('npc'); });
    expect(result.current).toMatchObject({ kind: 'npc' });
    act(() => { useGameStore.getState().selectToken('t3'); });
    expect(result.current).toMatchObject({ kind: 'character' });
  });
});
