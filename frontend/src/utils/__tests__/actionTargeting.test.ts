import { describe, it, expect } from 'vitest';
import type { Token } from '@/types';
import { tokensInReach, tokenDistanceFeet, actionErrorKey } from '../actionTargeting';

const tok = (id: string, x: number, y: number, w = 1, h = 1) =>
  ({ id, position: { x, y }, size: { width: w, height: h } }) as unknown as Token;

const map = { feetPerSquare: 5, diagonalRule: 'flat' as const };

describe('tokenDistanceFeet', () => {
  it('is 5 ft between adjacent tokens and 30 ft six squares away', () => {
    expect(tokenDistanceFeet(tok('a', 0, 0), tok('b', 1, 0), map)).toBe(5);
    expect(tokenDistanceFeet(tok('a', 0, 0), tok('b', 6, 0), map)).toBe(30);
  });
  it('counts diagonals by the map rule', () => {
    const b = tok('b', 3, 3);
    expect(tokenDistanceFeet(tok('a', 0, 0), b, { ...map })).toBe(15);
    expect(tokenDistanceFeet(tok('a', 0, 0), b, { feetPerSquare: 5, diagonalRule: 'alternating' })).toBe(20);
  });
  it('measures from the nearest edges of larger tokens', () => {
    expect(tokenDistanceFeet(tok('a', 0, 0, 2, 2), tok('b', 2, 0), map)).toBe(5);
  });
});

describe('tokensInReach', () => {
  const actor = tok('me', 0, 0);
  const near = tok('near', 1, 0);
  const far = tok('far', 6, 0);
  const all = [actor, near, far];

  it('a 5 ft melee option reaches the adjacent token only', () => {
    expect([...tokensInReach(actor, all, { kind: 'feet', normal: 5 }, map)]).toEqual(['near']);
  });
  it('touch reaches 5 ft', () => {
    expect([...tokensInReach(actor, all, { kind: 'touch' }, map)]).toEqual(['near']);
  });
  it('long range counts as in reach', () => {
    const set = tokensInReach(actor, all, { kind: 'feet', normal: 20, long: 40 }, map);
    expect(set.has('far')).toBe(true);
    expect(tokensInReach(actor, all, { kind: 'feet', normal: 20 }, map).has('far')).toBe(false);
  });
  it('never includes the actor, and self reaches nobody', () => {
    expect(tokensInReach(actor, all, { kind: 'feet', normal: 60 }, map).has('me')).toBe(false);
    expect(tokensInReach(actor, all, { kind: 'self' }, map).size).toBe(0);
  });
  it('a heal reaches the actor too, by touch or at range', () => {
    expect([...tokensInReach(actor, all, { kind: 'touch' }, map, 'heal')].sort()).toEqual(['me', 'near']);
    expect(tokensInReach(actor, all, { kind: 'feet', normal: 60 }, map, 'heal').has('me')).toBe(true);
    expect(tokensInReach(actor, all, { kind: 'feet', normal: 60 }, map, 'attack').has('me')).toBe(false);
  });
  it('no reach known means every other token', () => {
    expect([...tokensInReach(actor, all, undefined, map)].sort()).toEqual(['far', 'near']);
  });
});

describe('actionErrorKey', () => {
  it('maps the server refusals and falls back to a generic key', () => {
    expect(actionErrorKey('Out of range')).toBe('actionBar.errors.outOfRange');
    expect(actionErrorKey('Not your token')).toBe('actionBar.errors.notYourToken');
    expect(actionErrorKey('Whatever')).toBe('actionBar.errors.generic');
    expect(actionErrorKey(undefined)).toBe('actionBar.errors.generic');
  });
});
