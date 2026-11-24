import { useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { diceExpressionProblem } from '@/utils/diceExpression';
import { customRollPurpose } from '@/utils/rollText';

interface CustomRollFooterProps {
  /**
   * Called with a validated expression and the label to file the roll under.
   *
   * The caller decides *who* the roll is for — a token's name, a character's —
   * so this stays the same control in both pickers.
   */
  onRoll: (expression: string, purpose: string) => void;
  /** Boxes and Roll a finger can press, 44 px tall, in the compact layout's picker sheets. */
  compact?: boolean;
}

/**
 * A free-form roll, pinned below whatever list a picker is showing.
 *
 * Not everything a table rolls comes off a sheet or a stat block: a falling
 * rock, a GM's improvised save, a homebrew effect. The creature picker had
 * this and the character picker did not, so a player's only route was the
 * dice panel on another tab — which files the roll under their own name
 * rather than their character's.
 */
export default function CustomRollFooter({ onRoll, compact = false }: CustomRollFooterProps) {
  const { t } = useTranslation();
  const tall = compact ? ' min-h-11' : '';
  const [expression, setExpression] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const expr = expression.trim();
    if (!expr) { setError(t('rollPicker.enterExpression')); return; }
    const problem = diceExpressionProblem(expr);
    if (problem) { setError(problem); return; }
    onRoll(expr, label.trim() || customRollPurpose());
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter while an input method is composing confirms the candidate.
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
  };

  return (
    <div className="shrink-0 border-t border-moss-green/20 bg-parchment/30 px-3 py-2 space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-warm-gray">
        {t('rollPicker.customRoll')}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={expression}
          onChange={(e) => { setExpression(e.target.value); setError(null); }}
          onKeyDown={onEnter}
          placeholder={t('rollPicker.expressionPlaceholder')}
          className={`input-cozy flex-1 text-xs py-1${tall}`}
        />
        <button
          onClick={submit}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-cozy bg-moss-green/10 text-brand-ink border border-moss-green/30 hover:bg-moss-green/15 transition-colors${tall}`}
          title={t('rollPicker.roll')}
        >
          <Plus className="w-3 h-3" /> {t('rollPicker.roll')}
        </button>
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={onEnter}
        placeholder={t('rollPicker.labelPlaceholder')}
        className={`input-cozy w-full text-xs py-1${tall}`}
      />
      {error && <div className="text-[10px] text-danger-ink">{error}</div>}
    </div>
  );
}
