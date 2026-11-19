/**
 * The GM gives an item while the player has the sheet open: the server sends
 * `character.updated` with the new inventory, and the open 5E sheet shows the
 * item in its backpack with no reload (the real sheet, not a stand-in).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import type { CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';
import { fifthEditionCharacter } from '../../character-sheets/fifth-edition/__tests__/fifthEditionFixture';

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', platformRole: 'USER' } }),
  useOptionalAuth: () => ({ user: { id: 'user-1', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({
    socket: {
      rollDice: vi.fn(),
      emitHitDiceSpend: vi.fn(),
      on: (event: string, handler: Handler) => handlers.set(event, handler),
      off: (event: string) => handlers.delete(event),
    },
  }),
}));
vi.mock('@/services/api', () => ({ api: { getUser: vi.fn().mockResolvedValue({ user: { displayName: 'Owner' } }) } }));

const membership = { userId: 'user-1', campaignId: 'camp-1', role: 'PLAYER', characterIds: [] } as unknown as CampaignMembership;

describe('an open 5E sheet and an item the GM gives', () => {
  it('shows the new item in the backpack when character.updated arrives', () => {
    const character = fifthEditionCharacter();
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Inventory/ }));
    expect(within(screen.getByRole('group', { name: 'Backpack' })).getByRole('button', { name: /Rope/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Poção de Cura/ })).toBeNull();

    const data = character.data as unknown as { inventory: unknown[] };
    const updated = {
      ...character,
      updatedAt: '2026-01-01T00:00:05.000Z',
      data: { ...data, inventory: [...data.inventory, { id: 'i-2', name: 'Poção de Cura', quantity: 2, weight: 0.5, notes: '' }] },
    };
    act(() => handlers.get('character.updated')?.({ characterId: character.id, character: updated }));

    expect(within(screen.getByRole('group', { name: 'Backpack' })).getByRole('button', { name: /Poção de Cura/ })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Backpack' })).getByRole('button', { name: /Rope/ })).toBeInTheDocument();
  });
});
