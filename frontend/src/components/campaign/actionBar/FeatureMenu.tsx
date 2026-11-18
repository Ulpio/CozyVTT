// ============================================
// The "Features" menu: each class feature that is a button (Rage, Second
// Wind, Action Surge, Flurry of Blows, Lay on Hands...), its uses as pips
// (or a count when the pool is large), and a running state offered as "End
// <name>". Lay on Hands first asks how much of its pool to spend.
// ============================================

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionCombatTurn, ActionOption } from '@/types/actions';
import ActionButton from './ActionButton';
import { gateFor } from './turnGate';

const MAX_PIPS = 6;

export function UsePips({ uses }: { uses: { left: number; max: number } }) {
  const { t } = useTranslation();
  const label = t('actionBar.usesLabel', { left: uses.left, max: uses.max });
  if (uses.max > MAX_PIPS) return <span aria-label={label} className="text-xs tabular-nums text-ink-muted">{uses.left}/{uses.max}</span>;
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5">
      {Array.from({ length: uses.max }, (_, i) => (
        <span key={i} className={`inline-block size-2 rounded-full border border-brand ${i < uses.left ? 'bg-brand' : 'bg-transparent opacity-50'}`} />
      ))}
    </span>
  );
}

interface FeatureMenuProps {
  features: ActionOption[];
  combat?: ActionCombatTurn;
  onUse: (option: ActionOption, amount?: number) => void;
}

export default function FeatureMenu({ features, combat, onUse }: FeatureMenuProps) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState<ActionOption | null>(null);
  const [amount, setAmount] = useState(1);

  if (features.length === 0) return <p className="text-sm text-ink-muted">{t('actionBar.noFeatures')}</p>;

  const max = asking?.uses?.left ?? 1;
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= max;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {features.map((option) => {
          const why = gateFor(option, combat, t);
          const label = option.active ? t('actionBar.endFeature', { name: option.name }) : option.name;
          return (
            <ActionButton
              key={option.id}
              menu
              disabled={why !== undefined}
              title={why}
              pressed={asking?.id === option.id || option.active === true}
              detail={option.uses ? <UsePips uses={option.uses} /> : undefined}
              onClick={() => {
                if (option.chosenAmount && !option.active) { setAsking(option); setAmount(Math.min(1, option.uses?.left ?? 1)); } else onUse(option);
              }}
            >
              {label}
            </ActionButton>
          );
        })}
      </div>
      {asking && (
        <div role="group" aria-label={t('actionBar.howMuch', { name: asking.name })} className="flex flex-wrap items-center gap-1.5 border-t border-moss-green/20 pt-2">
          <label className="flex items-center gap-1.5 text-sm text-ink-muted">
            {t('actionBar.amount')}
            <input
              type="number"
              min={1}
              max={max}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="min-h-9 w-20 rounded-cozy border border-moss-green/30 bg-paper/60 px-2 text-sm text-ink"
            />
          </label>
          <ActionButton menu disabled={!valid} onClick={() => { onUse(asking, amount); setAsking(null); }}>{t('actionBar.useFeature')}</ActionButton>
        </div>
      )}
    </div>
  );
}
