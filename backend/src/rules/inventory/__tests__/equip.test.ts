import { acAfter, acContribution, planEquip, type ItemFacts, type EquipSheet } from '../equip';
import type { Item } from '../../../utils/inventory';

const FACTS: Record<string, ItemFacts> = {
  longsword: { kind: 'weapon', twoHanded: false, versatile: true },
  dagger: { kind: 'weapon', twoHanded: false, versatile: false },
  greatsword: { kind: 'weapon', twoHanded: true, versatile: false },
  shield: { kind: 'shield', twoHanded: false, versatile: false },
  arrows: { kind: 'ammo', twoHanded: false, versatile: false },
  chain: { kind: 'armor', twoHanded: false, versatile: false, armor: { category: 'heavy', baseAc: 16, addDex: false } },
  studded: { kind: 'armor', twoHanded: false, versatile: false, armor: { category: 'light', baseAc: 12, addDex: true } },
  leather: { kind: 'armor', twoHanded: false, versatile: false, armor: { category: 'light', baseAc: 11, addDex: true } },
  hide: { kind: 'armor', twoHanded: false, versatile: false, armor: { category: 'medium', baseAc: 12, addDex: true, maxDex: 2 } },
  mystery: { kind: 'armor', twoHanded: false, versatile: false },
};
const facts = (item: Item): ItemFacts => FACTS[item.id as string];
const mk = (id: string, slot?: Item['slot']): Item => ({ id, name: id, ...(slot ? { slot, equipped: true } : { equipped: false }) });

const sheet = (over: Partial<EquipSheet> & { dex?: number; con?: number; wis?: number } = {}): EquipSheet => ({
  armorClass: over.armorClass,
  class: over.class ?? 'Guerreiro',
  origin: over.origin,
  stats: {
    dexterity: { modifier: over.dex ?? 0 },
    constitution: { modifier: over.con ?? 0 },
    wisdom: { modifier: over.wis ?? 0 },
  },
});

