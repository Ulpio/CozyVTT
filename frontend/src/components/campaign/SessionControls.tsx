/**
 * Session Controls
 * Session State Management
 *
 * GM-only panel for starting, pausing, ending, and resuming sessions.
 * Shows session timer and session number.
 * Players see a read-only session status indicator instead.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Square, RotateCcw, Clock, Hash } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import Toast, { useToast } from '@/components/Toast';
import api from '@/services/api';
import { CampaignStatus } from '@/types';
import EndSessionModal from '@/components/campaign/EndSessionModal';
import Button from '@/components/ui/Button';
import { apiErrorMessage } from '@/utils/errors';

// ============================================
// Session timer hook
// ============================================

function useSessionTimer(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt) {
      setElapsed('');
      return;
    }

    const update = () => {
      const start = new Date(startedAt).getTime();
      const now = Date.now();
      const diffMs = Math.max(0, now - start);
      const totalSec = Math.floor(diffMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      setElapsed(
        h > 0
          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${m}:${String(s).padStart(2, '0')}`,
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}

// ============================================
// Main Component
// ============================================

export default function SessionControls() {
  const { t } = useTranslation();
  const { campaign, userRole, activeSession, setActiveSession, updateCampaignStatus } = useCampaign();
  const { toast, showToast, hideToast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);

  const status = campaign?.status ?? CampaignStatus.PREPARATION;
  // The buttons follow the open session, running or paused, and the status
  // says which: a campaign an older version left marked PAUSED or ACTIVE
  // with its session already ended still offers Start.
  const isPaused = !!activeSession && status === CampaignStatus.PAUSED;
  const isRunning = !!activeSession && !isPaused;
  const elapsed = useSessionTimer(isRunning ? activeSession.startedAt : null);

  // ============================================
  // Session Actions
  // ============================================

  const handleStart = useCallback(async () => {
    if (!campaign || isLoading) return;
    setIsLoading(true);
    try {
      const result = await api.startSession(campaign.id);
      // REST broadcast handles WebSocket; also update local state immediately for GM
      updateCampaignStatus(CampaignStatus.ACTIVE);
      setActiveSession({
        id: result.session.id,
        sessionNumber: result.session.sessionNumber,
        startedAt: result.session.startedAt,
      });
      showToast(t('sessionControls.started', { number: result.session.sessionNumber }), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) || t('sessionControls.startFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, isLoading, updateCampaignStatus, setActiveSession, showToast, t]);

  const handlePause = useCallback(async () => {
    if (!campaign || !activeSession || isLoading) return;
    setIsLoading(true);
    try {
      await api.pauseSession(campaign.id, activeSession.id);
      updateCampaignStatus(CampaignStatus.PAUSED);
      showToast(t('sessionControls.paused'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) || t('sessionControls.pauseFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, activeSession, isLoading, updateCampaignStatus, showToast, t]);

  const handleResume = useCallback(async () => {
    if (!campaign || isLoading) return;
    setIsLoading(true);
    try {
      const result = await api.resumeSession(campaign.id);
      updateCampaignStatus(CampaignStatus.ACTIVE);
      // The timer counts from the session's start, as it does for everyone
      // else and after a reload.
      setActiveSession({
        id: result.session.id,
        sessionNumber: result.session.sessionNumber,
        startedAt: result.session.startedAt,
      });
      showToast(t('sessionControls.resumed', { number: result.session.sessionNumber }), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) || t('sessionControls.resumeFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, isLoading, updateCampaignStatus, setActiveSession, showToast, t]);

  // End session goes through the modal
  const handleEndConfirm = useCallback(async (saveState: boolean, notes: string) => {
    if (!campaign || !activeSession || isLoading) return;
    setIsLoading(true);
    try {
      await api.endSession(campaign.id, activeSession.id, saveState, notes || undefined);
      updateCampaignStatus(CampaignStatus.INACTIVE);
      setActiveSession(null);
      setIsEndModalOpen(false);
      showToast(t(saveState ? 'sessionControls.endedSaved' : 'sessionControls.ended', { number: activeSession.sessionNumber }), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) || t('sessionControls.endFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, activeSession, isLoading, updateCampaignStatus, setActiveSession, showToast, t]);

  // ============================================
  // Render
  // ============================================

  if (userRole !== 'GM') return null;

  const isInactive = !activeSession && status === CampaignStatus.INACTIVE;
  const isPrep = status === CampaignStatus.PREPARATION;

  return (
    <>
      <div className="glass-panel p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-ink" />
            <h3 className="text-sm font-semibold text-brand-ink">{t('sessionControls.title')}</h3>
          </div>

          {/* Session number + timer */}
          {activeSession && (
            <div className="flex items-center gap-2 text-xs text-stone-gray">
              <Hash className="w-3 h-3" />
              <span className="font-medium">{activeSession.sessionNumber}</span>
              {isRunning && elapsed && (
                <>
                  <span className="text-brand-ink/30">·</span>
                  <span className="font-mono text-brand-ink">{elapsed}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-parchment/60 border border-moss-green/15">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              isRunning
                ? 'bg-success animate-pulse'
                : isPaused
                  ? 'bg-warm-amber'
                  : 'bg-stone-gray/40'
            }`}
          />
          <span className="text-sm font-medium text-stone-gray capitalize">
            {t(isRunning ? 'campaignCard.status.ACTIVE' : isPaused ? 'campaignCard.status.PAUSED' : isPrep ? 'campaignCard.status.PREPARATION' : 'campaignCard.status.INACTIVE')}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Start Session: no session open */}
          {!activeSession && (
            <Button
              onClick={handleStart}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {isLoading ? t('sessionControls.starting') : t('sessionControls.start')}
            </Button>
          )}

          {/* Resume Session: a paused session, the map as the GM left it */}
          {isPaused && (
            <Button
              onClick={handleResume}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {isLoading ? t('sessionControls.resuming') : t('sessionControls.resume')}
            </Button>
          )}

          {/* Pause Session: a running session */}
          {isRunning && (
            <Button
              onClick={handlePause}
              disabled={isLoading}
              variant="secondary" className="w-full flex items-center justify-center gap-2"
            >
              <Pause className="w-4 h-4" />
              {isLoading ? t('sessionControls.pausing') : t('sessionControls.pause')}
            </Button>
          )}

          {/* End Session: running or paused */}
          {activeSession && (
            <button
              onClick={() => setIsEndModalOpen(true)}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-danger/30 text-danger-ink hover:bg-danger/10 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square className="w-4 h-4" />
              {t('sessionControls.end')}
            </button>
          )}
        </div>

        {/* Paused hint */}
        {isPaused && (
          <p className="text-xs text-warm-gray text-center italic">
            {t('sessionControls.pausedHint')}
          </p>
        )}

        {/* Inactive hint */}
        {isInactive && (
          <p className="text-xs text-warm-gray text-center italic">
            {t('sessionControls.endedHint')}
          </p>
        )}
      </div>

      {/* End Session Modal */}
      {isEndModalOpen && activeSession && (
        <EndSessionModal
          session={activeSession}
          onConfirm={handleEndConfirm}
          onClose={() => setIsEndModalOpen(false)}
          isSubmitting={isLoading}
        />
      )}

      <Toast message={toast.message} type={toast.type} show={toast.show} onClose={hideToast} />
    </>
  );
}
