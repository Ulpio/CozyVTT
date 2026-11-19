import { describe, expect, it } from 'vitest';
import { ammoBundleSize, itemsInHands, normalizeInventory as normalize, type AttackLike, type InventoryHints, type Item, type SheetLike } from '../inventory';

const normalizeInventory = (sheet: SheetLike, h?: InventoryHints) =>
  normalize(sheet, h) as { inventory: Item[]; attacks: AttackLike[] };

const KINDS: Record<string, ReturnType<InventoryHints['kindOf']>> = {
  'espada-longa': 'weapon',
  'montante': 'weapon',
  'machado-grande': 'weapon',
  'adaga': 'weapon',
  'escudo': 'shield',
  'cota-de-malha': 'armor',
  'flechas': 'ammo',
  'pacote-de-explorador': 'pack',
};
const TWO_HANDED = new Set(['montante', 'machado-grande']);
const hints: InventoryHints = {
  kindOf: (item) => (item.compendiumRef ? (KINDS[item.compendiumRef.slug] ?? 'other') : 'other'),
  twoHanded: (item) => !!item.compendiumRef && TWO_HANDED.has(item.compendiumRef.slug),
};
const ref = (slug: string) => ({ bookId: 'phb', type: 'gear', slug });

const oldSheet = () => ({
  attacks: [{ name: 'Espada longa', attackBonus: 5 }, { name: 'Soco', attackBonus: 2 }],
  inventory: [
    { name: 'Espada longa', quantity: 1, equipped: true, compendiumRef: ref('espada-longa') },
    { name: 'Escudo', quantity: 1, equipped: true, compendiumRef: ref('escudo') },
    { name: 'Cota de malha', quantity: 1, equipped: true, compendiumRef: ref('cota-de-malha') },
    { name: 'Flechas (20)', quantity: 1, compendiumRef: ref('flechas') },
    { name: 'Pacote de Explorador', quantity: 1, compendiumRef: ref('pacote-de-explorador') },
  ],
});

describe('normalizeInventory', () => {
  it('upgrades a sheet from before slots existed', () => {
    const out = normalizeInventory(oldSheet(), hints);
    expect(out.inventory.map((i) => i.id)).toEqual(['inv-0', 'inv-1', 'inv-2', 'inv-3', 'inv-4']);
    expect(out.inventory[0].slot).toBe('main');
    expect(out.inventory[1].slot).toBe('off');
    expect(out.inventory[2].slot).toBe('armor');
    expect(out.inventory[3]).toMatchObject({ name: 'Flechas', quantity: 20 });
    expect(out.inventory[3].slot).toBeUndefined();
    expect(out.inventory[4].slot).toBeUndefined();
    expect(out.inventory[4].equipped).toBeUndefined();
    expect(out.attacks[0].itemId).toBe('inv-0');
    expect(out.attacks[1].itemId).toBeUndefined();
  });

  it('is idempotent', () => {
    const once = normalizeInventory(oldSheet(), hints);
    expect(normalizeInventory(once, hints)).toEqual(once);
  });

  it('does not mutate its input', () => {
    const input = oldSheet();
    const copy = JSON.parse(JSON.stringify(input));
    normalizeInventory(input, hints);
    expect(input).toEqual(copy);
  });

  it('keeps every slot as stored when any item already has one', () => {
    const sheet = {
      inventory: [
        { id: 'a', name: 'Espada longa', equipped: true, slot: 'off' as const, compendiumRef: ref('espada-longa') },
        { id: 'b', name: 'Escudo', equipped: true, compendiumRef: ref('escudo') },
      ],
    };
    const out = normalizeInventory(sheet, hints);
    expect(out.inventory[0].slot).toBe('off');
    expect(out.inventory[1].slot).toBeUndefined();
    expect(out.inventory[1].equipped).toBe(false);
  });

  it('puts the first two-handed weapon in both hands and the next one away', () => {
    const sheet = {
      inventory: [
        { name: 'Montante', equipped: true, compendiumRef: ref('montante') },
        { name: 'Machado grande', equipped: true, compendiumRef: ref('machado-grande') },
      ],
    };
    const out = normalizeInventory(sheet, hints);
    expect(out.inventory[0].slot).toBe('both');
    expect(out.inventory[1].slot).toBeUndefined();
    expect(out.inventory[1].equipped).toBe(false);
  });

  it('fills main then off, and drops what does not fit', () => {
    const sheet = {
      inventory: [
        { name: 'Adaga', equipped: true, compendiumRef: ref('adaga') },
        { name: 'Espada longa', equipped: true, compendiumRef: ref('espada-longa') },
        { name: 'Adaga 2', equipped: true, compendiumRef: ref('adaga') },
      ],
    };
    const out = normalizeInventory(sheet, hints);
    expect(out.inventory.map((i) => i.slot)).toEqual(['main', 'off', undefined]);
    expect(out.inventory[2].equipped).toBe(false);
  });

  it('keeps an equipped unlinked item untouched', () => {
    const sheet = { inventory: [{ name: 'Anel', equipped: true }] };
    const out = normalizeInventory(sheet, hints);
    expect(out.inventory[0]).toMatchObject({ id: 'inv-0', equipped: true });
    expect(out.inventory[0].slot).toBeUndefined();
  });

  it('works without hints', () => {
    const out = normalizeInventory({ inventory: [{ name: 'Flechas (20)', quantity: 1 }] });
    expect(out.inventory[0]).toMatchObject({ id: 'inv-0', name: 'Flechas (20)', quantity: 1 });
  });

  it('keeps existing ids and avoids duplicates for new ones', () => {
    const out = normalizeInventory({ inventory: [{ name: 'A' }, { id: 'inv-0', name: 'B' }] });
    expect(new Set(out.inventory.map((i) => i.id)).size).toBe(2);
    expect(out.inventory[1].id).toBe('inv-0');
  });

  it('keeps an attack that already has an itemId', () => {
    const out = normalizeInventory(
      { inventory: [{ id: 'x', name: 'Adaga' }], attacks: [{ name: 'adaga ', itemId: 'y' }, { name: ' ADAGA' }] },
    );
    expect(out.attacks[0].itemId).toBe('y');
    expect(out.attacks[1].itemId).toBe('x');
  });
});

describe('itemsInHands', () => {
  it('lists main, off and both items', () => {
    const items = [
      { name: 'a', slot: 'main' as const },
      { name: 'b', slot: 'armor' as const },
      { name: 'c', slot: 'both' as const },
      { name: 'd' },
    ];
    expect(itemsInHands({ inventory: items }).map((i) => i.name)).toEqual(['a', 'c']);
  });
});

describe('ammoBundleSize', () => {
  it('reads the trailing count', () => {
    expect(ammoBundleSize('Flechas (20)')).toBe(20);
    expect(ammoBundleSize('Corda')).toBeNull();
    expect(ammoBundleSize('Agulhas (50) ')).toBe(50);
  });
});