describe('planEquip', () => {
  const inv = [mk('longsword', 'main'), mk('shield', 'off'), mk('greatsword'), mk('arrows'), mk('chain')];

  it('a two-handed weapon clears both hands', () => {
    const r = planEquip(inv, 'greatsword', 'both', facts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const by = Object.fromEntries(r.inventory.map((i) => [i.id, i]));
    expect(by.greatsword.slot).toBe('both');
    expect(by.greatsword.equipped).toBe(true);
    expect(by.longsword.slot).toBeUndefined();
    expect(by.longsword.equipped).toBe(false);
    expect(by.shield.slot).toBeUndefined();
    expect(r.handMoves).toBe(2);
    expect(r.shieldMoved).toBe(true);
    expect(r.armorMoved).toBe(false);
  });

  it('refuses a shield in the main hand and ammunition in the armour slot', () => {
    expect(planEquip(inv, 'shield', 'main', facts)).toEqual({ ok: false, error: 'Esse item não vai nesse espaço.' });
    expect(planEquip(inv, 'arrows', 'armor', facts)).toEqual({ ok: false, error: 'Esse item não vai nesse espaço.' });
    expect(planEquip(inv, 'greatsword', 'main', facts).ok).toBe(false);
  });

  it('lets a versatile weapon go to both hands', () => {
    const r = planEquip([mk('longsword')], 'longsword', 'both', facts);
    expect(r.ok).toBe(true);
  });

  it('unknown id', () => {
    expect(planEquip(inv, 'nope', 'main', facts)).toEqual({ ok: false, error: 'Item não encontrado.' });
  });

  it('putting a one-hander in a hand empties a both', () => {
    const r = planEquip([mk('greatsword', 'both'), mk('dagger')], 'dagger', 'off', facts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inventory.find((i) => i.id === 'greatsword')?.slot).toBeUndefined();
    expect(r.handMoves).toBe(2);
  });

  it('stowing returns the item to the backpack', () => {
    const r = planEquip(inv, 'shield', null, facts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inventory.find((i) => i.id === 'shield')?.slot).toBeUndefined();
    expect(r.shieldMoved).toBe(true);
    expect(r.handMoves).toBe(0);
  });

  it('armour moves flag armorMoved and swap the old one out', () => {
    const r = planEquip([mk('chain', 'armor'), mk('leather')], 'leather', 'armor', facts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.armorMoved).toBe(true);
    expect(r.inventory.find((i) => i.id === 'chain')?.slot).toBeUndefined();
  });

  it('does not mutate its input', () => {
    planEquip(inv, 'greatsword', 'both', facts);
    expect(inv[0].slot).toBe('main');
  });
});

describe('acAfter', () => {
  it('losing the shield lowers AC by 2', () => {
    const before = [mk('longsword', 'main'), mk('shield', 'off'), mk('greatsword')];
    const r = planEquip(before, 'greatsword', 'both', facts);
    if (!r.ok) throw new Error('x');
    expect(acAfter(sheet({ armorClass: 12 }), before, r.inventory, facts)).toEqual({ ac: 10, unknown: false });
  });

  it('chain mail to studded leather with a shield', () => {
    const before = [mk('chain', 'armor'), mk('shield', 'off'), mk('studded')];
    const r = planEquip(before, 'studded', 'armor', facts);
    if (!r.ok) throw new Error('x');
    expect(acAfter(sheet({ armorClass: 18, dex: 3 }), before, r.inventory, facts)).toEqual({ ac: 17, unknown: false });
  });

  it('monk without armour, leather gives 14', () => {
    const before = [mk('leather')];
    const r = planEquip(before, 'leather', 'armor', facts);
    if (!r.ok) throw new Error('x');
    expect(acAfter(sheet({ armorClass: 15, dex: 3, wis: 2, class: 'Monge' }), before, r.inventory, facts)).toEqual({ ac: 14, unknown: false });
  });

  it('monk with a shield keeps 10 + dex as the no-armour base', () => {
    const monk = sheet({ armorClass: 15, dex: 3, wis: 2, class: 'Monge' });
    expect(acContribution(undefined, true, monk)).toBe(15);
    expect(acContribution(undefined, false, monk)).toBe(15);
    const wisHigh = sheet({ dex: 3, wis: 2, class: 'Monge' });
    expect(acContribution(undefined, true, wisHigh)).toBe(15); // 10 + 3 + shield 2
    expect(acContribution(undefined, false, wisHigh)).toBe(15); // 10 + 3 + 2
  });

  it('barbarian medium armour with a dex cap', () => {
    const before = [mk('hide')];
    const r = planEquip(before, 'hide', 'armor', facts);
    if (!r.ok) throw new Error('x');
    const barb = sheet({ armorClass: 15, dex: 2, con: 3, origin: { class: { bookId: 'phb', slug: 'barbaro' } }, class: 'x' });
    expect(acAfter(barb, before, r.inventory, facts)).toEqual({ ac: 14, unknown: false });
  });

  it('accepts the class name without accents', () => {
    expect(acContribution(undefined, false, sheet({ dex: 1, con: 2, class: 'BARBARO' }))).toBe(13);
  });

  it('unlinked body armour leaves AC as stored and says so', () => {
    const before = [mk('mystery', 'armor'), mk('leather')];
    const r = planEquip(before, 'leather', 'armor', facts);
    if (!r.ok) throw new Error('x');
    expect(acAfter(sheet({ armorClass: 15, dex: 2 }), before, r.inventory, facts)).toEqual({ ac: 15, unknown: true });
  });
});

describe('handMoves and unknown armour', () => {
  const moves = (inv: Item[], id: string, slot: Item['slot'] | null) => {
    const r = planEquip(inv, id, slot ?? null, facts);
    if (!r.ok) throw new Error('refused');
    return r.handMoves;
  };
  it('counts only weapons entering or leaving a hand', () => {
    expect(moves([mk('dagger', 'main')], 'dagger', 'off')).toBe(0);
    expect(moves([mk('longsword', 'main')], 'longsword', 'both')).toBe(0);
    expect(moves([mk('longsword', 'main')], 'longsword', null)).toBe(1);
    expect(moves([mk('longsword', 'main')], 'longsword', 'main')).toBe(0);
    expect(moves([mk('dagger')], 'dagger', 'main')).toBe(1);
  });
  it('an unchanged unlinked body armour still lets a shield change count', () => {
    const before = [mk('mystery', 'armor'), mk('shield')];
    const r = planEquip(before, 'shield', 'off', facts);
    if (!r.ok) throw new Error('x');
    expect(acAfter(sheet({ armorClass: 14 }), before, r.inventory, facts)).toEqual({ ac: 16, unknown: false });
    const back = planEquip(r.inventory, 'shield', null, facts);
    if (!back.ok) throw new Error('x');
    expect(acAfter(sheet({ armorClass: 16 }), r.inventory, back.inventory, facts)).toEqual({ ac: 14, unknown: false });
  });
  it('monk shield rule distinguishes wisdom', () => {
    const monk = sheet({ dex: 3, wis: 4, class: 'Monge' });
    expect(acContribution(undefined, false, monk)).toBe(17);
    expect(acContribution(undefined, true, monk)).toBe(15);
  });
});
