/**
 * The creature library and the compendium's books: a Monster Manual creature
 * shows its book, only the admin may correct it (Edit), nobody deletes it,
 * and the source filter offers the book.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreatureTemplate } from '@/types';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: 'FIFTH_EDITION' }, currentMap: null, viewedMap: null }),
}));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const auth = vi.hoisted(() => ({ role: 'USER' }));
vi.mock('@/contexts/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 'u1', platformRole: auth.role } }),
}));

const api = vi.hoisted(() => ({
  listCreatures: vi.fn(),
  getSeedStatus: vi.fn(),
  listCreatureFavorites: vi.fn(),
  toggleCreatureFavorite: vi.fn(),
  getCompendiumBooks: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));

import CreatureLibrary from '../CreatureLibrary';

const goblin = {
  id: 'c1', name: 'Goblin', source: 'mm', challengeRating: '1/4', imageUrl: null, gameSystem: 'FIFTH_EDITION',
  statBlock: { ac: 15, speed: '9 m', abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 } },
  size: { width: 1, height: 1 }, disposition: 'hostile', displayMode: 'pog', campaignId: null,
} as unknown as CreatureTemplate;

beforeEach(() => {
  vi.clearAllMocks();
  auth.role = 'USER';
  api.listCreatures.mockResolvedValue({ creatures: [goblin], total: 1 });
  api.getSeedStatus.mockResolvedValue({ srdCount: 0 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.getCompendiumBooks.mockResolvedValue([
    { id: 'mm', name: 'Manual dos Monstros', gameSystem: 'FIFTH_EDITION' },
    { id: 'srd', name: 'SRD 5.1 (inglês)', gameSystem: 'FIFTH_EDITION' },
  ]);
});

async function openGoblin() {
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await screen.findByText('Goblin');
  await userEvent.click(screen.getByRole('button', { name: /Goblin/, expanded: false }));
}

it('labels a Monster Manual creature with its book', async () => {
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  const row = (await screen.findByText('Goblin')).closest('button')!;
  expect(await within(row).findByText('Manual dos Monstros')).toBeTruthy();
});

it('offers Edit on a book creature to the admin only, and Delete to nobody', async () => {
  await openGoblin();
  expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete Goblin' })).toBeNull();
});

it('offers Edit on a book creature to the admin', async () => {
  auth.role = 'ADMIN';
  await openGoblin();
  expect(await screen.findByRole('button', { name: /Edit/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Delete Goblin' })).toBeNull();
});

it('filters by the Monster Manual', async () => {
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await screen.findByText('Goblin');
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const select = await screen.findByDisplayValue('All Sources');
  await screen.findByRole('option', { name: 'Manual dos Monstros' });
  fireEvent.change(select, { target: { value: 'mm' } });
  await waitFor(() => expect(api.listCreatures).toHaveBeenLastCalledWith('campaign-1', expect.objectContaining({ source: 'mm' })));
});
