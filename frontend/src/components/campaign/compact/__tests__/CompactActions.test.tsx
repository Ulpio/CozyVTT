/**
 * The compact layout's Actions button: drawn only for a viewer who has an
 * action bar, and it opens the bar in a sheet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TableHosts } from '@/components/campaign/tableHosts';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { useGameStore } from '@/stores/gameStore';
import { CampaignStatus } from '@/types';
import type { Campaign } from '@/types';
import { h, token, longsword } from '@/components/campaign/actionBar/__tests__/barHarness';

vi.mock('react-router', () => ({ useNavigate: () => () => undefined }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: h.role, campaign: { id: 'camp-1', gameSystem: h.gameSystem, characters: h.characters }, currentMap: { id: 'map-1' } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.userId } }) }));
vi.mock('@/contexts/WebSocketContext', () => {
  const ws = { status: 'connected', error: null, reconnect: () => undefined };
  return { useWebSocket: () => ws, useOptionalWebSocket: () => ws };
});
vi.mock('@/services/actions.service', () => ({ actionsService: { list: async () => ({ options: [longsword] }), resolve: vi.fn(), pendingSaves: async () => [] } }));
vi.mock('@/services/api', () => ({ api: { getCharacter: async () => ({ character: { id: 'c1', gameSystem: 'FIFTH_EDITION', name: 'B', updatedAt: '1', data: {} } }) } }));
vi.mock('@/hooks/useTableRoll', () => ({ useTableRoll: () => vi.fn() }));
vi.mock('@/services/socket', () => ({ default: { on: () => undefined, off: () => undefined } }));

import CompactTable from '../CompactTable';

const campaign = { id: 'camp-1', name: 'The Sunken Crown', status: CampaignStatus.ACTIVE, ownerId: 'owner', memberships: [], characters: [] } as unknown as Campaign;

function table() {
  render(
    <LayoutProvider compact>
      <TableHosts parts={{ map: <div />, session: <div />, party: <div /> }}>
        <CompactTable campaign={campaign} isOwner={false} onOpenTool={vi.fn()} onOpenDocuments={vi.fn()} onOpenShortcuts={vi.fn()} />
      </TableHosts>
    </LayoutProvider>
  );
}

beforeEach(() => {
  cleanup();
  h.role = 'PLAYER';
  h.gameSystem = 'FIFTH_EDITION';
  h.userId = 'u1';
  h.characters = [{ id: 'c1', userId: 'u1', name: 'B' }];
  act(() => {
    useGameStore.getState().clearGameState();
    useGameStore.getState().setTokens([token({ id: 't1', characterId: 'c1', name: 'Brienne' })], 'map-1');
  });
});

describe('the Actions button', () => {
  it('opens the action bar in a sheet', async () => {
    table();
    const bar = screen.getByRole('navigation', { name: 'Table' });
    fireEvent.click(within(bar).getByRole('button', { name: /^Actions/ }));
    expect(await screen.findByRole('button', { name: 'Longsword' })).toBeInTheDocument();
  });

  it('is not there outside a 5e campaign', () => {
    h.gameSystem = 'HORROR_D100';
    table();
    expect(within(screen.getByRole('navigation', { name: 'Table' })).queryByRole('button', { name: /^Actions/ })).toBeNull();
  });

  it('is not there for a player with no token on the map', () => {
    h.characters = [];
    table();
    expect(within(screen.getByRole('navigation', { name: 'Table' })).queryByRole('button', { name: /^Actions/ })).toBeNull();
  });
});

describe('the action bar away from its sheet', () => {
  it('shows the concentration question with the sheet closed', async () => {
    const { useActionStore } = await import('@/stores/actionStore');
    table();
    act(() => { useActionStore.setState({ concentrationConfirm: { mapId: 'map-1', actorTokenId: 't1', actionId: 'attack:0', mode: 'normal' } }); });
    expect(await screen.findByRole('heading', { name: 'Concentration' })).toBeInTheDocument();
    act(() => { useActionStore.setState({ concentrationConfirm: null }); });
  });

  it('shows the target hint with Cancel while an action waits and the sheet is closed', async () => {
    const { useActionStore } = await import('@/stores/actionStore');
    table();
    act(() => { useActionStore.setState({ pending: { actorTokenId: 't1', option: longsword, picked: [], area: null } }); });
    expect(screen.getByText('Choose a target for Longsword')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useActionStore.getState().pending).toBeNull();
  });
});

describe('the target hint with several targets', () => {
  it('counts the picks and confirms them', async () => {
    const { useActionStore } = await import('@/stores/actionStore');
    const confirmPending = vi.fn(async () => ({ ok: true }));
    const rays = { id: 'spell:rays', name: 'Scorching Ray', group: 'spell' as const, resolution: 'attack' as const, spellLevel: 2, targeting: { kind: 'multi' as const, count: 3, perSlot: 1, distinct: false } };
    table();
    act(() => { useActionStore.setState({ pending: { actorTokenId: 't1', option: rays, slotLevel: 3, picked: ['a', 'b'], area: null }, confirmPending } as never); });
    expect(screen.getByText('Choose a target for each ray of Scorching Ray')).toBeInTheDocument();
    expect(screen.getByText('2 of 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    act(() => { useActionStore.setState((s) => ({ pending: { ...s.pending!, picked: ['a', 'b', 'a', 'c'] } })); });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(confirmPending).toHaveBeenCalled();
    act(() => { useActionStore.setState({ pending: null }); });
  });
});

describe('the target hint with an area around the caster', () => {
  it('offers Confirm at once, with no tap', async () => {
    const { useActionStore } = await import('@/stores/actionStore');
    const aura = { id: 'spell:aura', name: 'Aura', group: 'spell' as const, resolution: 'save' as const, cost: 'action' as const, spellLevel: 1, reach: { kind: 'self' as const }, targeting: { kind: 'area' as const, area: { shape: 'sphere' as const, sizeFt: 10 }, origin: 'self' as const } };
    table();
    act(() => { useActionStore.getState().begin({ actorTokenId: 't1', option: aura, slotLevel: 1 }); });
    expect(screen.getByText('Aura around the caster: Confirm to cast')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    act(() => { useActionStore.setState({ pending: null }); });
  });
});
