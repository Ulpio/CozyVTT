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
  combat: undefined as unknown,
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

export const rage: ActionOption = {
  id: 'feature:book/barbaro/furia', name: 'Rage', group: 'feature', resolution: 'feature', cost: 'bonus', uses: { left: 2, max: 3 },
};
export const healingWord: ActionOption = {
  id: 'spell:healing-word', name: 'Healing Word', group: 'spell', resolution: 'heal', cost: 'bonus', spellLevel: 0, reach: { kind: 'feet', normal: 60 },
};
export const sneakAttack = { featureId: 'feature:book/ladino/furtivo', name: 'Sneak Attack', uses: { left: 1, max: 1 } };
export const divineSmite = { featureId: 'feature:book/paladino/destruir', name: 'Divine Smite', slot: true as const };

/** What `action.list` sends under `combat`: a turn with nothing spent, overridden per test. */
export function combatTurn(over: { yourTurn?: boolean; spend?: Record<string, unknown>; budgetFeet?: number; attacksPerAction?: number } = {}) {
  return {
    yourTurn: over.yourTurn ?? true,
    attacksPerAction: over.attacksPerAction ?? 1,
    budgetFeet: over.budgetFeet ?? 30,
    spend: {
      action: false, bonus: false, reaction: false, movedFeet: 0, dashes: 0, extraActions: 0, attacksLeft: 1,
      attackActionTaken: false, oncePerTurn: [], overBudgetWarned: false, ...over.spend,
    },
  };
}
