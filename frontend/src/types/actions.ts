// What the action bar knows of one thing a token can do. Mirrors the server's
// ActionOption (backend/src/rules/actions/catalogue.ts): no AC, no HP.

export type ActionRollMode = 'normal' | 'advantage' | 'disadvantage';

export type ActionReach = { kind: 'self' | 'touch' } | { kind: 'feet'; normal: number; long?: number };

export interface ActionOption {
  id: string;
  name: string;
  group: 'attack' | 'spell' | 'npc';
  resolution: 'attack' | 'heal' | 'cast' | 'post';
  spellLevel?: number;
  concentration?: boolean;
  grips?: ('one' | 'two')[];
  reach?: ActionReach;
  /** NPC options only: the attack bonus and dice, for the GM. */
  summary?: string;
}

/** What the client may send: never a bonus or dice. */
export interface ActionRequest {
  mapId: string;
  actorTokenId: string;
  actionId: string;
  targetTokenId?: string;
  mode: ActionRollMode;
  slotLevel?: number;
  grip?: 'one' | 'two';
  replaceConcentration?: boolean;
}

export interface ActionResolveAck {
  ok: boolean;
  messageId?: string;
  error?: string;
  code?: string;
}
