/**
 * End Session Modal
 * Session State Management
 *
 * Confirmation modal for ending a session.
 * Allows GM to choose whether to save game state and add session notes.
 * Shows session summary (duration, session number).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Square, Save, Clock, Hash } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

/** How long ago, in milliseconds, the session started. */
function timeSince(startedAt: string): number {
  return Date.now() - new Date(startedAt).getTime();
}

// ============================================
// Props
// ============================================

interface EndSessionModalProps {
  session: {
    id: string;
    sessionNumber: number;
    startedAt: string;
  };
  onConfirm: (saveState: boolean, notes: string) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

// ============================================
// Component
// ============================================

export default function EndSessionModal({
  session,
  onConfirm,
  onClose,
  isSubmitting,
}: EndSessionModalProps) {
  const [saveState, setSaveState] = useState(true);
  const [notes, setNotes] = useState('');
  const { t } = useTranslation();

  // Whole minutes, as "1 hour 0 minutes"; nothing below zero.
  const totalMinutes = Math.floor(Math.max(0, timeSince(session.startedAt)) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutesText = t('endSession.minutes', { count: totalMinutes % 60 });
  const duration = hours === 0 ? minutesText : `${t('endSession.hours', { count: hours })} ${minutesText}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(saveState, notes);
  };

  return (
    <Modal open onClose={onClose} title={t('endSession.title')} icon={Square} size="sm" closeDisabled={isSubmitting}>
      <div className="space-y-5">
        <p className="text-xs text-ink-muted -mt-4">{t('endSession.subtitle')}</p>

        {/* Session Summary */}
        <div className="rounded-lg bg-parchment border border-moss-green/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-stone-gray uppercase tracking-wide">{t('endSession.summary')}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-accent-ink shrink-0" />
              <div>
                <p className="text-xs text-warm-gray">{t('endSession.session')}</p>
                <p className="text-sm font-semibold text-stone-gray">#{session.sessionNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-accent-ink shrink-0" />
              <div>
                <p className="text-xs text-warm-gray">{t('endSession.duration')}</p>
                <p className="text-sm font-semibold text-stone-gray">{duration}</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Save State Toggle */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="mt-0.5">
              <input
                type="checkbox"
                checked={saveState}
                onChange={(e) => setSaveState(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded-sm border-moss-green/30 text-brand-ink focus:ring-moss-green/50 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Save className="w-3.5 h-3.5 text-brand-ink" />
                <span className="text-sm font-medium text-stone-gray">{t('endSession.saveState')}</span>
              </div>
              <p className="text-xs text-warm-gray mt-0.5">
                {t('endSession.saveStateHint')}
              </p>
            </div>
          </label>

          {/* Session Notes */}
          <div>
            <label className="block text-xs font-medium text-stone-gray mb-1.5">
              {t('endSession.notes')}
              <span className="ml-1 font-normal text-warm-gray">{t('endSession.optional')}</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              rows={3}
              maxLength={2000}
              placeholder={t('endSession.placeholder')}
              className="input-cozy w-full resize-none text-sm"
            />
            <p className="text-xs text-warm-gray mt-1 text-right">{notes.length}/2000</p>
            <p className="text-xs text-warm-gray/70 mt-1">
              {t('endSession.shownBefore')}
              <span className="font-medium"> {t('session.tabs.session')} → {t('sessionHistory.title')}</span>{t('endSession.shownAfter')}
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              variant="secondary"
            >
              {t('endSession.cancel')}
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={isSubmitting}
              icon={Square}
              className="text-sm"
            >
              {isSubmitting ? t('endSession.ending') : t('endSession.title')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
