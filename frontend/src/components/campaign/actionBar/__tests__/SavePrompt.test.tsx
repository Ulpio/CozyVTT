/** The banner over the map: one row per save waiting on this player, with the three roll modes. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PlayerActionCard } from '@/types/actions';

const pendingSaves = vi.fn();
const save = vi.fn();
vi.mock('@/services/actions.service', () => ({
  actionsService: { pendingSaves: (...a: unknown[]) => pendingSaves(...a), save: (...a: unknown[]) => save(...a) },
}));
const ws = {
  joinedEpoch: 1,
  handlers: new Map<string, (data: unknown) => void>(),
};
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    joinedEpoch: ws.joinedEpoch,
    socket: {
      onChatMessage: (fn: (d: unknown) => void) => ws.handlers.set('chat.message', fn),
      onChatMessageUpdated: (fn: (d: unknown) => void) => ws.handlers.set('chat.message.updated', fn),
      off: (e: string) => ws.handlers.delete(e),
    },
  }),
}));
const role = { value: 'PLAYER' };
vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ userRole: role.value }) }));

import SavePrompt from '../SavePrompt';
import { usePendingSaveStore } from '@/stores/pendingSaveStore';

const card = (yourSave = true): PlayerActionCard => ({
  kind: 'action',
  actor: { tokenId: 'w1', name: 'Merlin' },
  actionName: 'Fireball',
  mode: 'normal',
  save: { ability: 'dex', dc: 15, halfOnSave: true },
  pendingSaves: 1,
  targets: [{ tokenId: 'c1t', name: 'Mara', isCharacter: true, save: { ability: 'dex', dc: 15, status: 'pending' }, ...(yourSave ? { yourSave: true as const } : {}) }],
});

beforeEach(() => {
  cleanup();
  pendingSaves.mockReset();
  save.mockReset();
  ws.handlers.clear();
  ws.joinedEpoch = 1;
  role.value = 'PLAYER';
  usePendingSaveStore.getState().clear();
});

describe('the save prompt', () => {
  it('asks for the pending saves on joining and shows one row with the three modes', async () => {
    pendingSaves.mockResolvedValue([{ messageId: 'm1', card: card() }]);
    render(<SavePrompt />);
    const row = await screen.findByRole('group', { name: "Merlin's Fireball — Dexterity saving throw DC 15" });
    expect(pendingSaves).toHaveBeenCalledTimes(1);
    expect(within(row).getByRole('button', { name: 'Normal' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Advantage' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Disadvantage' })).toBeInTheDocument();
  });

  it('sends action.save with the mode picked', async () => {
    pendingSaves.mockResolvedValue([{ messageId: 'm1', card: card() }]);
    save.mockResolvedValue({ ok: true });
    render(<SavePrompt />);
    const row = await screen.findByRole('group', { name: /Fireball/ });
    await act(async () => { fireEvent.click(within(row).getByRole('button', { name: 'Disadvantage' })); });
    expect(save).toHaveBeenCalledWith('m1', 'c1t', 'disadvantage');
  });

  it('says why a roll was refused', async () => {
    pendingSaves.mockResolvedValue([{ messageId: 'm1', card: card() }]);
    save.mockResolvedValue({ ok: false, error: 'Already rolled' });
    render(<SavePrompt />);
    fireEvent.click(within(await screen.findByRole('group', { name: /Fireball/ })).getByRole('button', { name: 'Normal' }));
    expect(await screen.findByText('That roll was already made.')).toBeInTheDocument();
  });

  it('shows a new card from the chat and leaves when its update says the save is rolled', async () => {
    pendingSaves.mockResolvedValue([]);
    render(<SavePrompt />);
    await act(async () => {});
    act(() => ws.handlers.get('chat.message')?.({ id: 'm2', type: 'CHARACTER_ACTION', metadata: card() }));
    expect(screen.getByRole('group', { name: /Fireball/ })).toBeInTheDocument();
    act(() => ws.handlers.get('chat.message.updated')?.({ id: 'm2', metadata: card(false) }));
    expect(screen.queryByRole('group', { name: /Fireball/ })).toBeNull();
  });

  it('asks again on rejoining', async () => {
    pendingSaves.mockResolvedValue([]);
    const { rerender } = render(<SavePrompt />);
    await act(async () => {});
    ws.joinedEpoch = 2;
    rerender(<SavePrompt />);
    await act(async () => {});
    expect(pendingSaves).toHaveBeenCalledTimes(2);
  });

  it('asks nothing for a spectator', async () => {
    role.value = 'SPECTATOR';
    render(<SavePrompt />);
    await act(async () => {});
    expect(pendingSaves).not.toHaveBeenCalled();
  });
});
