import { describe, expect, it } from 'vitest';
import * as Gi from 'react-icons/gi';
import { ITEM_ICON_BY_SLUG, itemCategory, itemIconFor } from '../itemIcons';

describe('itemCategory', () => {
  it('reads a ranged weapon from the compendium entry', () => {
    const item = { name: 'Arco Longo', compendiumRef: { bookId: 'phb', slug: 'arco-longo' } };
    expect(itemCategory(item, 'weapon', { range: 'ranged' })).toBe('rangedWeapon');
    expect(itemIconFor(item, 'weapon', { range: 'ranged' })).toBe(ITEM_ICON_BY_SLUG['arco-longo']);
  });

  it('reads armour and shields from the entry', () => {
    expect(itemCategory({ name: 'Escudo' }, 'armor', { category: 'shield' })).toBe('shield');
    expect(itemCategory({ name: 'Couro' }, 'armor', { category: 'light' })).toBe('armor');
  });

  it('falls back to the name prefixes without an entry', () => {
    expect(itemCategory({ name: 'Flechas' })).toBe('ammo');
    expect(itemCategory({ name: 'Rações de viagem (1 dia)' })).toBe('food');
    expect(itemCategory({ name: 'Poção de Cura' }, 'magic-item', {})).toBe('potion');
    expect(itemCategory({ name: 'Pergaminho de Bola de Fogo' })).toBe('scroll');
  });

  it('uses the slug table when the entry is not known', () => {
    expect(itemCategory({ name: 'x', compendiumRef: { bookId: 'phb', slug: 'tocha' } })).toBe('light');
    expect(itemCategory({ name: 'x', compendiumRef: { bookId: 'phb', slug: 'arco-curto' } })).toBe('rangedWeapon');
  });

  it('gives an unlinked curiosity the generic category and icon', () => {
    const item = { name: 'Amuleto da vovó' };
    expect(itemCategory(item)).toBe('item');
    expect(itemIconFor(item)).toBe(Gi.GiSwapBag);
  });
});

describe('item icon table', () => {
  it('has at least 40 entries', () => {
    expect(Object.keys(ITEM_ICON_BY_SLUG).length).toBeGreaterThanOrEqual(40);
  });

  it('resolves every slug to a defined gi component', () => {
    for (const [slug, icon] of Object.entries(ITEM_ICON_BY_SLUG)) {
      expect(icon, slug).toBeDefined();
      expect(Object.values(Gi), slug).toContain(icon);
    }
  });
});
