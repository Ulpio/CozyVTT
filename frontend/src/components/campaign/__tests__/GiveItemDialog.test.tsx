/**
 * The GM's "Give item..." dialog: search the compendium (items only, the
 * campaign's books) or write a free item, then `character.item.give` and show
 * the server's answer as it comes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  giveItem: vi.fn(),
  searchCompendium: vi.fn(),
  noSocket: false,
}));

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: h.noSocket ? null : { giveItem: h.giveItem }, isConnected: true }),
}));
vi.mock('@/services/api', () => ({
  api: { searchCompendium: (...a: unknown[]) => h.searchCompendium(...a) },
  default: { searchCompendium: (...a: unknown[]) => h.searchCompendium(...a) },
}));

import i18n from '@/i18n';
import GiveItemDialog from '../GiveItemDialog';

const POTION = { id: 'e1', bookId: 'phb', type: 'gear', slug: 'pocao-de-cura', name: 'Poção de Cura', nameEn: 'Potion of Healing' };

function open(onClose = vi.fn(), onGiven = vi.fn()) {
  render(<GiveItemDialog campaignId="c1" characterId="c-ana" characterName="Ana" onClose={onClose} onGiven={onGiven} />);
  return { onClose, onGiven };
}

async function pickPotion() {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'poção' } });
  fireEvent.click(await screen.findByRole('button', { name: /Poção de Cura/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.noSocket = false;
  h.searchCompendium.mockImplementation(async (p: { type: string }) =>
    p.type === 'gear' ? { items: [POTION], total: 1 } : { items: [], total: 0 });
  h.giveItem.mockResolvedValue({ ok: true, noticeSent: true });
});

describe('GiveItemDialog', () => {
  it('searches only item types, in the campaign’s books', async () => {
    open();
    await pickPotion();

    const calls = h.searchCompendium.mock.calls.map((c) => c[0] as { type: string; campaignId: string; q: string });
    expect(calls.map((c) => c.type).sort()).toEqual(['armor', 'gear', 'magicItem', 'pack', 'tool', 'weapon']);
    expect(calls.every((c) => c.campaignId === 'c1' && c.q === 'poção')).toBe(true);
  });

  it('gives a compendium item by its reference and quantity, then closes saying so', async () => {
    const { onClose, onGiven } = open();
    await pickPotion();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Give' }));

    await waitFor(() => expect(onGiven).toHaveBeenCalledWith(true));
    expect(h.giveItem).toHaveBeenCalledWith({ characterId: 'c-ana', ref: { bookId: 'phb', slug: 'pocao-de-cura' }, quantity: 2 });
    expect(onClose).toHaveBeenCalled();
  });

  it('gives a free item with its name and notes', async () => {
    const { onGiven } = open();
    fireEvent.click(screen.getByRole('radio', { name: 'Free item' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Amuleto da vovó' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Brilha à noite' } });
    fireEvent.click(screen.getByRole('button', { name: 'Give' }));

    await waitFor(() => expect(onGiven).toHaveBeenCalled());
    expect(h.giveItem).toHaveBeenCalledWith({ characterId: 'c-ana', name: 'Amuleto da vovó', notes: 'Brilha à noite', quantity: 1 });
  });

  it('says why Give is off when the quantity is not a whole number from 1 to 999', async () => {
    open();
    await pickPotion();
    const qty = screen.getByLabelText('Quantity');
    expect(screen.queryByText('From 1 to 999')).not.toBeInTheDocument();
    for (const bad of ['0', '1000', '', '2.5']) {
      fireEvent.change(qty, { target: { value: bad } });
      expect(screen.getByText('From 1 to 999')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Give' })).toBeDisabled();
    }
    fireEvent.change(qty, { target: { value: '3' } });
    expect(screen.queryByText('From 1 to 999')).not.toBeInTheDocument();
  });

  it('does not give a free item with no name', () => {
    open();
    fireEvent.click(screen.getByRole('radio', { name: 'Free item' }));
    expect(screen.getByRole('button', { name: 'Give' })).toBeDisabled();
  });

  it('shows the server’s refusal in the dialog and stays open', async () => {
    h.giveItem.mockResolvedValue({ ok: false, error: 'A mochila está cheia.' });
    const { onClose, onGiven } = open();
    await pickPotion();
    fireEvent.click(screen.getByRole('button', { name: 'Give' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A mochila está cheia.');
    expect(onClose).not.toHaveBeenCalled();
    expect(onGiven).not.toHaveBeenCalled();
  });

  it('shows a flood refusal and a timeout in the app language', async () => {
    await i18n.changeLanguage('pt-BR');
    try {
      h.giveItem.mockResolvedValueOnce({ ok: false, error: 'Too many items given at once. Wait a moment, then try again.' });
      open();
      await pickPotion();
      fireEvent.click(screen.getByRole('button', { name: 'Dar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Itens demais de uma vez. Espere um instante e tente de novo.');
      h.giveItem.mockResolvedValueOnce({ ok: false, error: 'No answer from the server' });
      fireEvent.click(screen.getByRole('button', { name: 'Dar' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('O servidor não respondeu. Confira a conexão e tente de novo.'));
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('reports a delivery with no notice when nobody plays the character', async () => {
    h.giveItem.mockResolvedValue({ ok: true, noticeSent: false });
    const { onGiven } = open();
    await pickPotion();
    fireEvent.click(screen.getByRole('button', { name: 'Give' }));

    await waitFor(() => expect(onGiven).toHaveBeenCalledWith(false));
  });

  it('says so when there is no connection', async () => {
    h.noSocket = true;
    open();
    await pickPotion();
    fireEvent.click(screen.getByRole('button', { name: 'Give' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not connected to the server.');
  });
});
