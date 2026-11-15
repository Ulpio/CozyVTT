/**
 * The books a campaign uses, as the create and settings modals show them:
 * one box per book of its system, ticked when the campaign uses it.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CampaignBooksPicker from '../CampaignBooksPicker';

const books = [
  { id: 'phb', name: 'Livro do Jogador', enabled: true },
  { id: 'mm', name: 'Manual dos Monstros', enabled: false },
];

it('shows a box per book, ticked when the campaign uses it', () => {
  render(<CampaignBooksPicker books={books} onChange={vi.fn()} />);
  expect(screen.getByRole('group', { name: 'Books in this campaign' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Livro do Jogador' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Manual dos Monstros' })).not.toBeChecked();
});

it('sends the new list of books when one is ticked or unticked', async () => {
  const onChange = vi.fn();
  render(<CampaignBooksPicker books={books} onChange={onChange} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Manual dos Monstros' }));
  expect(onChange).toHaveBeenLastCalledWith(['phb', 'mm']);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Livro do Jogador' }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

it('says so when the system has no books', () => {
  render(<CampaignBooksPicker books={[]} onChange={vi.fn()} />);
  expect(screen.getByText('This system has no books yet.')).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('lets nobody change the books when disabled', () => {
  render(<CampaignBooksPicker books={books} onChange={vi.fn()} disabled />);
  for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
});
