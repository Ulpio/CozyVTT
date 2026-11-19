import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ItemIcon } from '../components/ItemIcon';
import { loadLocalItemIcons, resetLocalItemIcons } from '../../../../utils/localItemIcons';

const sword = { name: 'Espada longa', compendiumRef: { bookId: 'phb', slug: 'espada-longa' } };

afterEach(() => resetLocalItemIcons());

it('shows the built-in icon when the table has no icon folder', () => {
  render(<ItemIcon item={sword} />);
  expect(screen.getByTestId('item-icon').querySelector('img')).toBeNull();
  expect(screen.getByTestId('item-icon').querySelector('svg')).not.toBeNull();
});

it('shows the local picture once the map arrives, and the built-in icon if the picture is missing', async () => {
  let arrive: (v: unknown) => void = () => {};
  const loaded = loadLocalItemIcons(vi.fn(() => new Promise((r) => { arrive = r; })) as never);
  render(<ItemIcon item={sword} />);
  expect(screen.getByTestId('item-icon').querySelector('img')).toBeNull();
  await act(async () => {
    arrive({ ok: true, json: () => Promise.resolve({ 'espada-longa': 'longsword.png' }) });
    await loaded;
  });
  const img = screen.getByTestId('item-icon').querySelector('img');
  expect(img?.getAttribute('src')).toBe('/icons/local/longsword.png');
  fireEvent.error(img!);
  expect(screen.getByTestId('item-icon').querySelector('img')).toBeNull();
  expect(screen.getByTestId('item-icon').querySelector('svg')).not.toBeNull();
});
