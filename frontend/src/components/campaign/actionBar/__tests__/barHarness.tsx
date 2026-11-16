/**
 * Shared stand-ins for the action bar's tests: the campaign page's context,
 * the sign-in, the socket and the options the server lists.
 */
import { vi } from 'vitest';
import type { Token } from '@/types';
import type { ActionOption } from '@/types/actions';

export const h = {
  role: 'PLAYER' as string | null,
  userId: 'u1',
  characters: [] as Array<{ id: string; userId: string; name: string }>,
  sheets: {} as Record<string, unknown>,
  options: {} as Record<string, unknown[]>,
  list: vi.fn(),
  roll: vi.fn(),
  getCharacter: vi.fn(),
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
  id: 'attack:0', name: 'Longsword', group: 'attack', resolution: 'attack', grips: ['one', 'two'], reach: { kind: 'touch' },
};
export const fireBolt: ActionOption = {
  id: 'spell:fire-bolt', name: 'Fire Bolt', group: 'spell', resolution: 'attack', spellLevel: 0, reach: { kind: 'feet', normal: 120 },
};
export const magicMissile: ActionOption = {
  id: 'spell:magic-missile', name: 'Magic Missile', group: 'spell', resolution: 'cast', spellLevel: 1,
};
export const scimitar: ActionOption = { id: 'npc:0', name: 'Scimitar', group: 'npc', resolution: 'attack', reach: { kind: 'touch' } };
export const shortbow: ActionOption = { id: 'npc:1', name: 'Shortbow', group: 'npc', resolution: 'attack', reach: { kind: 'feet', normal: 80, long: 320 } };
