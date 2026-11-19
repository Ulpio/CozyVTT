import { useEffect, useState, useSyncExternalStore } from 'react';
import { itemIconFor } from '../../../../utils/itemIcons';
import {
  loadLocalItemIcons,
  localItemIconUrl,
  localItemIconsVersion,
  subscribeLocalItemIcons,
} from '../../../../utils/localItemIcons';
import type { CompendiumRef } from '../../../../types/game-systems/fifthEdition';

interface ItemIconProps {
  item: { name: string; compendiumRef?: CompendiumRef };
  entryType?: string;
  entryData?: unknown;
  /** Side of the square tile in pixels. */
  size?: number;
}

/**
 * Light icon on a dark rounded tile. Decorative: the item's name is shown next to it.
 * A picture from the table's own icon folder wins over the built-in icon when there is one.
 */
export function ItemIcon({ item, entryType, entryData, size = 32 }: ItemIconProps) {
  useSyncExternalStore(subscribeLocalItemIcons, localItemIconsVersion);
  useEffect(() => { void loadLocalItemIcons(); }, []);
  const local = localItemIconUrl(item, entryType, entryData);
  const [broken, setBroken] = useState<string | null>(null);
  const Icon = itemIconFor(item, entryType, entryData);
  return (
    <span
      aria-hidden="true"
      data-testid="item-icon"
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#5a5040] bg-[#2f2a22] text-[#e8dcc0]"
      style={{ width: size, height: size }}
    >
      {local && broken !== local ? (
        <img src={local} alt="" draggable={false} className="h-full w-full object-contain" onError={() => setBroken(local)} />
      ) : (
        <Icon size={Math.round(size * 0.68)} />
      )}
    </span>
  );
}

export default ItemIcon;
