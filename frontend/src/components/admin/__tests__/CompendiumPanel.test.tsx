/**
 * The admin's Compendium tab: search the entries, open one, correct its
 * text or data, see the server's message when the data is refused, and see
 * that an entry was corrected.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CompendiumPanel from '../CompendiumPanel';
import type { CompendiumEntry } from '@/types';

const getCompendiumBooks = vi.fn();
const searchCompendium = vi.fn();
const getCompendiumEntry = vi.fn();
const updateCompendiumEntry = vi.fn();
vi.mock('@/services/api', () => {
  const client = {
    getCompendiumBooks: (...a: unknown[]) => getCompendiumBooks(...a),
    searchCompendium: (...a: unknown[]) => searchCompendium(...a),
    getCompendiumEntry: (...a: unknown[]) => getCompendiumEntry(...a),
    updateCompendiumEntry: (...a: unknown[]) => updateCompendiumEntry(...a),
  };
  return { api: client, default: client };
});

const entry: CompendiumEntry = {
  id: 'e1',
  bookId: 'phb',
  type: 'spell',
  slug: 'raio-teste',
  name: 'Raio Teste',
  nameEn: 'Test Ray',
  text: 'Um raio inventado.',
  data: { level: 1 },
  editedAt: null,
  editedById: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCompendiumBooks.mockResolvedValue([{ id: 'phb', name: 'Livro do Jogador', gameSystem: 'FIFTH_EDITION' }]);
  searchCompendium.mockResolvedValue({ items: [{ id: 'e1', bookId: 'phb', type: 'spell', slug: 'raio-teste', name: 'Raio Teste', nameEn: 'Test Ray' }], total: 1 });
  getCompendiumEntry.mockResolvedValue(entry);
});

async function openEntry() {
  render(<CompendiumPanel />);
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'raio' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(await screen.findByRole('button', { name: /Raio Teste/ }));
  await screen.findByDisplayValue('Um raio inventado.');
}

describe('CompendiumPanel', () => {
  it('shows an item icon beside weapons, armour and gear, and none beside a spell', async () => {
    searchCompendium.mockResolvedValue({
      items: [
        { id: 'e1', bookId: 'phb', type: 'spell', slug: 'raio-teste', name: 'Raio Teste', nameEn: null },
        { id: 'e2', bookId: 'phb', type: 'weapon', slug: 'espada-longa', name: 'Espada longa', nameEn: null },
        { id: 'e3', bookId: 'phb', type: 'gear', slug: 'tocha', name: 'Tocha', nameEn: null },
      ],
      total: 3,
    });
    render(<CompendiumPanel />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const sword = await screen.findByRole('button', { name: /Espada longa/ });
    expect(sword.querySelector('[data-testid="item-icon"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Tocha/ }).querySelector('[data-testid="item-icon"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Raio Teste/ }).querySelector('[data-testid="item-icon"]')).toBeNull();
  });

  it('searches and lists entries', async () => {
    render(<CompendiumPanel />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'raio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('button', { name: /Raio Teste/ })).toBeTruthy();
    expect(searchCompendium).toHaveBeenCalledWith(expect.objectContaining({ q: 'raio' }));
    expect(screen.getByText('1 entry')).toBeTruthy();
  });

  it('saves a corrected text', async () => {
    updateCompendiumEntry.mockResolvedValue({ ...entry, text: 'Corrigido.', editedAt: '2026-11-14T12:00:00.000Z' });
    await openEntry();
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Corrigido.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(updateCompendiumEntry).toHaveBeenCalled());
    expect(updateCompendiumEntry.mock.calls[0][0]).toBe('e1');
    expect(updateCompendiumEntry.mock.calls[0][1]).toMatchObject({ text: 'Corrigido.', data: { level: 1 } });
  });

  it("shows the server's message when the data is invalid", async () => {
    updateCompendiumEntry.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { message: 'data.level: Too big' } } });
    await openEntry();
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText('data.level: Too big')).toBeTruthy();
  });

  it('refuses data that is not JSON before sending it', async () => {
    await openEntry();
    fireEvent.change(screen.getByLabelText('Data (JSON)'), { target: { value: '{ level: ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText('The data is not valid JSON.')).toBeTruthy();
    expect(updateCompendiumEntry).not.toHaveBeenCalled();
  });

  it('shows when an entry was corrected', async () => {
    getCompendiumEntry.mockResolvedValue({ ...entry, editedAt: '2026-11-14T12:00:00.000Z' });
    await openEntry();
    expect(screen.getByText(/Corrected on/)).toBeTruthy();
  });
});
