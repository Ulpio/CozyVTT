import { describe, it, expect } from 'vitest';
import type { Token } from '@/types';
import { tokensInReach, tokenDistanceFeet, actionErrorKey, tokensInArea, actionAreaPreview, centredOnCaster, snapAreaAim } from '../actionTargeting';
import type { ActionAreaPlacement, ActionOption } from '@/types/actions';
import type { ActionArea, AreaMap } from '@/utils/areaGeometry';
import areaScenarios from '../__fixtures__/area-scenarios.json';

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

interface AreaScenario {
  name: string;
  actorId: string;
  targeting: ActionArea;
  placement: ActionAreaPlacement;
  inRange: boolean;
  tokens: Token[];
  caught: string[];
}

// The same file backend/src/utils/__tests__/areaGeometry.test.ts runs against
// the server's rule: the preview lights the tokens the server will catch.
const areaFixture = areaScenarios as unknown as { map: AreaMap; scenarios: AreaScenario[] };

const areaOption = (targeting: AreaScenario['targeting']): ActionOption => ({
  id: 'spell:x', name: 'X', group: 'spell', resolution: 'save', cost: 'action', targeting: { kind: 'area', ...targeting },
});

describe('tokensInArea', () => {
  it.each(areaFixture.scenarios.map((s) => [s.name, s] as const))('as the server: %s', (_name, s) => {
    const actor = s.tokens.find((t) => t.id === s.actorId)!;
    const option = areaOption(s.targeting);
    expect(actionAreaPreview(s.tokens, actor, option, s.placement, areaFixture.map)?.inRange).toBe(s.inRange);
    expect(tokensInArea(s.tokens, actor, option, s.placement, areaFixture.map).map((t) => t.id)).toEqual(s.inRange ? s.caught : []);
  });

  it('matches the server rule for a 20 ft sphere and skips object tokens', () => {
    const gs = areaFixture.map.gridSize;
    // A 20 ft sphere on the square at column 10, row 9 (from the bottom of a 20-row map).
    const placement = { anchor: { x: 10 * gs + 10, y: (20 - 1 - 9) * gs + 10 } };
    const caster = { id: 'me', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, layer: 'token', type: 'player', characterId: 'c1' } as unknown as Token;
    const goblin = { id: 'goblin', position: { x: 13, y: 9 }, size: { width: 1, height: 1 }, layer: 'token', type: 'npc', statBlock: { name: 'Goblin' } } as unknown as Token;
    const barrel = { id: 'barrel', position: { x: 11, y: 9 }, size: { width: 1, height: 1 }, layer: 'token', type: 'object', statBlock: { name: 'Barrel' } } as unknown as Token;
    const option = areaOption({ area: { shape: 'sphere', sizeFt: 20 }, origin: 'point', rangeFeet: 150 });
    expect(tokensInArea([caster, goblin, barrel], caster, option, placement, areaFixture.map).map((t) => t.id)).toEqual(['goblin']);
  });

  it('a player, who is not sent stat blocks, sees every creature token that is not an object lit', () => {
    const caster = { id: 'me', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, layer: 'token', type: 'player', characterId: 'c1' } as unknown as Token;
    const monster = { id: 'm', position: { x: 1, y: 0 }, size: { width: 1, height: 1 }, layer: 'token', type: 'npc' } as unknown as Token;
    const option = areaOption({ area: { shape: 'sphere', sizeFt: 10 }, origin: 'self' });
    expect(tokensInArea([caster, monster], caster, option, { anchor: { x: 0, y: 0 } }, areaFixture.map, { knowsStatBlocks: false }).map((t) => t.id)).toEqual(['me', 'm']);
    expect(tokensInArea([caster, monster], caster, option, { anchor: { x: 0, y: 0 } }, areaFixture.map).map((t) => t.id)).toEqual(['me']);
  });

  it('an option with no area catches nobody', () => {
    const caster = { id: 'me', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } } as unknown as Token;
    expect(actionAreaPreview([caster], caster, { id: 'a', name: 'A', group: 'attack', resolution: 'attack', cost: 'action' }, { anchor: { x: 0, y: 0 } }, areaFixture.map)).toBeNull();
  });
});

describe('aiming helpers', () => {
  it('a sphere around the caster needs no aim; a cone or a point sphere does', () => {
    expect(centredOnCaster(areaOption({ area: { shape: 'sphere', sizeFt: 10 }, origin: 'self' }))).toBe(true);
    expect(centredOnCaster(areaOption({ area: { shape: 'cone', sizeFt: 15 }, origin: 'self' }))).toBe(false);
    expect(centredOnCaster(areaOption({ area: { shape: 'sphere', sizeFt: 20 }, origin: 'point', rangeFeet: 150 }))).toBe(false);
  });
  it('snaps a pointer to the centre of its quarter square', () => {
    expect(snapAreaAim({ x: 3, y: 49 }, 40)).toEqual({ x: 5, y: 45 });
    expect(snapAreaAim({ x: 10, y: 10 }, 40)).toEqual({ x: 15, y: 15 });
  });
});
