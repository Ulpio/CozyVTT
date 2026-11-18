/** The concentration question shows wherever the table is drawn, bar or no bar. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useActionStore } from '@/stores/actionStore';
import { useGameStore } from '@/stores/gameStore';
import { h, token, longsword } from './barHarness';

vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'camp-1' }, currentMap: { id: 'map-1' } }) }));
vi.mock('@/services/actions.service', () => ({ actionsService: { list: async () => ({ options: [longsword] }), resolve: vi.fn() } }));
vi.mock('@/services/api', () => ({ api: { getCharacter: async () => ({ character: { id: 'c1', gameSystem: 'FIFTH_EDITION', updatedAt: '1', data: { concentratingOn: { name: 'Bless' } } } }) } }));
vi.mock('@/services/socket', () => ({ default: { on: () => undefined, off: () => undefined } }));

import ConcentrationDialog from '../ConcentrationDialog';

beforeEach(() => {
  cleanup();
  void h;
  act(() => {
    useGameStore.getState().clearGameState();
    useGameStore.getState().setTokens([token({ id: 't1', characterId: 'c1' })], 'map-1');
    useActionStore.setState({ pending: null, concentrationConfirm: null });
  });
});

describe('the concentration dialog', () => {
  it('asks what is held and what replaces it, and Replace confirms', async () => {
    const confirm = vi.fn(async () => ({ ok: true }));
    useActionStore.setState({ confirmConcentration: confirm });
    render(<ConcentrationDialog />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => { useActionStore.setState({ concentrationConfirm: { mapId: 'map-1', actorTokenId: 't1', actionId: 'attack:0', mode: 'normal' } }); });
    await screen.findByText(/concentrating on Bless\. Replace it with Longsword/);
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(confirm).toHaveBeenCalled();
  });
});
