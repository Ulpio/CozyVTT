/** The saves waiting on this user: read back on joining, kept up to date by the chat's cards. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlayerActionCard } from '@/types/actions';

const pendingSaves = vi.fn();
const save = vi.fn();
vi.mock('@/services/actions.service', () => ({
  actionsService: { pendingSaves: (...a: unknown[]) => pendingSaves(...a), save: (...a: unknown[]) => save(...a) },
}));

import { usePendingSaveStore, pendingSaveRows } from '../pendingSaveStore';

const fireball = (over: Partial<PlayerActionCard> = {}, target: Record<string, unknown> = {}): PlayerActionCard => ({
  kind: 'action',
  actor: { tokenId: 'w1', name: 'Merlin' },
  actionName: 'Fireball',
  mode: 'normal',
  save: { ability: 'dex', dc: 15, halfOnSave: true },
  pendingSaves: 1,
  targets: [
    { tokenId: 'c1t', name: 'Mara', isCharacter: true, save: { ability: 'dex', dc: 15, status: 'pending' }, yourSave: true, ...target },
    { tokenId: 'g1', name: 'Goblin', isCharacter: false, save: { ability: 'dex', dc: 15, status: 'rolled', success: false } },
  ],
  ...over,
} as PlayerActionCard);

beforeEach(() => {
  pendingSaves.mockReset();
  save.mockReset();
  usePendingSaveStore.getState().clear();
});

describe('the pending save store', () => {
  it('loads a pending card the chat page does not hold, as one row per save of mine', async () => {
    pendingSaves.mockResolvedValue([{ messageId: 'old-1', card: fireball() }]);
    await usePendingSaveStore.getState().load();
    expect(pendingSaveRows(usePendingSaveStore.getState().entries)).toEqual([
      { messageId: 'old-1', targetTokenId: 'c1t', actionName: 'Fireball', actorName: 'Merlin', targetName: 'Mara', ability: 'dex', dc: 15 },
    ]);
  });

  it('keeps what it has when the server does not answer', async () => {
    usePendingSaveStore.getState().apply('m1', fireball());
    pendingSaves.mockResolvedValue(null);
    await usePendingSaveStore.getState().load();
    expect(usePendingSaveStore.getState().entries).toHaveLength(1);
  });

  it('takes no card with nothing for me to roll (the GM, or someone else\'s save)', async () => {
    const notMine = fireball({}, { yourSave: undefined });
    pendingSaves.mockResolvedValue([{ messageId: 'm1', card: notMine }]);
    await usePendingSaveStore.getState().load();
    expect(usePendingSaveStore.getState().entries).toEqual([]);
  });

  it('adds a new card and drops it once the save is rolled', () => {
    const store = usePendingSaveStore.getState();
    store.apply('m1', fireball());
    expect(usePendingSaveStore.getState().entries).toHaveLength(1);
    usePendingSaveStore.getState().apply('m1', fireball({ pendingSaves: 0 }, { yourSave: undefined, save: { ability: 'dex', dc: 15, status: 'rolled', success: true, total: 17 } }));
    expect(usePendingSaveStore.getState().entries).toEqual([]);
  });

  it('drops a card that is undone, or whose target is', () => {
    usePendingSaveStore.getState().apply('m1', fireball());
    usePendingSaveStore.getState().apply('m1', fireball({ undoneAt: 'now' }));
    expect(usePendingSaveStore.getState().entries).toEqual([]);
    usePendingSaveStore.getState().apply('m2', fireball());
    usePendingSaveStore.getState().apply('m2', fireball({}, { undoneAt: 'now' }));
    expect(usePendingSaveStore.getState().entries).toEqual([]);
  });

  it('ignores a message that is not an action card', () => {
    usePendingSaveStore.getState().apply('m1', { kind: 'concentration' });
    usePendingSaveStore.getState().apply('m2', null);
    expect(usePendingSaveStore.getState().entries).toEqual([]);
  });

  it('rolls through the server with the mode picked', async () => {
    save.mockResolvedValue({ ok: true });
    const answer = await usePendingSaveStore.getState().roll('m1', 'c1t', 'advantage');
    expect(save).toHaveBeenCalledWith('m1', 'c1t', 'advantage');
    expect(answer).toEqual({ ok: true });
    expect(usePendingSaveStore.getState().rolling).toEqual({});
  });
});
