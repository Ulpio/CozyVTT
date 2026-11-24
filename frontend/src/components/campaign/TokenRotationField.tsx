/**
 * TokenRotationField
 * Which way a token faces, in Edit Token: whole degrees clockwise from the top
 * of its picture. The map's token menu turns it in steps; this box sets an
 * exact value. It saves on blur or Enter, so typing "135" is one save.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { facing } from '@/utils/tokenRotation';

interface TokenRotationFieldProps {
  /** The token's stored rotation. */
  value: number | undefined;
  /** The new facing, from 0 to 359, when it differs from `value`. */
  onCommit: (degrees: number) => void;
}

export default function TokenRotationField({ value, onCommit }: TokenRotationFieldProps) {
  const { t } = useTranslation();
  const shown = facing(value);
  const [draft, setDraft] = useState(String(shown));
  useEffect(() => { setDraft(String(shown)); }, [shown]);

  const commit = () => {
    const typed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(typed)) { setDraft(String(shown)); return; }
    const degrees = facing(typed);
    setDraft(String(degrees));
    if (degrees !== shown) onCommit(degrees);
  };

  return (
    <div>
      <label className="text-xs text-stone-gray font-medium block mb-1">
        {t('tokenFacing.label')} <span className="font-normal opacity-60">{t('tokenFacing.unit')}</span>
      </label>
      <input
        type="number"
        step={15}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        aria-label={t('tokenFacing.ariaLabel')}
        className="input-cozy input-cozy-number w-full text-sm"
      />
      <p className="text-[10px] text-stone-gray/60 mt-1">
        {t('tokenFacing.hint')}
      </p>
    </div>
  );
}
