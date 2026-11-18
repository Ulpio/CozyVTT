/**
 * Initiative State Manager
 * Per-campaign combat state: the order, the round, the acting combatant and
 * what each combatant has spent this turn.
 *
 * The map below is the working copy, read and written synchronously by the
 * handlers. Every change is written through to the CombatState table (one row
 * per campaign, the newest state winning) and the table is loaded back into
 * the map at boot, so a restart no longer loses the fight. Token initiative
 * *values* are also kept on the map's tokens (the existing token update path).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { inBackground } from '../utils/backgroundWork';

export interface CombatantEntry {
  tokenId: string;
  /** The map the token is on, so a send can look the token up as it is now. */
  mapId: string;
  name: string;
  imageUrl: string;
  initiative: number | null;
  hp: { current: number; max: number; temp: number } | null;
  type: 'player' | 'npc' | 'object';
  disposition: 'friendly' | 'neutral' | 'hostile' | null;
  /** The token's character, for the tracker to open its sheet; null for a creature. */
  characterId: string | null;
}

/** What one combatant has spent in the turn it is taking (or last took). */
export interface TurnSpend {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  movedFeet: number;
  dashes: number;
  extraActions: number;
  attacksLeft: number;
  attackActionTaken: boolean;
  /** Features used that can be used once each turn, by id. */
  oncePerTurn: string[];
  overBudgetWarned: boolean;
}

export function freshSpend(): TurnSpend {
  return {
    action: false,
    bonus: false,
    reaction: false,
    movedFeet: 0,
    dashes: 0,
    extraActions: 0,
    attacksLeft: 1,
    attackActionTaken: false,
    oncePerTurn: [],
    overBudgetWarned: false,
  };
}

export interface CombatState {
  active: boolean;
  round: number;
  /** tokenId of the currently-acting combatant, null if combat not started */
  currentTokenId: string | null;
  /** Ordered list of combatants (descending by initiative) */
  combatants: CombatantEntry[];
  /** What each combatant has spent this turn, by tokenId. */
  spend: Record<string, TurnSpend>;
}

/** A state as callers build it: a missing `spend` is filled in as fresh. */
export type CombatStateInput = Omit<CombatState, 'spend'> & { spend?: Record<string, TurnSpend> };

/**
 * The state with a spend record for every combatant (fresh where there was
 * none) and none for anyone who is not in the order.
 */
function withSpend(state: CombatStateInput): CombatState {
  const spend: Record<string, TurnSpend> = {};
  for (const c of state.combatants) spend[c.tokenId] = state.spend?.[c.tokenId] ?? freshSpend();
  return { ...state, spend };
}

/**
 * The turn rule: `tokenId` becomes the acting combatant, its own spending is
 * reset, and every combatant's once-per-turn marks are cleared. Pure.
 */
export function beginTurn(state: CombatStateInput, tokenId: string): CombatState {
  const next = withSpend(state);
  const spend: Record<string, TurnSpend> = {};
  for (const [id, s] of Object.entries(next.spend)) spend[id] = { ...s, oncePerTurn: [] };
  if (next.combatants.some((c) => c.tokenId === tokenId)) spend[tokenId] = freshSpend();
  return { ...next, currentTokenId: tokenId, spend };
}

const campaignStates = new Map<string, CombatState>();

/**
 * How many times each campaign's state has been replaced. A send reads the
 * state, then the combatants' tokens and each player's plane, before it
 * emits; a change that lands meanwhile starts its own send with the newer
 * state, and the older send checks this before emitting so it never arrives
 * after the newer one. Ending the fight is the case that bit: its send has
 * nothing to look up and finished first, and the earlier send then showed
 * every client a fight that had ended.
 */
const versions = new Map<string, number>();

function bump(campaignId: string): void {
  versions.set(campaignId, (versions.get(campaignId) ?? 0) + 1);
}

export function getVersion(campaignId: string): number {
  return versions.get(campaignId) ?? 0;
}

/**
 * Sends of the whole order to a campaign, numbered as they start. The
 * version above changes only with the order itself, but a send also carries
 * each combatant's token as it is now, and a token change (hit points, a
 * hidden creature) starts a send without changing the order. A send that a
 * later whole-campaign send has started behind is dropped, since the later
 * one reads newer tokens and reaches everyone.
 */
const sends = new Map<string, number>();

/** Number a send of the whole order to the campaign as it starts. */
export function startSend(campaignId: string): number {
  const next = (sends.get(campaignId) ?? 0) + 1;
  sends.set(campaignId, next);
  return next;
}

/** The number of the most recent whole-campaign send to have started. */
export function latestSend(campaignId: string): number {
  return sends.get(campaignId) ?? 0;
}

function defaultState(): CombatState {
  return {
    active: false,
    round: 0,
    currentTokenId: null,
    combatants: [],
    spend: {},
  };
}

export function getState(campaignId: string): CombatState {
  return campaignStates.get(campaignId) ?? defaultState();
}

