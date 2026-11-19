/**
 * The tracker's turn economy: the pips and movement of each combatant the
 * viewer was sent a spend record for, the GM's "Give back" menu, and the
 * rest for the party the GM calls while no fight is on.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import InitiativeTracker from '../InitiativeTracker';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { freshSpend } from '@/utils/turnEconomy';

const seat = vi.hoisted(() => ({ role: 'GM' }));
const emitCombatRestore = vi.hoisted(() => vi.fn());
const takeRest = vi.hoisted(() => vi.fn());

const mapTokens = vi.hoisted(() => ({ list: [] as unknown[] }));
const roster = vi.hoisted(() => ({
  characters: [] as Array<{ id: string; userId: string }>,
  memberships: [] as Array<{ userId: string; role: string }>,
}));

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    userRole: seat.role,
    currentMap: { id: 'map-1', tokens: mapTokens.list },
    viewedMap: { id: 'map-1' },
    campaign: { id: 'c1', characters: roster.characters, memberships: roster.memberships },
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'alice', platformRole: 'USER' } }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitCombatRestore, takeRest }, isConnected: true }),
}));

const token = (id: string, over: Partial<Token> = {}): Token => ({
  id, name: id, characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, ...over,
} as Token);

const entry = (tokenId: string, name: string, initiative: number): CombatantEntry => ({
  tokenId, mapId: 'map-1', name, imageUrl: '', initiative, hp: null, type: 'npc', disposition: null, characterId: null,
});

const fight = (spend: Record<string, ReturnType<typeof freshSpend>>, active = true) => useGameStore.getState().setCombatState({
  active, round: 1, currentTokenId: 'h', spend,
  combatants: [entry('h', 'Hero', 18), entry('g', 'Goblin', 12)],
});

beforeEach(() => {
  seat.role = 'GM';
  emitCombatRestore.mockReset();
  takeRest.mockReset().mockResolvedValue({ ok: true });
  mapTokens.list = [];
  roster.characters = [];
  roster.memberships = [];
  useGameStore.getState().setTokens([token('h'), token('g')]);
});

describe('the pips of a combatant', () => {
  it('shows what a combatant has spent and the movement it made', () => {
    fight({ h: { ...freshSpend(), action: true, movedFeet: 15 }, g: freshSpend() });
    render(<InitiativeTracker />);
    const row = screen.getByText('Hero').closest('div[class*="group/combatant"]') as HTMLElement;
    expect(within(row).getByLabelText('Action: used')).toBeInTheDocument();
    expect(within(row).getByLabelText('Bonus: free')).toBeInTheDocument();
    expect(within(row).getByLabelText('Reaction: free')).toBeInTheDocument();
    expect(within(row).getByText('4,5 m')).toBeInTheDocument();
  });

  it('shows no pips to a player for a token it was sent no spend for', () => {
    seat.role = 'PLAYER';
    fight({});
    render(<InitiativeTracker />);
    expect(screen.queryByLabelText(/: (free|used)$/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Give back/ })).toBeNull();
  });
});

describe('Give back', () => {
  it('lets the GM give an action back', () => {
    fight({ h: { ...freshSpend(), action: true }, g: freshSpend() });
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Give back for Hero' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Action' }));
    expect(emitCombatRestore).toHaveBeenCalledWith({ tokenId: 'h', what: 'action' });
  });

  it('offers the bonus action, reaction, movement, attack and object interaction too', () => {
    fight({ h: freshSpend(), g: freshSpend() });
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Give back for Hero' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Action', 'Bonus action', 'Reaction', 'Movement', 'Attack', 'Object interaction']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Object interaction' }));
    expect(emitCombatRestore).toHaveBeenCalledWith({ tokenId: 'h', what: 'interaction' });
  });
});

describe('Rest for the party', () => {
  it('sends the characters of the player tokens, once each, and none of a creature', () => {
    roster.characters = [{ id: 'c-bob', userId: 'bob' }, { id: 'c-npc', userId: 'gm' }, { id: 'c-ann', userId: 'ann' }];
    roster.memberships = [{ userId: 'bob', role: 'PLAYER' }, { userId: 'gm', role: 'GM' }, { userId: 'ann', role: 'PLAYER' }];
    mapTokens.list = [
      token('t1', { type: TokenType.PLAYER, characterId: 'c-bob' }),
      token('t2', { type: TokenType.PLAYER, characterId: 'c-bob' }),
      token('t3', { type: TokenType.NPC, characterId: 'c-npc' }),
      token('t4', { type: TokenType.NPC, characterId: 'c-ann' }),
      token('t5', { type: TokenType.NPC }),
    ];
    fight({}, false);
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Rest for the party' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Long rest' }));
    expect(takeRest).toHaveBeenCalledWith({ characterIds: ['c-bob', 'c-ann'], kind: 'long' });
  });

  it('is off when the map has no player character', () => {
    fight({}, false);
    render(<InitiativeTracker />);
    expect(screen.getByRole('button', { name: 'Rest for the party' })).toBeDisabled();
  });

  it('is not offered during a fight', () => {
    fight({ h: freshSpend(), g: freshSpend() });
    render(<InitiativeTracker />);
    expect(screen.queryByRole('button', { name: 'Rest for the party' })).toBeNull();
  });
});
