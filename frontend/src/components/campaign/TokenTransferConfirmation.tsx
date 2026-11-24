// ============================================
// Which tokens go along when the table moves
//
// Shown before the table is moved to another map, from the Map Library's
// Set Active and from Bring everyone here while the GM prepares a map: the
// tokens on the table's map, to tick the ones that go with it.
// ============================================

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import type { CampaignMap, Token } from '@/types';
import Button from '@/components/ui/Button';

export interface TokenTransferProps {
  tokens: Token[];
  /** The table's map, the one the tokens are on: named, since the map on screen may be another. */
  fromMap: Pick<CampaignMap, 'name'> | null;
  targetMap: CampaignMap;
  onConfirm: (selectedTokenIds: string[]) => void;
  onCancel: () => void;
  isSwitching: boolean;
}

export default function TokenTransferConfirmation({
  tokens,
  fromMap,
  targetMap,
  onConfirm,
  onCancel,
  isSwitching,
}: TokenTransferProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleToken = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(tokens.map((t) => t.id)));
  const selectNone = () => setSelected(new Set());

  return (
    <div className="mt-3 p-3 bg-warm-amber/10 border border-warm-amber/30 rounded-lg space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-stone-gray">
            {fromMap ? t('tokenTransfer.hasNamed', { name: fromMap.name, count: tokens.length }) : t('tokenTransfer.has', { count: tokens.length })}
          </p>
          <p className="text-xs text-stone-gray/70">
            {t('tokenTransfer.selectWhich')} <span className="font-medium">{targetMap.name}</span>
          </p>
        </div>
      </div>

      <div className="flex gap-2 text-xs">
        <button type="button" onClick={selectAll} className="touch-target text-brand-ink hover:underline">
          {t('tokenTransfer.selectAll')}
        </button>
        <span className="text-stone-gray/40 self-center">·</span>
        <button type="button" onClick={selectNone} className="touch-target text-stone-gray hover:underline">
          {t('tokenTransfer.selectNone')}
        </button>
      </div>

      <div className="space-y-1 max-h-36 overflow-y-auto">
        {tokens.map((token) => (
          <label
            key={token.id}
            className="flex items-center gap-2 p-1.5 pointer-coarse:min-h-11 rounded-sm hover:bg-warm-amber/10 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(token.id)}
              onChange={() => toggleToken(token.id)}
              className="rounded-sm accent-moss-green"
            />
            <span className="text-sm text-stone-gray truncate">{token.name}</span>
            {token.layer === 'spirit' && (
              <span className="text-xs text-spirit-ink bg-spirit-purple/10 px-1 rounded-sm">{t('tokenTransfer.spirit')}</span>
            )}
          </label>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          onClick={onCancel}
          disabled={isSwitching}
          variant="secondary" className="touch-target text-xs py-1 px-3"
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          onClick={() => onConfirm(Array.from(selected))}
          disabled={isSwitching}
          className="touch-target text-xs py-1 px-3 flex items-center gap-1.5"
        >
          {isSwitching ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('tokenTransfer.switching')}
            </>
          ) : (
            <>
              <ChevronRight className="w-3 h-3" />
              {t('tokenTransfer.switchMap')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
