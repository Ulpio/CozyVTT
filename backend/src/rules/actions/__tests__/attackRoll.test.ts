import { rollAttack, attackHits, hitChance, rollDamage } from '../attackRoll';
import { rollDice } from '../../../utils/dice-parser';

const seq = (...v: number[]) => { let i = 0; return () => v[i++]; };

describe('attack rolls', () => {
  it('advantage keeps the highest', () => expect(rollAttack(5, 'advantage', seq(4, 17)).total).toBe(22));
  it('disadvantage keeps the lowest', () => expect(rollAttack(5, 'disadvantage', seq(4, 17))).toMatchObject({ natural: 4, total: 9 }));
  it('natural 20 hits and crits against any AC', () => expect(attackHits({ d20s: [20], natural: 20, total: 25 }, 40)).toEqual({ hit: true, critical: true }));
  it('natural 1 misses against AC 1', () => expect(attackHits({ d20s: [1], natural: 1, total: 11 }, 1)).toEqual({ hit: false, critical: false }));
  it('total at AC hits', () => expect(attackHits({ d20s: [10], natural: 10, total: 15 }, 15)).toEqual({ hit: true, critical: false }));
  it('hit chance +5 vs AC 15 is 55%', () => expect(hitChance(5, 15, 'normal')).toBeCloseTo(0.55));
  it('hit chance with advantage', () => expect(hitChance(5, 15, 'advantage')).toBeCloseTo(1 - 0.45 * 0.45));
  it('hit chance with disadvantage', () => expect(hitChance(5, 15, 'disadvantage')).toBeCloseTo(0.55 * 0.55));
  it('hit chance stays between 5% and 95%', () => {
    expect(hitChance(-20, 30, 'normal')).toBeCloseTo(0.05);
    expect(hitChance(30, 1, 'normal')).toBeCloseTo(0.95);
  });
  it('a natural 19 crits when the critical range starts at 19, and hits whatever the AC', () => {
    expect(attackHits({ d20s: [19], natural: 19, total: 24 }, 40, 19)).toEqual({ hit: true, critical: true });
    expect(attackHits({ d20s: [19], natural: 19, total: 24 }, 15)).toEqual({ hit: true, critical: false });
    expect(attackHits({ d20s: [18], natural: 18, total: 23 }, 40, 19)).toEqual({ hit: false, critical: false });
  });
  it('hit chance counts the wider critical range as hits', () => expect(hitChance(-20, 30, 'normal', 19)).toBeCloseTo(0.1));
  it('critical doubles dice only', () => expect(rollDamage('1d8+3', true, seq(4, 6)).total).toBe(13));
  it('non-critical rolls dice once', () => expect(rollDamage('1d8+3', false, seq(4)).total).toBe(7));
  it('rollDice accepts an rng', () => expect(rollDice('2d6+1', seq(3, 4)).total).toBe(8));
});
