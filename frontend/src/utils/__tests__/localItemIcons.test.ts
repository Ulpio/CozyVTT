import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLocalItemIcons, localItemIconUrl, resetLocalItemIcons } from '../localItemIcons';

const answer = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });

afterEach(() => resetLocalItemIcons());

describe('local item icons', () => {
  it('has no local icon before the map is loaded', () => {
    expect(localItemIconUrl({ name: 'Espada longa', compendiumRef: { bookId: 'phb', slug: 'espada-longa' } })).toBeUndefined();
  });

  it('finds an icon by the compendium slug once the map is loaded', async () => {
    const fetchFn = answer({ 'espada-longa': 'longsword.png' });
    await loadLocalItemIcons(fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/icons/local/map.json');
    expect(localItemIconUrl({ name: 'x', compendiumRef: { bookId: 'phb', slug: 'espada-longa' } }))
      .toBe('/icons/local/longsword.png');
  });

  it('falls back to the category entry for an item without a slug of its own', async () => {
    await loadLocalItemIcons(answer({ 'category:ammo': 'arrows.png' }));
    expect(localItemIconUrl({ name: 'Flechas' })).toBe('/icons/local/arrows.png');
    expect(localItemIconUrl({ name: 'Amuleto da vovó' })).toBeUndefined();
  });

  it('finds a hand-typed item by its plain name before its category', async () => {
    await loadLocalItemIcons(answer({ 'name:longsword': 'longsword.png', 'name:cota de malha': 'chain.png', 'category:item': 'bag.png' }));
    expect(localItemIconUrl({ name: ' Longsword ' })).toBe('/icons/local/longsword.png');
    expect(localItemIconUrl({ name: 'Cota de Malha' })).toBe('/icons/local/chain.png');
    expect(localItemIconUrl({ name: 'Amuleto da vovó' })).toBe('/icons/local/bag.png');
  });

  it('finds a magic item by the first word of its name, before its category', async () => {
    await loadLocalItemIcons(answer({ 'prefix:espada': 'sword.png', 'prefix:anel': 'ring.png', 'category:item': 'bag.png' }));
    expect(localItemIconUrl({ name: 'Espada Dançarina' }, 'magicItem')).toBe('/icons/local/sword.png');
    expect(localItemIconUrl({ name: 'Anel de Proteção' }, 'magicItem')).toBe('/icons/local/ring.png');
    expect(localItemIconUrl({ name: 'Espadachim' })).toBe('/icons/local/bag.png');
  });

  it('keeps the built-in icons when there is no local folder', async () => {
    await loadLocalItemIcons(answer({}, false));
    expect(localItemIconUrl({ name: 'x', compendiumRef: { bookId: 'phb', slug: 'espada-longa' } })).toBeUndefined();
    await loadLocalItemIcons(vi.fn().mockRejectedValue(new Error('offline')));
    expect(localItemIconUrl({ name: 'Flechas' })).toBeUndefined();
  });

  it('asks for the map only once', async () => {
    const fetchFn = answer({ tocha: 'torch.png' });
    await Promise.all([loadLocalItemIcons(fetchFn), loadLocalItemIcons(fetchFn)]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('ignores file names that would leave the icon folder', async () => {
    await loadLocalItemIcons(answer({ tocha: '../secret.png', corda: 'https://evil.example/x.png', bordao: 'staff.png' }));
    expect(localItemIconUrl({ name: 'x', compendiumRef: { bookId: 'phb', slug: 'tocha' } })).toBeUndefined();
    expect(localItemIconUrl({ name: 'x', compendiumRef: { bookId: 'phb', slug: 'corda' } })).toBeUndefined();
    expect(localItemIconUrl({ name: 'x', compendiumRef: { bookId: 'phb', slug: 'bordao' } })).toBe('/icons/local/staff.png');
  });
});
