/**
 * A sheet can point its spells, attacks and items at compendium entries. The
 * editor keeps those pointers when it saves, and drops one when the row it
 * belongs to is renamed by hand: the pointer no longer describes that row.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FifthEditionCharacterEditor } from '../FifthEditionCharacterEditor';
import type { CharacterData } from '../../../../types';
import { fifthEditionCharacter } from './fifthEditionFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const ref = (slug: string) => ({ bookId: 'srd', slug });
const slots = Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((l) => [l, { total: 0, expended: 0 }]));

function characterWithRefs() {
  return fifthEditionCharacter({
    origin: { race: ref('human'), class: ref('fighter'), background: ref('acolyte') },
    attacks: [{ name: 'Longsword', attackBonus: 5, compendiumRef: ref('longsword') }],
    inventory: [{ name: 'Rope', quantity: 1, compendiumRef: ref('rope') }],
    spellcasting: {
      ability: 'intelligence', spellSaveDC: 10, spellAttackBonus: 2, slots,
      cantrips: ['Light'],
      cantripRefs: [{ name: 'Light', compendiumRef: ref('light') }],
      spells: [{ level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false, compendiumRef: ref('shield') }],
    },
  });
}

async function save(character: ReturnType<typeof characterWithRefs>, before?: () => void) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<FifthEditionCharacterEditor character={character} onSave={onSave} onCancel={vi.fn()} />);
  before?.();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as Record<string, any>;
}

describe('compendium references in the 5E editor', () => {
  it('saves an unchanged sheet with its references as they were', async () => {
    const saved = await save(characterWithRefs());
    expect(saved.origin).toEqual({ race: ref('human'), class: ref('fighter'), background: ref('acolyte') });
    expect(saved.attacks[0].compendiumRef).toEqual(ref('longsword'));
    expect(saved.inventory[0].compendiumRef).toEqual(ref('rope'));
    expect(saved.spellcasting.cantripRefs).toEqual([{ name: 'Light', compendiumRef: ref('light') }]);
    expect(saved.spellcasting.spells[0].compendiumRef).toEqual(ref('shield'));
  });

  it('saves a renamed spell without its reference', async () => {
    const saved = await save(characterWithRefs(), () => {
      fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));
      fireEvent.change(screen.getByLabelText('Name of spell 1'), { target: { value: 'Shield of Mine' } });
    });
    expect(saved.spellcasting.spells[0].name).toBe('Shield of Mine');
    expect(saved.spellcasting.spells[0]).not.toHaveProperty('compendiumRef');
  });

  it('saves a renamed attack and a renamed item without their references', async () => {
    const saved = await save(characterWithRefs(), () => {
      fireEvent.click(screen.getByRole('tab', { name: /Combat|Attacks/ }));
      fireEvent.change(screen.getByLabelText('Name of attack 1'), { target: { value: 'Family Blade' } });
      fireEvent.click(screen.getByRole('tab', { name: /Inventory|Equipment/ }));
      fireEvent.change(screen.getByLabelText('Name of item 1'), { target: { value: 'Old Rope' } });
    });
    expect(saved.attacks[0].name).toBe('Family Blade');
    expect(saved.attacks[0]).not.toHaveProperty('compendiumRef');
    expect(saved.inventory[0].name).toBe('Old Rope');
    expect(saved.inventory[0]).not.toHaveProperty('compendiumRef');
  });
});

describe('cantrip references follow the cantrips box', () => {
  const twoCantrips = () => {
    const character = characterWithRefs();
    const sc = (character.data as any).spellcasting;
    sc.cantrips = ['Light', 'Mage Hand'];
    sc.cantripRefs = [
      { name: 'Light', compendiumRef: ref('light') },
      { name: 'Mage Hand', compendiumRef: ref('mage-hand') },
    ];
    return character;
  };

  it('keeps both when the box is left alone', async () => {
    const saved = await save(twoCantrips());
    expect(saved.spellcasting.cantripRefs.map((r: any) => r.name)).toEqual(['Light', 'Mage Hand']);
  });

  it('drops the pointer of a cantrip removed from the box and keeps the other', async () => {
    const saved = await save(twoCantrips(), () => {
      fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));
      fireEvent.change(screen.getByLabelText('Cantrips'), { target: { value: 'Mage Hand' } });
    });
    expect(saved.spellcasting.cantrips).toEqual(['Mage Hand']);
    expect(saved.spellcasting.cantripRefs).toEqual([{ name: 'Mage Hand', compendiumRef: ref('mage-hand') }]);
  });
});
