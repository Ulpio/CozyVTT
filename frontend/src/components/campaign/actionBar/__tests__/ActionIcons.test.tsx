/**
 * Each spell, common action, feature and check on the bar carries a decorative icon.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useGameStore } from '@/stores/gameStore';
import { useActionStore } from '@/stores/actionStore';
import { h, token, longsword, fireBolt, rage } from './barHarness';
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    userRole: h.role,
    campaign: { id: 'camp-1', gameSystem: h.gameSystem, detailLevel: h.detailLevel, characters: h.characters },
    currentMap: { id: 'map-1' },
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.userId } }) }));
vi.mock('@/services/actions.service', () => ({
  actionsService: {
    list: (...a: unknown[]) => h.list(...a),
    resolve: vi.fn(async () => ({ ok: true })),
    recharge: (...a: unknown[]) => h.recharge(...a),
    rechargeReset: (...a: unknown[]) => h.rechargeReset(...a),
  },
}));
vi.mock('@/services/api', () => ({ api: { getCharacter: (id: string) => h.getCharacter(id) } }));
vi.mock('@/hooks/useTableRoll', () => ({ useTableRoll: () => h.roll }));
vi.mock('@/services/socket', () => ({
  default: {
    equipItem: (...a: unknown[]) => h.equip(...a),
    on: (e: string, fn: (d: unknown) => void) => { (h.handlers.get(e) ?? h.handlers.set(e, new Set()).get(e)!).add(fn); },
    off: (e: string, fn: (d: unknown) => void) => { h.handlers.get(e)?.delete(fn); },
  },
}));


import ActionBar from '../ActionBar';

const dash = { id: 'common:dash', name: 'Dash', group: 'common', resolution: 'post', cost: 'action' } as const;
const fighterSheet = {
  id: 'c-fighter', gameSystem: 'FIFTH_EDITION', name: 'Brienne', updatedAt: '1',
  data: {
    armorClass: 18, level: 5, hp: { current: 40, maximum: 44, temporary: 0 },
    stats: { strength: { score: 16, modifier: 3 } },
    skills: { athletics: { proficient: true, bonus: 6 } },
    inventory: [{ name: 'Longsword' }],
  },
};

beforeEach(() => {
  cleanup();
  h.role = 'PLAYER'; h.gameSystem = 'FIFTH_EDITION'; h.userId = 'u1';
  h.characters = [{ id: 'c-fighter', userId: 'u1', name: 'Brienne' }];
  h.options = { 'tok-fighter': [longsword, fireBolt, rage, dash] };
  h.sheets = { 'c-fighter': fighterSheet };
  h.combat = undefined;
  h.list.mockImplementation(async (_m: string, actor: string) => ({ options: h.options[actor] ?? [] }));
  h.getCharacter.mockImplementation(async (id: string) => ({ character: h.sheets[id] }));
  h.handlers.clear();
  window.localStorage.clear();
  act(() => {
    useActionStore.setState({ pending: null, mode: 'normal', concentrationConfirm: null, lastError: null });
    useGameStore.getState().clearGameState();
    useGameStore.getState().setTokens([token({ id: 'tok-fighter', characterId: 'c-fighter', name: 'Brienne', type: 'PC' as never })], 'map-1');
  });
});

async function openMenu(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('group', { name });
}

describe('icons on the action bar', () => {
  it('shows an icon beside every spell', async () => {
    render(<ActionBar />);
    const panel = await openMenu('Spells');
    const button = within(panel).getByRole('button', { name: 'Fire Bolt' });
    expect(within(button).getAllByTestId('action-icon')).toHaveLength(1);
  });

  it('shows an icon beside each common action, feature and check', async () => {
    render(<ActionBar />);
    for (const [menu, name] of [['Common actions', 'Dash'], ['Features', /^Rage/], ['Checks', /^Athletics/]] as const) {
      const panel = await openMenu(menu);
      const button = within(panel).getByRole('button', { name });
      expect(within(button).getAllByTestId('action-icon')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: menu }));
    }
  });

  it('the icon is hidden from screen readers', async () => {
    render(<ActionBar />);
    const panel = await openMenu('Spells');
    const icons = within(panel).getAllByTestId('action-icon');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
  });
});
