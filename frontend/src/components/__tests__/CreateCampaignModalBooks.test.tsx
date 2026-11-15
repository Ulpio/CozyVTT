/**
 * New Campaign offers the books of the chosen system, ticked but for the
 * English SRD, and creates the campaign with the ones left ticked.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { createCampaign, getCompendiumBooks } = vi.hoisted(() => ({ createCampaign: vi.fn(), getCompendiumBooks: vi.fn() }));
vi.mock('@/services/campaign.service', () => ({ default: { createCampaign } }));
vi.mock('@/services/api', () => ({ default: { getCompendiumBooks } }));

import CreateCampaignModal from '../CreateCampaignModal';

beforeEach(() => {
  createCampaign.mockReset().mockResolvedValue({ id: 'c1', name: 'x' });
  getCompendiumBooks.mockReset().mockResolvedValue([
    { id: 'phb', name: 'Livro do Jogador', gameSystem: 'FIFTH_EDITION' },
    { id: 'srd', name: 'SRD 5.1', gameSystem: 'FIFTH_EDITION' },
  ]);
});

const open = () => render(<CreateCampaignModal isOpen onClose={() => {}} onSuccess={() => {}} />);

it('shows no books until a system is chosen', async () => {
  open();
  await waitFor(() => expect(getCompendiumBooks).toHaveBeenCalled());
  expect(screen.queryByRole('group', { name: 'Books in this campaign' })).not.toBeInTheDocument();
});

it("ticks the system's books but the English SRD, and creates the campaign with the ticked ones", async () => {
  open();
  await userEvent.type(screen.getByPlaceholderText('The Lantern Road'), 'Mesa');
  await userEvent.selectOptions(screen.getByLabelText('Game System'), 'FIFTH_EDITION');
  expect(await screen.findByRole('checkbox', { name: 'Livro do Jogador' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'SRD 5.1' })).not.toBeChecked();

  await userEvent.click(screen.getByRole('checkbox', { name: 'SRD 5.1' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create Campaign' }));
  await waitFor(() => expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({ gameSystem: 'FIFTH_EDITION', bookIds: ['phb', 'srd'] })));
});
