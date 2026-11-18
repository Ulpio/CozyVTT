import { describe, expect, it } from 'vitest';
import {
  applySpend,
  canSpend,
  feetToMetresLabel,
  freshSpend,
  movementBudgetFeet,
  REFUSAL_MESSAGES,
} from '../turnEconomy';

const turn = { yourTurn: true };
const per2 = { attacksPerAction: 2 };

describe('turn economy', () => {
  it('walks two attacks under one Attack action, then refuses a third', () => {
    let s = freshSpend();
    expect(canSpend(s, 'attack', turn)).toEqual({ ok: true, as: 'attack' });
    s = applySpend(s, 'attack', per2);
    expect(s).toMatchObject({ action: true, attacksLeft: 1, attackActionTaken: true });
    expect(canSpend(s, 'attack', turn)).toEqual({ ok: true, as: 'attack' });
    s = applySpend(s, 'attack', per2);
    expect(s.attacksLeft).toBe(0);
    expect(canSpend(s, 'attack', turn)).toEqual({ ok: false, refusal: 'action-spent' });
  });

  it('lets an extra action fund a further attack action', () => {
    let s = { ...freshSpend(), extraActions: 1 };
    s = applySpend(applySpend(s, 'attack', per2), 'attack', per2);
    expect(canSpend(s, 'attack', turn)).toEqual({ ok: true, as: 'attack' });
    s = applySpend(s, 'attack', per2);
    expect(s.extraActions).toBe(0);
    expect(s.attacksLeft).toBe(1);
  });

  it('zeroes the attacks when another action is taken', () => {
    const s = applySpend(applySpend(freshSpend(), 'attack', per2), 'action', per2);
    expect(s.attacksLeft).toBe(0);
  });

  it('refuses a spent action, bonus and reaction on turn', () => {
    const s = { ...freshSpend(), action: true, bonus: true, reaction: true, attacksLeft: 0 };
    expect(canSpend(s, 'action', turn)).toEqual({ ok: false, refusal: 'action-spent' });
    expect(canSpend(s, 'bonus', turn)).toEqual({ ok: false, refusal: 'bonus-spent' });
    expect(canSpend(s, 'reaction', turn)).toEqual({ ok: false, refusal: 'reaction-spent' });
    expect(applySpend(freshSpend(), 'bonus', per2).bonus).toBe(true);
  });

  it('allows only reactions and melee attacks off turn', () => {
    const off = { yourTurn: false };
    const s = freshSpend();
    expect(canSpend(s, 'bonus', off)).toEqual({ ok: false, refusal: 'not-your-turn' });
    expect(canSpend(s, 'attack', off)).toEqual({ ok: false, refusal: 'not-your-turn' });
    expect(canSpend(s, 'reaction', off)).toEqual({ ok: true, as: 'reaction' });
    const melee = canSpend(s, 'attack', { ...off, meleeWeapon: true });
    expect(melee).toEqual({ ok: true, as: 'reaction' });
    const after = applySpend(s, 'reaction', per2);
    expect(after).toMatchObject({ reaction: true, attacksLeft: 1, action: false });
    expect(canSpend(after, 'attack', { ...off, meleeWeapon: true })).toEqual({ ok: false, refusal: 'reaction-spent' });
  });

  it('keeps once-per-turn keys', () => {
    const s = applySpend(freshSpend(), 'none', { ...per2, oncePerTurnKey: 'f1' });
    expect(s.oncePerTurn).toEqual(['f1']);
    expect(s.action).toBe(false);
    expect(canSpend(s, 'none', { ...turn, oncePerTurnKey: 'f1' })).toEqual({ ok: false, refusal: 'once-per-turn' });
    expect(canSpend(s, 'none', { ...turn, oncePerTurnKey: 'f2' }).ok).toBe(true);
  });

  it('computes movement and metres', () => {
    expect(movementBudgetFeet(30, { dashes: 1 })).toBe(60);
    expect(feetToMetresLabel(30)).toBe('9');
    expect(feetToMetresLabel(15)).toBe('4,5');
    expect(REFUSAL_MESSAGES['not-your-turn']).toBe('Não é a sua vez.');
  });
});
