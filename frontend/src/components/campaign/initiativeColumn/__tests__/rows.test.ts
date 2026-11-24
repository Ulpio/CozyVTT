import { describe, it, expect } from 'vitest';
import { initiativeRows } from '../rows';
import type { CombatState, CombatantEntry } from '@/types';

function entry(over: Partial<CombatantEntry> & { tokenId: string }): CombatantEntry {
  return {
    mapId: 'm1', name: over.tokenId, imageUrl: `/${over.tokenId}.png`, initiative: 10,
    hp: { current: 5, max: 10, temp: 0 }, type: 'player', disposition: null, characterId: null,
    ...over,
  };
}

function combat(over: Partial<CombatState> = {}): CombatState {
  return {
    active: true, round: 1, currentTokenId: null, spend: {},
    combatants: [entry({ tokenId: 'a' }), entry({ tokenId: 'b' }), entry({ tokenId: 'c' })],
    ...over,
  };
}

describe('initiativeRows', () => {
  it('keeps the server order and marks the current turn', () => {
    const rows = initiativeRows(combat({ currentTokenId: 'b' }), { isGM: true });
    expect(rows.map(r => r.tokenId)).toEqual(['a', 'b', 'c']);
    expect(rows.map(r => r.current)).toEqual([false, true, false]);
  });

  it('shows a dash for a combatant who has not rolled', () => {
    const rows = initiativeRows(combat({
      combatants: [entry({ tokenId: 'a', initiative: null }), entry({ tokenId: 'b', initiative: 0 })],
    }), { isGM: true });
    expect(rows[0].value).toBe('–');
    expect(rows[1].value).toBe('0');
  });

  it('marks no row current when the current token is not in the list', () => {
    const rows = initiativeRows(combat({ currentTokenId: 'gone' }), { isGM: true });
    expect(rows.every(r => !r.current)).toBe(true);
  });

  it('shows HP to the GM on every row', () => {
    const rows = initiativeRows(combat({ combatants: [entry({ tokenId: 'n', type: 'npc' })] }), { isGM: true });
    expect(rows[0].hp).toEqual({ current: 5, max: 10, temp: 0 });
  });

  it('hides monster HP from a player', () => {
    const rows = initiativeRows(combat({
      combatants: [
        entry({ tokenId: 'n', type: 'npc' }),
        entry({ tokenId: 'o', type: 'object' }),
        entry({ tokenId: 'p', type: 'player' }),
      ],
    }), { isGM: false });
    expect(rows[0].hp).toBeNull();
    expect(rows[1].hp).toBeNull();
    expect(rows[2].hp).toEqual({ current: 5, max: 10, temp: 0 });
  });

  it('is empty when combat is not active', () => {
    expect(initiativeRows(combat({ active: false }), { isGM: true })).toEqual([]);
  });
});
