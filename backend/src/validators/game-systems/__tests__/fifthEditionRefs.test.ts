/**
 * A 5E sheet can point spells, attacks, items, cantrips and its origin at
 * compendium entries. The backend stores Zod's parsed output, so a field the
 * schema does not declare is stripped on save.
 */

import { describe, it, expect } from '@jest/globals';
import { GameSystem } from '../../../game-systems';
import { getBlankCharacterTemplate, validateCharacterData } from '../index';

const ref = (slug: string) => ({ bookId: 'srd', slug });

function blank(): Record<string, unknown> {
  return structuredClone(getBlankCharacterTemplate(GameSystem.FIFTH_EDITION) as Record<string, unknown>);
}

function withRefs(): Record<string, unknown> {
  return {
    ...blank(),
    origin: {
      race: ref('elf'),
      subrace: ref('high-elf'),
      class: ref('wizard'),
      subclass: ref('evocation'),
      background: ref('sage'),
    },
    attacks: [{ name: 'Longsword', attackBonus: 5, compendiumRef: ref('longsword') }],
    inventory: [{ name: 'Rope', compendiumRef: ref('rope') }],
    spellcasting: {
      cantrips: ['Light'],
      cantripRefs: [{ name: 'Light', compendiumRef: ref('light') }],
      spells: [
        { level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false, compendiumRef: ref('shield') },
      ],
    },
  };
}

describe('5E compendium references', () => {
  it('keeps references on a sheet that has them', () => {
    const input = withRefs();
    const result = validateCharacterData(GameSystem.FIFTH_EDITION, input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data as Record<string, any>;
    expect(data.origin).toEqual((input as any).origin);
    expect(data.attacks[0].compendiumRef).toEqual(ref('longsword'));
    expect(data.inventory[0].compendiumRef).toEqual(ref('rope'));
    expect(data.spellcasting.cantripRefs).toEqual([{ name: 'Light', compendiumRef: ref('light') }]);
    expect(data.spellcasting.spells[0].compendiumRef).toEqual(ref('shield'));
  });

  it('still accepts a sheet without any, and adds none', () => {
    const input = blank();
    const result = validateCharacterData(GameSystem.FIFTH_EDITION, input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('origin');
    expect(JSON.stringify(result.data)).not.toContain('compendiumRef');
  });

  it('refuses a slug of 121 characters', () => {
    const input = withRefs();
    (input.attacks as any[])[0].compendiumRef = { bookId: 'srd', slug: 'a'.repeat(121) };
    const result = validateCharacterData(GameSystem.FIFTH_EDITION, input);
    expect(result.success).toBe(false);
  });

  it('accepts a slug of 120 characters', () => {
    const input = withRefs();
    (input.attacks as any[])[0].compendiumRef = { bookId: 'srd', slug: 'a'.repeat(120) };
    expect(validateCharacterData(GameSystem.FIFTH_EDITION, input).success).toBe(true);
  });
});
