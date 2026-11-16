/** A bar action's card in the chat: a player's view, the GM's view, undo and concentration. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useGameStore } from '@/stores/gameStore';
import { MessageType, type Message } from '@/types';
import type { ActionCardView } from '@/types/actions';

const h = { role: 'PLAYER' as string, userId: 'u1' };
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: h.role, campaign: { id: 'camp-1', characters: [{ id: 'c1', userId: 'u1' }, { id: 'c2', userId: 'u2' }] }, currentMap: { id: 'map-1' } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.userId } }) }));
const undo = vi.fn();
const concentration = vi.fn();
vi.mock('@/services/actions.service', () => ({ actionsService: { undo: (...a: unknown[]) => undo(...a), concentration: (...a: unknown[]) => concentration(...a) } }));

import ChatMessage from '../ChatMessage';

const playerCard = {
  kind: 'action', actor: { tokenId: 'a1', name: 'Mara' }, actionName: 'Longsword', mode: 'disadvantage', disadvantageReason: 'long-range',
  targets: [
    { tokenId: 'g1', name: 'Goblin', isCharacter: false, state: 'badly-wounded', attack: { d20s: [15, 3], natural: 3, total: 11, hit: true, critical: false }, damage: [{ total: 7, type: 'slashing', breakdown: '1d8+3' }] },
    { tokenId: 'x1', maskedName: 'something-invisible', isCharacter: false },
    { tokenId: 'c1t', name: 'Mara', isCharacter: true, hp: { current: 4, max: 12, temp: 2 }, concentrationCheckDc: 10 },
  ],
} as unknown as ActionCardView;

const gmCard = {
  kind: 'action', actor: { tokenId: 'a1', name: 'Mara', userId: 'u1' }, actionName: 'Longsword', mode: 'normal', extraText: 'Goblin bleeds',
  targets: [
    { tokenId: 'g1', name: 'Goblin', isCharacter: false, showHpBar: false, ac: 15, hitChance: 55, hpBefore: 7, hpAfter: 0, hpMax: 7, attack: { d20s: [18], natural: 18, total: 22, hit: true, critical: false }, damage: [{ total: 7, type: 'slashing', breakdown: '1d8+3' }] },
    { tokenId: 'c1t', name: 'Mara', isCharacter: true, showHpBar: true, ac: 14, hpBefore: 9, hpAfter: 4, hpMax: 12, concentrationCheckDc: 10 },
  ],
  undo: { hp: [] },
} as unknown as ActionCardView;

const msg = (metadata: unknown): Message => ({ id: 'm1', campaignId: 'camp-1', userId: 'u1', type: MessageType.CHARACTER_ACTION, content: 'texto em portugues', metadata, createdAt: new Date().toISOString() }) as unknown as Message;

beforeEach(() => {
  cleanup();
  undo.mockReset();
  concentration.mockReset();
  h.role = 'PLAYER';
  h.userId = 'u1';
  act(() => {
    useGameStore.getState().clearGameState();
    useGameStore.getState().setTokens([{ id: 'c1t', characterId: 'c1', name: 'Mara' }, { id: 'g1', characterId: null, name: 'Goblin' }] as never, 'map-1');
  });
});

describe('an action card in chat', () => {
  it("shows a player the target's state, the masked name, and no AC", () => {
    render(<ChatMessage message={msg(playerCard)} />);
    expect(screen.getByText('Mara → Goblin, Something invisible, Mara · Longsword', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Goblin: badly wounded')).toBeInTheDocument();
    expect(screen.getByText(/Something invisible/)).toBeInTheDocument();
    expect(screen.getByText(/disadvantage: long range/i)).toBeInTheDocument();
    expect(screen.getByText(/Hit/)).toBeInTheDocument();
    expect(screen.getByText(/7 slashing/)).toBeInTheDocument();
    expect(screen.getByText(/HP 4\/12/)).toBeInTheDocument();
    expect(screen.queryByText(/AC/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByText('texto em portugues')).toBeNull();
  });

  it('shows the GM the numbers and an Undo that undoes the message', async () => {
    h.role = 'GM';
    undo.mockResolvedValue({ ok: true });
    render(<ChatMessage message={msg(gmCard)} />);
    expect(screen.getByText(/against AC 15/)).toBeInTheDocument();
    expect(screen.getByText(/55%/)).toBeInTheDocument();
    expect(screen.getByText(/HP 7 → 0/)).toBeInTheDocument();
    expect(screen.getByText('Goblin bleeds')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledWith('m1');
  });

  it('says why the GM was refused, in a toast', async () => {
    h.role = 'GM';
    undo.mockResolvedValue({ ok: false, error: 'Already undone' });
    render(<ChatMessage message={msg(gmCard)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('That action was already undone.')).toBeInTheDocument();
  });

  it('drops the Undo and says Undone once the card is undone', () => {
    h.role = 'GM';
    const { rerender } = render(<ChatMessage message={msg(gmCard)} />);
    rerender(<ChatMessage message={msg({ ...gmCard, undoneAt: '2026-01-01T00:00:00Z' })} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByText('Undone')).toBeInTheDocument();
    rerender(<ChatMessage message={msg({ ...gmCard, undoneAt: '2026-01-01T00:00:00Z', undoPartial: true })} />);
    expect(screen.getByText('Partly undone: the HP changed afterwards')).toBeInTheDocument();
  });

  it("offers concentration to the target's owner only, once", async () => {
    concentration.mockResolvedValue({ ok: true });
    const { rerender } = render(<ChatMessage message={msg(playerCard)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Concentration check (DC 10)' }));
    expect(concentration).toHaveBeenCalledWith('m1', 'c1t');
    rerender(<ChatMessage message={msg({ ...playerCard, targets: [playerCard.targets[0], { ...playerCard.targets[2], concentrationRolledAt: 'now' }] })} />);
    expect(screen.queryByRole('button', { name: /Concentration check/ })).toBeNull();
    cleanup();
    h.userId = 'u2';
    render(<ChatMessage message={msg(playerCard)} />);
    expect(screen.queryByRole('button', { name: /Concentration check/ })).toBeNull();
  });

  it('gives the GM the concentration button too', () => {
    h.role = 'GM';
    h.userId = 'gm';
    render(<ChatMessage message={msg(gmCard)} />);
    expect(screen.getByRole('button', { name: 'Concentration check (DC 10)' })).toBeInTheDocument();
  });

  it('shows no HP line for a target with no hit points tracked', () => {
    const card = { ...playerCard, targets: [{ tokenId: 'g1', name: 'Statue', isCharacter: false }] };
    render(<ChatMessage message={msg(card)} />);
    expect(screen.queryByText(/Statue:/)).toBeNull();
  });

  it('draws a concentration roll as one line', () => {
    render(<ChatMessage message={msg({ kind: 'concentration', actionMessageId: 'm0', tokenId: 'c1t', name: 'Mara', dc: 10, d20: 12, bonus: 2, total: 14, kept: true })} />);
    expect(screen.getByText(/Mara: concentration check \(DC 10\): 14, keeps concentration/)).toBeInTheDocument();
    expect(screen.queryByText(/actionMessageId/)).toBeNull();
    void waitFor;
  });
});
