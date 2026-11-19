import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { InventoryPanel } from '../components/InventoryPanel';
import { useGameStore } from '@/stores/gameStore';
import type { FifthEditionInventoryItem } from '@/types/game-systems';

const socket = {
  equipItem: vi.fn(),
  openPack: vi.fn(),
  recoverAmmo: vi.fn(),
};
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({ socket }),
}));

const ranger = (): FifthEditionInventoryItem[] => [
  { id: 'bow', name: 'Arco longo', quantity: 1, weight: 4, slot: 'both', equipped: true, compendiumRef: { bookId: 'phb', slug: 'arco-longo' } },
  { id: 'arrows', name: 'Flechas', quantity: 20, weight: 0.05, slot: 'ammo', equipped: true, compendiumRef: { bookId: 'phb', slug: 'flechas-20' } },
  { id: 'dagger', name: 'Adaga', quantity: 1, weight: 1, compendiumRef: { bookId: 'phb', slug: 'adaga' } },
  { id: 'pack', name: 'Pacote de Explorador', quantity: 1, weight: 10, compendiumRef: { bookId: 'phb', slug: 'pacote-de-explorador' } },
  { id: 'rope', name: 'Corda de cânhamo', quantity: 1, weight: 10 },
  { id: 'rations', name: 'Rações de viagem (1 dia)', quantity: 10, weight: 2 },
];

const base = {
  characterId: 'char-1',
  inventory: ranger(),
  currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 },
  strengthScore: 10,
  detailLevel: 'FAITHFUL' as const,
  canAct: true,
};

beforeEach(() => {
  Object.values(socket).forEach((fn) => fn.mockReset().mockResolvedValue({ ok: true, ac: 12, acUnknown: false }));
});
afterEach(() => {
  useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [], spend: {} });
});

const slot = (name: string) => screen.getByRole('group', { name });