/**
 * The write-through: each campaign's writes run one after another, and a
 * write stores whatever the map holds when its turn comes, so of several
 * changes queued together the newest is what ends up in the table.
 */
const writes = new Map<string, Promise<void>>();

/** Bumped when a restore replaces the database, so a write queued before it is dropped. */
let writeEpoch = 0;

function queueWrite(campaignId: string): void {
  const previous = writes.get(campaignId) ?? Promise.resolve();
  const epoch = writeEpoch;
  const next = previous.then(async () => {
    if (epoch !== writeEpoch) return;
    try {
      const state = campaignStates.get(campaignId);
      if (state && (state.active || state.combatants.length > 0)) {
        const json = state as unknown as Prisma.InputJsonValue;
        await prisma.combatState.upsert({
          where: { campaignId },
          create: { campaignId, state: json },
          update: { state: json },
        });
      } else {
        await prisma.combatState.deleteMany({ where: { campaignId } });
      }
    } catch (error) {
      // A campaign deleted meanwhile has nothing to keep the fight in.
      logger.warn('combat state write failed', { err: error, campaignId });
    }
  });
  writes.set(campaignId, next);
  // Counted as background work, so a shutdown lets it finish.
  inBackground('combat state write', () => next);
}

/** Wait for the queued writes of one campaign, or of every campaign. */
export async function flushCombatWrites(campaignId?: string): Promise<void> {
  if (campaignId !== undefined) {
    await writes.get(campaignId);
    return;
  }
  await Promise.all([...writes.values()]);
}

/** Load every stored fight into memory, at boot. */
export async function hydrateCombatStates(): Promise<void> {
  const rows = await prisma.combatState.findMany();
  for (const row of rows) {
    const stored = row.state as unknown as CombatStateInput | null;
    if (!stored || !Array.isArray(stored.combatants)) continue;
    campaignStates.set(row.campaignId, withSpend(stored));
    bump(row.campaignId);
  }
}

const locks = new Map<string, Promise<unknown>>();

/**
 * Run `fn` with the campaign's state while no other caller of this is
 * running for the same campaign, so a read-modify-write of one combatant's
 * spending cannot lose an update to another. `fn` stores its change with
 * setState itself.
 */
export function withCombatLock<T>(campaignId: string, fn: (state: CombatState) => Promise<T> | T): Promise<T> {
  const run = (locks.get(campaignId) ?? Promise.resolve()).then(() => fn(getState(campaignId)));
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  locks.set(campaignId, settled);
  void settled.then(() => {
    if (locks.get(campaignId) === settled) locks.delete(campaignId);
  });
  return run;
}

export function setState(campaignId: string, input: CombatStateInput): void {
  const state = withSpend(input);
  campaignStates.set(campaignId, state);
  bump(campaignId);
  queueWrite(campaignId);
  // A combatant that has left the order may be rolled for again when it
  // comes back.
  const rolled = playerRolls.get(campaignId);
  if (rolled) {
    for (const tokenId of rolled) {
      if (!state.combatants.some((c) => c.tokenId === tokenId)) rolled.delete(tokenId);
    }
  }
}

/**
 * After a restore replaces the database: drop every write queued before it
 * (it describes the old data), then load the restored table, so memory holds
 * the fights the backup saved and the table agrees with it.
 */
export async function reloadCombatStates(): Promise<void> {
  writeEpoch += 1;
  await flushCombatWrites();
  forgetCombatMemory();
  try {
    await hydrateCombatStates();
  } catch (error) {
    logger.error('Could not load the stored combat states after a restore', { err: error });
  }
}

/**
 * Empty the working copy and leave the table as it is, as a restart does
 * before the table is loaded back (hydrateCombatStates).
 */
export function forgetCombatMemory(): void {
  for (const campaignId of campaignStates.keys()) bump(campaignId);
  campaignStates.clear();
  playerRolls.clear();
}

export function clearState(campaignId: string): void {
  campaignStates.delete(campaignId);
  playerRolls.delete(campaignId);
  bump(campaignId);
  queueWrite(campaignId);
}

/**
 * The combatants a player has rolled initiative for, by campaign. A player
 * rolls once each time their token joins the order: rolling again until a
 * good number came up was open to anyone. The GM can still change the
 * number. Kept apart from the state, which is sent to clients as it is; a
 * combatant leaving the order, or the fight ending, forgets its roll.
 */
const playerRolls = new Map<string, Set<string>>();

/** Whether a player has rolled for this combatant in this fight. */
export function playerHasRolled(campaignId: string, tokenId: string): boolean {
  return playerRolls.get(campaignId)?.has(tokenId) ?? false;
}

/** Record a player's roll for a combatant, or take it back (`rolled` false) when it did not happen. */
export function markPlayerRolled(campaignId: string, tokenId: string, rolled = true): void {
  let marks = playerRolls.get(campaignId);
  if (!marks) {
    if (!rolled) return;
    marks = new Set();
    playerRolls.set(campaignId, marks);
  }
  if (rolled) marks.add(tokenId);
  else marks.delete(tokenId);
}

