// ============================================
// The door menu as data: what a right-click or a long-press on a door offers
// a viewer, for a door the map offers them (map/doorAccess.ts). The GM opens,
// closes, locks and unlocks; anyone else opens and closes, and reads that a
// locked door is locked.
//
// Pure: no React, no DOM.
// ============================================

import { CampaignRole } from '@/types';
import type { WallSegment, WallType } from '@/types/walls';
import type { MenuItem } from '@/components/ui/menu';
import i18n from '@/i18n';

export interface DoorMenuContext {
  /** The viewer's role in the campaign; null until it is known. */
  role: CampaignRole | null;
  actions: {
    /** Makes the door `type`, for everyone. */
    setType: (door: WallSegment, type: WallType) => void;
  };
}

export function doorMenuItems(door: WallSegment, ctx: DoorMenuContext): MenuItem[] {
  const isGM = ctx.role === CampaignRole.GM;
  const set = (type: WallType) => () => ctx.actions.setType(door, type);
  const items: MenuItem[] = [{
    kind: 'heading',
    id: 'state',
    label: door.type === 'door-closed' ? i18n.t('doorMenu.closed') : door.type === 'door-open' ? i18n.t('doorMenu.open') : i18n.t('doorMenu.locked'),
  }];

  if (door.type === 'door-closed') items.push({ kind: 'command', id: 'open', label: i18n.t('doorMenu.openAction'), tone: 'brand', run: set('door-open') });
  if (door.type === 'door-open') items.push({ kind: 'command', id: 'close', label: i18n.t('doorMenu.closeAction'), tone: 'brand', run: set('door-closed') });
  if (isGM && door.type !== 'door-locked') items.push({ kind: 'command', id: 'lock', label: i18n.t('doorMenu.lockAction'), tone: 'danger', run: set('door-locked') });
  if (isGM && door.type === 'door-locked') items.push({ kind: 'command', id: 'unlock', label: i18n.t('doorMenu.unlockAction'), tone: 'brand', run: set('door-closed') });
  if (!isGM && door.type === 'door-locked') items.push({ kind: 'text', id: 'locked', label: i18n.t('doorMenu.isLocked') });
  return items;
}
