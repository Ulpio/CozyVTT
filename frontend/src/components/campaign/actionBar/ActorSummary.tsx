// ============================================
// The left of the bar: the actor's portrait, name, hit points and armor
// class (only the actor's own), and, for a player with several characters,
// the other portraits to switch by.
// ============================================

import { useTranslation } from 'react-i18next';
import type { Token } from '@/types';
import { cn } from '@/utils/cn';

interface ActorSummaryProps {
  token: Token;
  hp: { current: number; max: number } | null;
  ac: number | null;
  /** The player's own tokens, when there is more than one to switch between. */
  candidates?: Token[];
  onChoose?: (tokenId: string) => void;
}

const portraitSize = 'h-10 w-10 shrink-0 rounded-full object-cover border border-moss-green/30 bg-surface-light';

export default function ActorSummary({ token, hp, ac, candidates = [], onChoose }: ActorSummaryProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2">
      {candidates.length > 1 ? (
        <div role="group" aria-label={t('actionBar.switchCharacter')} className="flex gap-1">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-label={candidate.name}
              aria-pressed={candidate.id === token.id}
              onClick={() => onChoose?.(candidate.id)}
              className={cn('rounded-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand', candidate.id !== token.id && 'opacity-50 hover:opacity-100')}
            >
              <img src={candidate.imageUrl} alt="" className={portraitSize} />
            </button>
          ))}
        </div>
      ) : (
        <img src={token.imageUrl} alt="" className={portraitSize} />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{token.name}</p>
        <p className="flex gap-2 text-xs text-ink-muted">
          {hp && <span>{t('actionBar.hp', { current: hp.current, max: hp.max })}</span>}
          {ac !== null && <span>{t('actionBar.ac', { ac })}</span>}
        </p>
      </div>
    </div>
  );
}