/**
 * Drop the combatants `gone` names, when a token or a whole map is deleted.
 * An entry whose token is gone used to linger for the GM (the projection kept
 * the copy taken when it joined) while players no longer saw it, so the two
 * disagreed about the order. Returns whether anything was dropped.
 */
export function removeCombatants(campaignId: string, gone: (entry: CombatantEntry) => boolean): boolean {
  const next = withoutCombatants(getState(campaignId), gone);
  if (!next) return false;
  setState(campaignId, next);
  return true;
}

/**
 * The order without the combatants `gone` picks, or null when it picks none.
 * If the acting combatant is among them the turn passes on as Next would: to
 * the first one after them who stays, or round to the top of the order in a
 * new round. With nobody left the fight is over: an active round with no
 * combatants can be neither advanced nor ended, since the tracker draws
 * those controls beside a combatant and the server refuses Next and Start on
 * an empty order. The tracker's Remove and a deleted token both go through
 * this.
 */
export function withoutCombatants(state: CombatState, gone: (entry: CombatantEntry) => boolean): CombatState | null {
  const kept = state.combatants.filter((c) => !gone(c));
  if (kept.length === state.combatants.length) return null;
  if (kept.length === 0) return defaultState();
  let { currentTokenId, round } = state;
  let turnPassed = false;
  const currentIndex = state.combatants.findIndex((c) => c.tokenId === currentTokenId);
  if (currentIndex !== -1 && gone(state.combatants[currentIndex])) {
    const after = state.combatants.slice(currentIndex + 1).find((c) => !gone(c));
    if (after) {
      currentTokenId = after.tokenId;
      turnPassed = true;
    } else {
      currentTokenId = kept[0].tokenId;
      if (state.active) round += 1;
      turnPassed = true;
    }
  }
  const rest = withSpend({ ...state, combatants: kept, currentTokenId, round });
  return turnPassed && currentTokenId ? beginTurn(rest, currentTokenId) : rest;
}

/**
 * A sorted copy: descending initiative, the unrolled last. Ties keep the order
 * the combatants were added in (the sort is stable). A tie broken by name
 * would tell a player where an obscured combatant's real name falls in the
 * alphabet; the order of adding says nothing.
 */
export function sortCombatants(combatants: CombatantEntry[]): CombatantEntry[] {
  return [...combatants].sort((a, b) => {
    if (a.initiative === null) return b.initiative === null ? 0 : 1;
    if (b.initiative === null) return -1;
    return b.initiative - a.initiative;
  });
}

/** The fields of a map token a combatant is read from. */
export interface CombatantSource {
  id: string;
  name: string;
  imageUrl: string;
  hp?: { current: number; max: number; temp: number } | null;
  type?: 'player' | 'npc' | 'object';
  disposition?: 'friendly' | 'neutral' | 'hostile' | null;
  characterId?: string | null;
}

/**
 * The state as one recipient may see it. Entries follow their tokens: a
 * player is given only the combatants the role filter keeps for them, with
 * the name, picture, hit points and character exactly as that token is sent
 * to them (the filter has already dropped hidden and off-plane tokens, the
 * hit points they may not know, and an obscured token's identity). The lighting rule is not applied here: the
 * order is public once the GM adds a token to it, so a combatant out of a
 * player's sight on a lit or fogged map is still listed, and hiding the
 * token is what keeps it out. The GM gets every combatant with the token as
 * it is now, and the copy taken when it joined if the token is gone. The
 * stored state is not changed. What a combatant has spent goes to the GM for
 * every combatant, and to a player for those `viewerControls` says they
 * control, never for anyone else's character or a creature.
 */
export function projectCombatState(
  state: CombatState,
  tokens: ReadonlyMap<string, CombatantSource>,
  isGM: boolean,
  viewerControls?: (tokenId: string) => boolean
): CombatState {
  const combatants: CombatantEntry[] = [];
  for (const entry of state.combatants) {
    const token = tokens.get(entry.tokenId);
    if (!token) {
      if (isGM) combatants.push({ ...entry });
      continue;
    }
    combatants.push({
      ...entry,
      name: token.name,
      imageUrl: token.imageUrl || '',
      hp: token.hp ?? null,
      type: token.type ?? 'npc',
      disposition: token.disposition ?? null,
      characterId: token.characterId ?? null,
    });
  }
  const currentTokenId = combatants.some((c) => c.tokenId === state.currentTokenId) ? state.currentTokenId : null;
  const spend: Record<string, TurnSpend> = {};
  for (const c of combatants) {
    const spent = state.spend[c.tokenId];
    if (spent && (isGM || viewerControls?.(c.tokenId))) spend[c.tokenId] = { ...spent, oncePerTurn: [...spent.oncePerTurn] };
  }
  return { active: state.active, round: state.round, currentTokenId, combatants, spend };
}
