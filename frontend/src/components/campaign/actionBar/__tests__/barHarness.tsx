/**
 * Shared stand-ins for the action bar's tests: the campaign page's context,
 * the sign-in, the socket and the options the server lists.
 */
import { vi } from 'vitest';
import type { Token } from '@/types';
import type { ActionOption } from '@/types/actions';

export const h = {
  role: 'PLAYER' as string | null,
  gameSystem: 'FIFTH_EDITION' as string,
  userId: 'u1',
  characters: [] as Array<{ id: string; userId: string; name: string }>,
  sheets: {} as Record<string, unknown>,
  options: {} as Record<string, unknown[]>,
  list: vi.fn(),
  roll: vi.fn(),
  getCharacter: vi.fn(),
  recharge: vi.fn(),
  rechargeReset: vi.fn(),
  handlers: new Map<string, Set<(data: unknown) => void>>(),
};

export function token(partial: Partial<Token> & { id: string }): Token {
  return {
    characterId: null, name: partial.id, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
    layer: 'TOKEN', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
    type: 'NPC', disposition: null, hp: null, showHpBar: false, initiative: null,
    ...partial,
  } as unknown as Token;
}

export const longsword: ActionOption = {
  id: 'attack:0', name: 'Longsword', group: 'attack', resolution: 'attack', cost: 'action', grips: ['one', 'two'], reach: { kind: 'touch' },
};
export const fireBolt: ActionOption = {
  id: 'spell:fire-bolt', name: 'Fire Bolt', group: 'spell', resolution: 'attack', cost: 'action', spellLevel: 0, reach: { kind: 'feet', normal: 120 },
};
export const magicMissile: ActionOption = {
  id: 'spell:magic-missile', name: 'Magic Missile', group: 'spell', resolution: 'cast', cost: 'action', spellLevel: 1,
};
export const scimitar: ActionOption = { id: 'npc:0', name: 'Scimitar', group: 'npc', resolution: 'attack', cost: 'action', reach: { kind: 'touch' } };
export const shortbow: ActionOption = { id: 'npc:1', name: 'Shortbow', group: 'npc', resolution: 'attack', cost: 'action', reach: { kind: 'feet', normal: 80, long: 320 } };
export const fireBreath: ActionOption = {
  id: 'npc:2', name: 'Fire Breath', group: 'npc', resolution: 'save', cost: 'action', reach: { kind: 'self' }, recharge: { min: 5, spent: true },
  targeting: { kind: 'area', area: { shape: 'cone', sizeFt: 15 }, origin: 'self' },
};
