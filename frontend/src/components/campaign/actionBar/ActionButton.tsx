// ============================================
// One button of the action bar: an attack, a spell, an item, a check; and a
// monster action whose recharge is spent, which rolls the recharge instead.
// ============================================

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionOption } from '@/types/actions';
import { cn } from '@/utils/cn';

interface ActionButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Smaller print under the label (a monster action's bonus and dice, for the GM). */
  detail?: ReactNode;
  /** Shown as the one in use (a menu that is open). */
  pressed?: boolean;
  /** A menu's button: it opens something rather than acts. */
  menu?: boolean;
  /** Why it is greyed (the turn's refusal), or a hint; shown on hover. */
  title?: string;
}

export default function ActionButton({ children, onClick, disabled = false, detail, pressed, menu = false, title }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      title={title}
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

/**
 * A spent recharge ("Recharge 5–6"): not an action until it comes back. The
 * GM's button rolls the d6, and a small Reset brings it back by hand; anyone
 * else sees it spent.
 */
export function RechargeButtons({ option, isGm, onRoll, onReset }: { option: ActionOption; isGm: boolean; onRoll: () => void; onReset: () => void }) {
  const { t } = useTranslation();
  const min = option.recharge?.min ?? 6;
  const range = min < 6 ? `${min}–6` : '6';
  if (!isGm) return <ActionButton disabled detail={t('actionBar.recharge.spent')} onClick={() => {}}>{option.name}</ActionButton>;
  return (
    <span className="inline-flex items-stretch gap-0.5">
      <ActionButton detail={t('actionBar.recharge.roll', { range })} onClick={onRoll}>{option.name}</ActionButton>
      <button
        type="button"
        onClick={onReset}
        aria-label={t('actionBar.recharge.resetLabel', { name: option.name })}
        title={t('actionBar.recharge.resetLabel', { name: option.name })}
        className="min-h-9 rounded-cozy border border-moss-green/30 bg-paper/60 px-2 text-xs text-ink-secondary hover:bg-moss-green/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
      >
        {t('actionBar.recharge.reset')}
      </button>
    </span>
  );
}
