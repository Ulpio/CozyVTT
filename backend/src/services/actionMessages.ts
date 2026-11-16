/**
 * What each reader is sent of a chat message that carries an action card.
 *
 * The stored card is the GM's: it holds the target's AC, the hit chance, the
 * hit points and the record that undoes the action. Everything that leaves
 * the server with a message's metadata, live or in history, goes through
 * here, so a player is sent the card projected for them (projectActionCard)
 * and never the stored one. Other metadata passes unchanged: the small
 * concentration card holds the roll a table sees anyway, with a masked
 * token's name left out.
 */

import type { ActionCard, Viewer } from '../rules/actions/actionCard';
import { projectActionCard } from '../rules/actions/actionCard';

/** A reader's viewer, from the role stored on the socket or the membership. Anything but GM or PLAYER is a spectator. */
export function viewerOf(role: string | undefined, userId: string): Viewer {
  return { role: role === 'GM' ? 'GM' : role === 'PLAYER' ? 'PLAYER' : 'SPECTATOR', userId };
}

function isActionCard(metadata: unknown): metadata is ActionCard {
  return typeof metadata === 'object' && metadata !== null && (metadata as { kind?: unknown }).kind === 'action';
}

/**
 * The metadata of a message as this reader may see it. The GM's is the stored
 * object, by reference: do not change it. A card that cannot be projected
 * is withheld from anyone but the GM rather than sent whole.
 */
export function metadataFor<T>(metadata: T, viewer: Viewer): T | unknown | null {
  if (!isActionCard(metadata)) return metadata;
  try {
    return projectActionCard(metadata, viewer);
  } catch {
    return viewer.role === 'GM' ? metadata : null;
  }
}
