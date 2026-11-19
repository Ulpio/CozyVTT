/**
 * The editor does not edit slots: the server decides what the hands hold, so
 * a checkbox here would be undone on save. It keeps id, slot and the rest.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FifthEditionCharacterEditor } from '../FifthEditionCharacterEditor';
import type { CharacterData } from '../../../../types';
import { fifthEditionCharacter } from './fifthEditionFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const sheet = () => {
  const character = fifthEditionCharacter();
  const data = character.data as unknown as Record<string, unknown>;
  data.inventory = [
    { id: 'sword', name: 'Espada longa', quantity: 1, weight: 3, notes: '', equippable: true, equipped: true, slot: 'main', requiresAttunement: false, attuned: false, value: 15 },
  ];
  data.attacks = [{ name: 'Espada longa', itemId: 'sword', attackBonus: 2, damageRoll: '1d8', damageType: 'slashing' }];
  data.ammoToRecover = { flechas: 3 };
  return character;
};

describe('the editor and the inventory slots', () => {
  it('has no equipped toggle on an item', () => {
    render(<FifthEditionCharacterEditor character={sheet()} onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Inventory/ }));
    expect(screen.queryByRole('checkbox', { name: /Equipped/ })).toBeNull();
    expect(screen.queryByText('Equipped')).toBeNull();
  });

  it('shows the item an icon', () => {
    const { container } = render(<FifthEditionCharacterEditor character={sheet()} onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Inventory/ }));
    expect(container.querySelector('[data-testid="item-icon"]')).not.toBeNull();
  });

  it('saves id, slot, itemId and ammoToRecover as they were', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<FifthEditionCharacterEditor character={sheet()} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Inventory/ }));
    fireEvent.change(screen.getByLabelText('Name of item 1'), { target: { value: 'Espada longa +1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as unknown as Record<string, any>;
    expect(saved.inventory[0]).toMatchObject({ id: 'sword', slot: 'main', equipped: true });
    expect(saved.attacks[0].itemId).toBe('sword');
    expect(saved.ammoToRecover).toEqual({ flechas: 3 });
  });
});
