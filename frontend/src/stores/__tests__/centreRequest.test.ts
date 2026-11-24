import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';

describe('requestCentreOn', () => {
  beforeEach(() => useGameStore.getState().clearGameState());

  it('asking twice for the same token gives two different nonces', () => {
    useGameStore.getState().requestCentreOn('a');
    const first = useGameStore.getState().centreRequest!;
    useGameStore.getState().requestCentreOn('a');
    const second = useGameStore.getState().centreRequest!;
    expect(first.tokenId).toBe('a');
    expect(second.tokenId).toBe('a');
    expect(second.nonce).not.toBe(first.nonce);
  });

  it('is cleared with the rest of the game state', () => {
    useGameStore.getState().requestCentreOn('a');
    useGameStore.getState().clearGameState();
    expect(useGameStore.getState().centreRequest).toBeNull();
  });
});
