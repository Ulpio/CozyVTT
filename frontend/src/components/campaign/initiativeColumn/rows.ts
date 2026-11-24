import type { CombatState } from '@/types';

export interface InitiativeRow {
  tokenId: string;
  mapId: string;
  name: string;
  imageUrl: string;
  /** The rolled value as text, or '–' when the combatant has not rolled. */
  value: string;
  current: boolean;
  /** Null when this viewer must not see it. */
  hp: { current: number; max: number; temp: number } | null;
}

/** The initiative column's rows, in the order the server sent them. */
export function initiativeRows(combat: CombatState, viewer: { isGM: boolean }): InitiativeRow[] {
  if (!combat.active) return [];
  return combat.combatants.map(c => ({
    tokenId: c.tokenId,
    mapId: c.mapId,
    name: c.name,
    imageUrl: c.imageUrl,
    value: c.initiative === null ? '–' : String(c.initiative),
    current: c.tokenId === combat.currentTokenId,
    hp: viewer.isGM || c.type === 'player' ? c.hp : null,
  }));
}
