import { describe, expect, it } from 'vitest';
import {
  finalScores,
  pointBuySpent,
  validateAbilityPicks,
  validateBaseScores,
} from '../abilities';
import { RACE_EFFECTS } from '../raceRules';
import type { AbilityKey } from '../types';

const s = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({
  str, dex, con, int, wis, cha,
});

describe('abilities', () => {
  it('prices point buy', () => {
    expect(pointBuySpent(s(15, 15, 15, 8, 8, 8))).toBe(27);
  });
  it('validates point buy', () => {
    expect(validateBaseScores('pointBuy', s(15, 15, 15, 8, 8, 8))).toEqual([]);
    expect(validateBaseScores('pointBuy', s(16, 8, 8, 8, 8, 8))).toEqual(['outOfRange']);
    expect(validateBaseScores('pointBuy', s(7, 8, 8, 8, 8, 8))).toEqual(['outOfRange']);
    expect(validateBaseScores('pointBuy', s(15, 15, 15, 9, 8, 8))).toEqual(['overBudget']);
  });
  it('validates standard array and rolls', () => {
    expect(validateBaseScores('standardArray', s(8, 10, 12, 13, 14, 15))).toEqual([]);
    expect(validateBaseScores('standardArray', s(15, 15, 13, 12, 10, 8))).toEqual(['notStandardArray']);
    const roll = [17, 12, 12, 10, 9, 6];
    expect(validateBaseScores('roll', s(12, 17, 6, 9, 10, 12), roll)).toEqual([]);
    expect(validateBaseScores('roll', s(18, 17, 6, 9, 10, 12), roll)).toEqual(['notRolled']);
    expect(validateBaseScores('roll', s(12, 17, 6, 9, 10, 12))).toEqual(['notRolled']);
  });
  it('applies fixed bonuses, picks and the cap of 20', () => {
    const out = finalScores(
      s(15, 14, 13, 12, 10, 8),
      [
        { type: 'ability', ability: 'str', amount: 2 },
        { type: 'abilityChoice', count: 2, amount: 1, exclude: ['cha'] },
      ],
      ['wis', 'dex'],
    );
    expect(out).toEqual(s(17, 15, 13, 12, 11, 8));
    expect(finalScores(s(19, 8, 8, 8, 8, 8), [{ type: 'ability', ability: 'str', amount: 2 }]).str).toBe(20);
  });
  it('rejects a half-elf +1 on charisma', () => {
    const fx = RACE_EFFECTS['meio-elfo'];
    expect(validateAbilityPicks(fx, ['cha', 'dex'] as AbilityKey[])).toContain('excludedAbility');
    expect(validateAbilityPicks(fx, ['con', 'dex'] as AbilityKey[])).toEqual([]);
    expect(validateAbilityPicks(fx, ['dex', 'dex'] as AbilityKey[])).toContain('duplicatePick');
    expect(validateAbilityPicks(fx, ['dex'] as AbilityKey[])).toContain('missingPick');
  });
});
