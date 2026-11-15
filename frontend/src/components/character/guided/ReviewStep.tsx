// ============================================
// Step 11: review and create. The sheet buildSheet makes from the choices,
// shown read-only as the 5e sheet will show it; Create waits until no step
// owes a pick. A refused create leaves the wizard as it was, with the
// server's reason.
// ============================================

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, UserPlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import { FifthEditionCharacterView } from '@/components/character-sheets/fifth-edition/FifthEditionCharacterView';
import api from '@/services/api';
import { GameSystem, type Character } from '@/types';
import { apiErrorMessage, apiValidationIssues } from '@/utils/errors';
import { buildSheet } from '@/utils/guidedCreation/buildSheet';
import { stepsFor } from './steps';
import type { StepProps } from './stepRules';

export default function ReviewStep({ data, choices, campaign, roll, onCreated }: StepProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const check = { data, choices, campaign, roll: roll.roll, rollKnown: roll.known };
  const pending = stepsFor(check).filter((s) => s.id !== 'review' && !s.isComplete(check));
  const ready = pending.length === 0;
  const name = choices.details.name.trim();
  const sheet = useMemo(
    () => (ready ? buildSheet({ ...choices, details: { ...choices.details, name } }, data) : null),
    [ready, choices, name, data],
  );

  // Shown only: the view takes a character, so the sheet gets one in memory.
  const preview: Character | null = sheet && {
    id: 'guided-preview',
    userId: '',
    campaignId: campaign?.id ?? null,
    gameSystem: GameSystem.FIFTH_EDITION,
    name,
    data: sheet,
    tokenImageUrl: null,
    createdAt: '',
    updatedAt: '',
  };

  const create = async () => {
    if (!sheet || creating) return;
    setCreating(true);
    setError('');
    try {
      const { character } = await api.createCharacter({
        name,
        campaignId: campaign?.id,
        gameSystem: GameSystem.FIFTH_EDITION,
        data: sheet,
        // The server uses the roll up with the character.
        abilityRollId: choices.method === 'ROLL' ? choices.abilityRollId : undefined,
      });
      onCreated?.(character);
    } catch (err) {
      const issues = apiValidationIssues(err)?.map((i) => `• ${i.path}: ${i.message}`) ?? [];
      setError([apiErrorMessage(err) ?? t('guidedCreation.review.failed'), ...issues].join('\n'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {!ready && (
        <div className="rounded-cozy border border-warning/40 bg-warning/10 p-3 text-sm text-ink space-y-1">
          <p>{t('guidedCreation.review.pendingHint')}</p>
          <ul aria-label={t('guidedCreation.review.pending')} className="list-disc pl-5">
            {pending.map((s) => (
              <li key={s.id}>{t(`guidedCreation.steps.${s.id}`)}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="whitespace-pre-wrap rounded-cozy border border-spirit-red/30 bg-spirit-red/10 p-3 text-sm text-danger-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {preview && <p className="text-sm text-warm-gray mr-auto">{t('guidedCreation.review.preview')}</p>}
        <Button type="button" onClick={create} disabled={!ready || creating} icon={creating ? undefined : UserPlus} className="ml-auto">
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" aria-hidden="true" />
              {t('guidedCreation.review.creating')}
            </>
          ) : (
            t('guidedCreation.review.create')
          )}
        </Button>
      </div>

      {preview && <FifthEditionCharacterView character={preview} campaignDetailLevel={campaign?.detailLevel} />}
    </div>
  );
}
