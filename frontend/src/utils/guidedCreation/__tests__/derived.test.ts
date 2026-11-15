import { describe, expect, it } from 'vitest';
import type { ArmorData } from '../compendiumData';
import type { Effect } from '../types';
import { armorClass, maxHitPoints, proficiencyBonusFor, resolveSkills } from '../derived';

const sc = (dex: number, con = 10, wis = 10) => ({ str: 10, dex, con, int: 10, wis, cha: 10 });
const armor = (category: ArmorData['category'], baseAc: number, addDex: boolean, maxDex?: number): ArmorData => ({
  category, baseAc, addDex, maxDex, stealthDisadvantage: false, cost: '', weight: 0,
});
const chain = armor('heavy', 16, false);
const scale = armor('medium', 14, true, 2);

describe('derived', () => {
  it('computes hit points', () => {
    expect(maxHitPoints(10, 3, 2, 1)).toBe(31);
    expect(maxHitPoints(6, 3, 1, 0)).toBe(17);
  });
  it('computes armor class', () => {
    expect(armorClass(undefined, false, sc(16), [])).toBe(13);
    const barb: Effect[] = [{ type: 'unarmoredAC', base: 10, abilities: ['dex', 'con'] }];
    expect(armorClass(undefined, false, sc(14, 16), barb)).toBe(15);
    const monk: Effect[] = [{ type: 'unarmoredAC', base: 10, abilities: ['dex', 'wis'] }];
    expect(armorClass(undefined, false, sc(16, 10, 16), monk)).toBe(16);
    expect(armorClass(chain, true, sc(10), [{ type: 'acBonus', amount: 1, whenArmored: true }])).toBe(19);
    expect(armorClass(scale, false, sc(18), [])).toBe(16);
    expect(armorClass(undefined, false, sc(10), [{ type: 'acBonus', amount: 1, whenArmored: true }])).toBe(10);
    expect(armorClass(undefined, true, sc(10), [])).toBe(12);
  });
  it('counts a skill once and keeps expertise to proficient skills', () => {
    const r = resolveSkills(['stealth', 'insight'], ['stealth', 'arcana'], ['history'], ['stealth', 'athletics']);
    expect(r.proficient).toEqual(['arcana', 'history', 'insight', 'stealth']);
    expect(r.expertise).toEqual(['stealth']);
  });
  it('gives +2 at level 3', () => {
    expect(proficiencyBonusFor(3)).toBe(2);
  });
});
