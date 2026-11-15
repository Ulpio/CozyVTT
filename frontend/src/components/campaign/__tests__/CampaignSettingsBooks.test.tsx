/**
 * The campaign's books in the settings dialog: read when it opens, saved as
 * soon as one is ticked, and put back as they were when the save fails.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Campaign } from '@/types';

const { showToast, getCampaignBooks, setCampaignBooks } = vi.hoisted(() => ({
  showToast: vi.fn(), getCampaignBooks: vi.fn(), setCampaignBooks: vi.fn(),
}));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'c1', name: 'The Keep', description: '', memberships: [], ownerId: 'dm', gameSystem: 'FIFTH_EDITION' } as unknown as Campaign,
    refreshCampaign: vi.fn(),
    userRole: 'GM',
  }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }) }));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/services/api', () => ({ default: { getCampaignBooks, setCampaignBooks } }));

import CampaignSettingsModal from '../CampaignSettingsModal';

const books = [
  { id: 'phb', name: 'Livro do Jogador', enabled: true },
  { id: 'mm', name: 'Manual dos Monstros', enabled: false },
];

beforeEach(() => {
  showToast.mockReset();
  getCampaignBooks.mockReset().mockResolvedValue(books);
  setCampaignBooks.mockReset();
});

it('saves the books as soon as one is ticked', async () => {
  setCampaignBooks.mockResolvedValue(books.map((b) => ({ ...b, enabled: true })));
  render(<CampaignSettingsModal isOpen onClose={vi.fn()} onDeleted={vi.fn()} />);
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Manual dos Monstros' }));
  expect(setCampaignBooks).toHaveBeenCalledWith('c1', ['phb', 'mm']);
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Manual dos Monstros' })).toBeChecked());
});

it('puts the books back and says why when the save fails', async () => {
  setCampaignBooks.mockRejectedValue({ response: { data: { message: 'This campaign cannot use the book mm' } } });
  render(<CampaignSettingsModal isOpen onClose={vi.fn()} onDeleted={vi.fn()} />);
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Manual dos Monstros' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('This campaign cannot use the book mm', 'error'));
  expect(screen.getByRole('checkbox', { name: 'Manual dos Monstros' })).not.toBeChecked();
});
