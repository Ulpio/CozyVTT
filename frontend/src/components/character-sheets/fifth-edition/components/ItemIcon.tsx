import { itemIconFor } from '../../../../utils/itemIcons';
import type { CompendiumRef } from '../../../../types/game-systems/fifthEdition';

interface ItemIconProps {
  item: { name: string; compendiumRef?: CompendiumRef };
  entryType?: string;
  entryData?: unknown;
  /** Side of the square tile in pixels. */
  size?: number;
}

/** Light icon on a dark rounded tile. Decorative: the item's name is shown next to it. */
export function ItemIcon({ item, entryType, entryData, size = 32 }: ItemIconProps) {
  const Icon = itemIconFor(item, entryType, entryData);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-[#5a5040] bg-[#2f2a22] text-[#e8dcc0]"
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.68)} />
    </span>
  );
}

export default ItemIcon;
