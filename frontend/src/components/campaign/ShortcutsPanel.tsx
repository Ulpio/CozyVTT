// ============================================
// The keyboard shortcuts window: every key the map takes, from MAP_SHORTCUTS,
// for whoever is looking. Opened by ? on the map and by the header's
// Keyboard shortcuts button; the campaign page holds whether it is open.
// ============================================

import { Keyboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal';
import { shortcutsFor, type MapShortcut } from './map/keyboard';

interface ShortcutsPanelProps {
  open: boolean;
  onClose: () => void;
  /** The viewer's role in the campaign: a player is shown no wall keys, a spectator no token keys. */
  role: string | null | undefined;
}

/** The keys that are described, not printed on a keyboard, as the window writes them in the app's language. */
const KEY_NAMES = {
  'Arrow keys': 'arrowKeys',
  'Shift + arrow keys': 'shiftArrowKeys',
  'Double tap': 'doubleTap',
  'Alt + click': 'altClick',
  'Shift + click': 'shiftClick',
  'Double-click': 'doubleClick',
  'Shift + drag': 'shiftDrag',
} as const;

function isDescribed(key: string): key is keyof typeof KEY_NAMES {
  return key in KEY_NAMES;
}

function ShortcutTable({ caption, shortcuts }: { caption: string; shortcuts: MapShortcut[] }) {
  const { t } = useTranslation();
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{t('shortcuts.keys')}</th>
          <th scope="col">{t('shortcuts.whatTheyDo')}</th>
        </tr>
      </thead>
      <tbody>
        {shortcuts.map((s) => (
          <tr key={s.id} className="border-t border-brand/10">
            <td className="py-1.5 pr-4 align-top whitespace-nowrap">
              {s.keys.map((k, i) => (
                <span key={k}>
                  {i > 0 && ' '}
                  <kbd className="rounded-sm border border-brand/30 bg-surface-light px-1.5 py-0.5 font-mono text-xs text-ink">{isDescribed(k) ? t(`shortcuts.keyNames.${KEY_NAMES[k]}`) : k}</kbd>
                </span>
              ))}
            </td>
            <td className="py-1.5 text-ink">{t(`shortcuts.does.${s.id}`)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ShortcutsPanel({ open, onClose, role }: ShortcutsPanelProps) {
  const { t } = useTranslation();
  const shown = shortcutsFor(role);
  const map = shown.filter((s) => s.who !== 'gm');
  const walls = shown.filter((s) => s.who === 'gm');

  return (
    <Modal open={open} onClose={onClose} title={t('shortcuts.title')} icon={Keyboard} size="md">
      <div className="space-y-5">
        <p className="text-sm text-ink-muted">
          {t('shortcuts.intro')}
        </p>
        <ShortcutTable caption={t('shortcuts.onTheMap')} shortcuts={map} />
        {walls.length > 0 && <ShortcutTable caption={t('shortcuts.wallsAndUndo')} shortcuts={walls} />}
      </div>
    </Modal>
  );
}