describe('the inventory panel', () => {
  it('shows the four slots and the backpack for the ranger', () => {
    render(<InventoryPanel {...base} />);
    const main = slot('Main hand');
    const off = slot('Off hand');
    expect(within(main).getByText('Arco longo')).toBeInTheDocument();
    expect(within(off).getByText('Arco longo')).toBeInTheDocument();
    expect(within(slot('Armour')).queryByText('Arco longo')).toBeNull();
    expect(within(slot('Ammunition')).getByText('Flechas')).toBeInTheDocument();
    const pack = screen.getByRole('group', { name: 'Backpack' });
    expect(within(pack).getByRole('button', { name: 'Adaga' })).toBeInTheDocument();
    expect(within(pack).queryByRole('button', { name: 'Arco longo' })).toBeNull();
    expect(within(pack).getByText('10')).toBeInTheDocument();
  });

  it('equips the dagger in the main hand', async () => {
    render(<InventoryPanel {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Adaga/ }));
    fireEvent.click(screen.getByRole('button', { name: 'In the main hand' }));
    expect(socket.equipItem).toHaveBeenCalledWith({ characterId: 'char-1', itemId: 'dagger', slot: 'main' });
  });

  it('stows a held item', async () => {
    render(<InventoryPanel {...base} />);
    fireEvent.click(within(slot('Main hand')).getByRole('button', { name: /Arco longo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Stow' }));
    expect(socket.equipItem).toHaveBeenCalledWith({ characterId: 'char-1', itemId: 'bow', slot: null });
  });

  it('shows the refusal the server gives', async () => {
    socket.equipItem.mockResolvedValue({ ok: false, error: 'Esse item não vai nesse espaço.' });
    render(<InventoryPanel {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Adaga/ }));
    fireEvent.click(screen.getByRole('button', { name: 'With both hands' }));
    expect(await screen.findByText('Esse item não vai nesse espaço.')).toBeInTheDocument();
  });

  it('says when the armour class was not adjusted', async () => {
    socket.equipItem.mockResolvedValue({ ok: true, ac: 10, acUnknown: true });
    render(<InventoryPanel {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Adaga/ }));
    fireEvent.click(screen.getByRole('button', { name: 'In the main hand' }));
    expect(await screen.findByText('The AC was not adjusted: this armour is not in the compendium.')).toBeInTheDocument();
  });

  it('opens the pack', async () => {
    render(<InventoryPanel {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Pacote de Explorador/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open pack' }));
    expect(socket.openPack).toHaveBeenCalledWith({ characterId: 'char-1', itemId: 'pack' });
  });

  it('moves an item from the grid to a slot by dragging', () => {
    render(<InventoryPanel {...base} />);
    const dt = { setData: vi.fn(), getData: () => 'dagger', effectAllowed: '' };
    fireEvent.dragStart(screen.getByRole('button', { name: /Adaga/ }), { dataTransfer: dt });
    fireEvent.drop(slot('Off hand'), { dataTransfer: dt });
    expect(socket.equipItem).toHaveBeenCalledWith({ characterId: 'char-1', itemId: 'dagger', slot: 'off' });
  });

  it('offers to pick the ammunition up, with half the count', async () => {
    socket.recoverAmmo.mockResolvedValue({ ok: true, recovered: { flechas: 3 } });
    render(<InventoryPanel {...base} ammoToRecover={{ flechas: 7 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recover ammunition (half: 3 of 7)' }));
    expect(socket.recoverAmmo).toHaveBeenCalledWith({ characterId: 'char-1' });
  });

  it('hides the recovery in a Flexible campaign and during a fight', () => {
    const { rerender } = render(<InventoryPanel {...base} detailLevel="FLEXIBLE" ammoToRecover={{ flechas: 7 }} />);
    expect(screen.queryByRole('button', { name: /Recover ammunition/ })).toBeNull();
    useGameStore.getState().setCombatState({ active: true, round: 1, currentTokenId: null, combatants: [], spend: {} });
    rerender(<InventoryPanel {...base} ammoToRecover={{ flechas: 7 }} />);
    expect(screen.queryByRole('button', { name: /Recover ammunition/ })).toBeNull();
  });

  it('shows the load bar in Faithful only', () => {
    const { rerender } = render(<InventoryPanel {...base} />);
    expect(screen.getByText(/Load: .* of .* kg/)).toBeInTheDocument();
    rerender(<InventoryPanel {...base} detailLevel="FLEXIBLE" />);
    expect(screen.queryByText(/Load:/)).toBeNull();
  });

  it('gives a viewer who cannot act no buttons to act with', () => {
    render(<InventoryPanel {...base} canAct={false} ammoToRecover={{ flechas: 7 }} />);
    fireEvent.click(screen.getByRole('button', { name: /Adaga/ }));
    expect(screen.getByText('1 × Adaga', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In the main hand' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stow' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Recover ammunition/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Pacote de Explorador/ }));
    expect(screen.queryByRole('button', { name: 'Open pack' })).toBeNull();
  });

  it('sends one request while the first is unanswered', async () => {
    let answer: (v: unknown) => void = () => {};
    socket.openPack.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    render(<InventoryPanel {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Pacote de Explorador/ }));
    const open = screen.getByRole('button', { name: 'Open pack' });
    fireEvent.click(open);
    fireEvent.click(open);
    expect(socket.openPack).toHaveBeenCalledTimes(1);
    expect(open).toBeDisabled();
    const dt = { setData: vi.fn(), getData: () => 'dagger', effectAllowed: '' };
    fireEvent.drop(slot('Off hand'), { dataTransfer: dt });
    expect(socket.equipItem).not.toHaveBeenCalled();
    answer({ ok: true });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open pack' })).toBeNull());
  });

  it('shows the refusal in the detail and clears it when another item is picked', async () => {
    socket.equipItem.mockResolvedValue({ ok: false, error: 'Esse item não vai nesse espaço.' });
    render(<InventoryPanel {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Adaga/ }));
    fireEvent.click(screen.getByRole('button', { name: 'With both hands' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esse item não vai nesse espaço.');
    fireEvent.click(screen.getByRole('button', { name: 'Corda de cânhamo' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers only both hands for a weapon its notes call two-handed', () => {
    const great = { id: 'great', name: 'Espada grande', quantity: 1, notes: 'Pesada, duas mãos', compendiumRef: { bookId: 'phb', slug: 'espada-grande' } };
    render(<InventoryPanel {...base} inventory={[...ranger(), great]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Espada grande' }));
    expect(screen.getByRole('button', { name: 'With both hands' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In the main hand' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'In the off hand' })).toBeNull();
  });

  it('offers to open a pack by its name when it has no compendium link', () => {
    render(<InventoryPanel {...base} inventory={[{ id: 'p', name: 'Pacote de Explorador', quantity: 1 }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pacote de Explorador' }));
    expect(screen.getByRole('button', { name: 'Open pack' })).toBeInTheDocument();
  });

  it('clears the refusal when the detail is closed', async () => {
    socket.equipItem.mockResolvedValue({ ok: false, error: 'Esse item não vai nesse espaço.' });
    render(<InventoryPanel {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Adaga/ }));
    fireEvent.click(screen.getByRole('button', { name: 'With both hands' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a recovery refusal by the button, not in an open item detail', async () => {
    socket.recoverAmmo.mockResolvedValue({ ok: false, error: 'Não dá para recolher munição durante o combate.' });
    render(<InventoryPanel {...base} ammoToRecover={{ flechas: 7 }} />);
    fireEvent.click(screen.getByRole('button', { name: /Adaga/ }));
    fireEvent.click(screen.getByRole('button', { name: /Recover ammunition/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não dá para recolher');
    expect(within(screen.getByText(/× Adaga/).parentElement!.parentElement!).queryByRole('alert')).toBeNull();
  });
});
