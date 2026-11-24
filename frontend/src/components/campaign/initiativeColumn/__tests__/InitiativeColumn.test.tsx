import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import InitiativeColumn from '../InitiativeColumn';
import { useGameStore } from '@/stores/gameStore';
import { optionalStorage } from '@/utils/optionalStorage';
import { inPortuguese } from '@/test/inPortuguese';
import type { CombatantEntry } from '@/types';

const seat = vi.hoisted(() => ({ role: 'PLAYER' as 'GM' | 'PLAYER' }));
vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ userRole: seat.role }) }));

const KEY = 'mesa.initiativeColumn.collapsed';
const hp = { current: 5, max: 10, temp: 0 };
const entry = (tokenId: string, name: string, initiative: number | null, type: 'player' | 'npc'): CombatantEntry => ({
  tokenId, mapId: 'm1', name, imageUrl: '', initiative, hp, type, disposition: null, characterId: null,
});

function seed(active = true) {
  useGameStore.getState().setCombatState({
    active, round: 2, currentTokenId: 'g', spend: {},
    combatants: [entry('g', 'Goblin', 18, 'npc'), entry('a', 'Aria', null, 'player'), entry('b', 'Borin', 7, 'player')],
  });
}

beforeEach(() => {
  seat.role = 'PLAYER';
  window.localStorage.clear();
  seed();
});
afterEach(() => vi.restoreAllMocks());

it('renders nothing outside combat', () => {
  seed(false);
  const { container } = render(<InitiativeColumn compact={false} />);
  expect(container.firstChild).toBeNull();
});

it('shows the round, names and rolled values in order', () => {
  render(<InitiativeColumn compact={false} />);
  expect(screen.getByRole('region', { name: 'Initiative order' })).toBeTruthy();
  expect(screen.getByText('Round 2')).toBeTruthy();
  const rows = screen.getAllByRole('button').filter(b => b.getAttribute('aria-expanded') === null);
  // Each row reads its portrait's initial (hidden from assistive tech), the name, then the value.
  expect(rows.map(r => r.textContent)).toEqual(['GGoblin18', 'AAria–', 'BBorin7']);
});

it('marks the current turn', () => {
  render(<InitiativeColumn compact={false} />);
  const current = document.querySelectorAll('[aria-current="true"]');
  expect(current.length).toBe(1);
  expect(within(current[0] as HTMLElement).getByText('Goblin')).toBeTruthy();
});

it('shows HP bars only where the viewer may see them', () => {
  render(<InitiativeColumn compact={false} />);
  expect(screen.getAllByRole('meter')).toHaveLength(2);
});

it('shows every HP bar to the GM', () => {
  seat.role = 'GM';
  render(<InitiativeColumn compact={false} />);
  expect(screen.getAllByRole('meter')).toHaveLength(3);
});

it('collapses and remembers it', () => {
  const { unmount } = render(<InitiativeColumn compact={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
  expect(screen.queryByText('Goblin')).toBeNull();
  expect(screen.getByText('18')).toBeTruthy();
  expect(optionalStorage.getItem(KEY)).toBe('1');
  unmount();
  render(<InitiativeColumn compact={false} />);
  expect(screen.queryByText('Goblin')).toBeNull();
  expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy();
});

it('starts collapsed in the compact layout when nothing is stored', () => {
  render(<InitiativeColumn compact />);
  expect(screen.queryByText('Goblin')).toBeNull();
});

it('starts expanded on desktop', () => {
  render(<InitiativeColumn compact={false} />);
  expect(screen.getByText('Goblin')).toBeTruthy();
});

it('still renders when storage throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('refused'); });
  render(<InitiativeColumn compact={false} />);
  expect(screen.getByText('Goblin')).toBeTruthy();
});

it('calls onRowClick with the row', () => {
  const onRowClick = vi.fn();
  render(<InitiativeColumn compact={false} onRowClick={onRowClick} />);
  fireEvent.click(screen.getByText('Borin'));
  expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ tokenId: 'b' }));
});

it('reads in Portuguese', async () => {
  await inPortuguese(() => {
    render(<InitiativeColumn compact={false} />);
    expect(screen.getByText('Rodada 2')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Ordem de iniciativa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recolher' })).toBeTruthy();
  });
});

it('keeps clear of the map foot and sits under the AoE panel', () => {
  render(<InitiativeColumn compact={false} />);
  const region = screen.getByRole('region', { name: 'Initiative order' });
  expect(region.className).toContain('max-h-[calc(100%-8rem)]');
  expect(region.className).toContain('z-20');
});
