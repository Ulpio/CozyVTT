// ============================================
// One button of the action bar: an attack, a spell, an item, a check.
// ============================================

import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface ActionButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Smaller print under the label (a monster action's bonus and dice, for the GM). */
  detail?: string;
  /** Shown as the one in use (a menu that is open). */
  pressed?: boolean;
  /** A menu's button: it opens something rather than acts. */
  menu?: boolean;
}

export default function ActionButton({ children, onClick, disabled = false, detail, pressed, menu = false }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        'flex min-h-9 min-w-0 flex-col items-start justify-center rounded-cozy border px-3 py-1 text-left text-sm transition-colors',
        'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand',
        menu ? 'border-moss-green/30 bg-paper/60 text-ink-secondary' : 'border-brand/30 bg-brand/10 text-brand-ink',
        pressed && 'bg-brand/25',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-brand/20'
      )}
    >
      <span className="max-w-full truncate font-medium">{children}</span>
      {detail && <span className="max-w-full truncate text-xs text-ink-muted">{detail}</span>}
    </button>
  );
}
