// ============================================
// GM Tool Menus: the GM's tools in the session header, as three named menus
// ============================================
// The header used to carry a row of nine look-alike icons whose names showed
// only on hover. Here they are grouped by what the GM is doing, each group a
// labelled button that opens a menu:
//   Prepare  — maps, the tokens on the map, creatures, token templates
//   Ambience — atmosphere and the spirit layer
//   Table    — campaign documents, keyboard shortcuts, campaign settings
// The menus are the roster's popover (CharacterContextMenu), drawn on the
// body under the button. What each tool opens is the page's; this only asks.

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronDown, Cloud, Ghost, Keyboard, Map as MapIcon, Settings, Skull, Stamp, Swords, type LucideIcon } from 'lucide-react';
import CharacterContextMenu from '@/components/campaign/CharacterContextMenu';
import type { SessionToolKey } from '@/components/campaign/SessionToolbar';
import type { FlatMenuItem } from '@/components/ui/menu';
import { cn } from '@/utils/cn';

type MenuId = 'prepare' | 'ambience' | 'table';

/** The header's own tools, beside the slide-overs the page opens. */
type ExtraKey = 'documents' | 'shortcuts';

interface Entry {
  key: SessionToolKey | ExtraKey;
  icon: LucideIcon;
}

/** The same icons the compact layout's More list shows for these tools (SessionToolbar's TOOL_GROUPS). */
const TOOL_ICONS: Record<SessionToolKey, LucideIcon> = {
  maps: MapIcon,
  tokens: Swords,
  creatures: Skull,
  templates: Stamp,
  spirit: Ghost,
  atmosphere: Cloud,
  settings: Settings,
};
const iconOf = (key: SessionToolKey): LucideIcon => TOOL_ICONS[key];

const MENUS: { id: MenuId; entries: Entry[] }[] = [
  {
    id: 'prepare',
    entries: (['maps', 'tokens', 'creatures', 'templates'] as const).map((key) => ({ key, icon: iconOf(key) })),
  },
  {
    id: 'ambience',
    entries: (['atmosphere', 'spirit'] as const).map((key) => ({ key, icon: iconOf(key) })),
  },
  {
    id: 'table',
    entries: [
      { key: 'documents', icon: BookOpen },
      { key: 'shortcuts', icon: Keyboard },
      { key: 'settings', icon: iconOf('settings') },
    ],
  },
];

interface GmToolMenusProps {
  /** Which slide-overs are open, so their menu's button shows pressed. */
  openPanels: Partial<Record<SessionToolKey, boolean>>;
  onOpen: (key: SessionToolKey) => void;
  onOpenDocuments: () => void;
  onOpenShortcuts: () => void;
  /** The spirit layer is open for the campaign: its row says so in its colour. */
  spiritLayerEnabled?: boolean;
}

export default function GmToolMenus({
  openPanels,
  onOpen,
  onOpenDocuments,
  onOpenShortcuts,
  spiritLayerEnabled = false,
}: GmToolMenusProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<{ id: MenuId; x: number; y: number; byKeyboard: boolean } | null>(null);
  // Each opening mounts a new menu, as the roster's does.
  const openings = useRef(0);

  const run = (key: Entry['key']) => {
    if (key === 'documents') onOpenDocuments();
    else if (key === 'shortcuts') onOpenShortcuts();
    else onOpen(key);
  };

  const itemsOf = (id: MenuId): FlatMenuItem[] =>
    MENUS.find((menu) => menu.id === id)!.entries.map(({ key, icon }) => ({
      kind: 'command',
      id: key,
      label: t(`session.tools.${key}`),
      icon,
      tone: key === 'spirit' && spiritLayerEnabled ? 'spirit' : 'plain',
      strong: key !== 'documents' && key !== 'shortcuts' && openPanels[key] === true,
      run: () => run(key),
    }));

  // The popover closes on any press outside it, its own button's too, before
  // the button's click arrives; without this the click would open it again.
  // React hears the press before the popover's listener on the document.
  const closingFromButton = useRef<MenuId | null>(null);

  const toggle = (id: MenuId, button: HTMLButtonElement, byKeyboard: boolean) => {
    if (closingFromButton.current === id) {
      closingFromButton.current = null;
      setOpen(null);
      return;
    }
    if (open?.id === id) {
      setOpen(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    openings.current += 1;
    setOpen({ id, x: rect.left, y: rect.bottom + 4, byKeyboard });
  };

  return (
    <div role="toolbar" aria-label={t('session.menus.label')} className="flex flex-wrap items-center gap-1">
      {MENUS.map(({ id, entries }) => {
        const pressed = entries.some(({ key }) => key !== 'documents' && key !== 'shortcuts' && openPanels[key]);
        return (
          <button
            key={id}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open?.id === id}
            onMouseDown={() => {
              closingFromButton.current = open?.id === id ? id : null;
            }}
            // A press of Enter or Space arrives as a click with no pointer.
            onClick={(e) => toggle(id, e.currentTarget, e.detail === 0)}
            className={cn(
              'flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors',
              'border-moss-green/25 bg-surface-light/60 text-ink hover:bg-moss-green/10',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/50',
              (pressed || open?.id === id) && 'bg-accent/15 border-accent/40 text-accent-ink'
            )}
          >
            {t(`session.menus.${id}`)}
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          </button>
        );
      })}
      {open && (
        <CharacterContextMenu
          key={openings.current}
          x={open.x}
          y={open.y}
          items={itemsOf(open.id)}
          onClose={() => setOpen(null)}
          autoFocus={open.byKeyboard}
          title={t(`session.menus.${open.id}`)}
        />
      )}
    </div>
  );
}
