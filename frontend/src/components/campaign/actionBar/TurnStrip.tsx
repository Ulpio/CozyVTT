// ============================================
// The turn at a glance, over the bar while the actor is in a fight: Action,
// Bonus and Reaction as pips (filled = still free), the attack of the Attack
// action it is on, the movement left in metres, and whose turn it is.
// ============================================

import { useTranslation } from 'react-i18next';
import type { ActionCombatTurn } from '@/types/actions';
import { feetToMetresLabel } from '@/utils/turnEconomy';

function Pip({ label, free }: { label: string; free: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1">
      <span
        role="img"
        aria-label={t(free ? 'actionBar.turn.pipFree' : 'actionBar.turn.pipUsed', { name: label })}
        className={`inline-block size-2.5 rounded-full border border-brand ${free ? 'bg-brand' : 'bg-transparent opacity-50'}`}
      />
      <span className="text-xs text-ink-muted">{label}</span>
    </span>
  );
}

export default function TurnStrip({ combat }: { combat: ActionCombatTurn }) {
  const { t } = useTranslation();
  const { spend, yourTurn, attacksPerAction, budgetFeet } = combat;
  const left = Math.max(0, budgetFeet - spend.movedFeet);
  const nextAttack = attacksPerAction - spend.attacksLeft + 1;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="turn-strip">
      <span className={`font-semibold ${yourTurn ? 'text-brand-ink' : 'text-ink-muted'}`}>{t(yourTurn ? 'actionBar.turn.yours' : 'actionBar.turn.notYours')}</span>
      <Pip label={t('actionBar.turn.action')} free={!spend.action} />
      <Pip label={t('actionBar.turn.bonus')} free={!spend.bonus} />
      <Pip label={t('actionBar.turn.reaction')} free={!spend.reaction} />
      {spend.attackActionTaken && spend.attacksLeft > 0 && (
        // A monster's Multiattack is on the honour system: it is given 100 attacks, which is not a count to show.
        <span className="tabular-nums">{attacksPerAction >= 100 ? t('actionBar.turn.multiattack') : t('actionBar.turn.attackOf', { n: nextAttack, max: attacksPerAction })}</span>
      )}
      <span className="tabular-nums text-ink-muted">{t('actionBar.turn.movement', { left: feetToMetresLabel(left), max: feetToMetresLabel(budgetFeet) })}</span>
    </div>
  );
}
