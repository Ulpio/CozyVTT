// ============================================
// The banner over a map the GM is preparing
//
// While the GM has a map open to prepare on their own page (CampaignContext's
// viewedMap), this sits over the map and says which map is which: "Preparing
// Crypt. The table is on Village." Back to the table shows the table's map
// again; Bring everyone here moves the table to the map being prepared, as
// the Map Library's Set Active does, asking which tokens go along.
//
// Drawn once, in the page's map part, so both arrangements show it. On the
// compact layout the map's slot gives its buttons a finger's size; upright
// the names and the buttons take two rows, and on a phone on its side one,
// with short labels shown and the full ones as their names. There, too, the
// phone's Back while preparing goes back to the table, asking whatever holds
// the map first.
//
// It also says what it cannot show: which controls still reach the table
// (the campaign's own: the spirit layer, the atmosphere, the vibe and the
// session), and why preparing ended when it ended from elsewhere. A screen
// reader is told when preparing starts and ends, and the keyboard is put on
// the map when the banner it was on goes.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { Eye, Info } from 'lucide-react';
import { useCampaign, TableKeptMovingError, type PreparingEnded } from '@/contexts/CampaignContext';
import { useCompactLayout } from '@/contexts/LayoutContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useTableSwitch } from '@/hooks/useTableSwitch';
import { SIDEWAYS_QUERY } from '@/constants/layout';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { dialogOpened, nextOpening } from '@/components/campaign/compact/sheetHistory';
import { apiErrorMessage } from '@/utils/errors';
import TokenTransferConfirmation from './TokenTransferConfirmation';

/** Why preparing ended, as the GM is told. */
export function preparingEndedMessage(ended: PreparingEnded): string {
  return ended.reason === 'deleted'
    ? i18n.t('session.preparing.endedDeleted', { name: ended.mapName })
    : i18n.t('session.preparing.endedNotGm');
}

/**
 * Whether the banner holds the phone's Back: on the compact layout while a
 * map is being prepared, where Back goes back to the table, asking whatever
 * holds the map first. Elsewhere Paint holds Back itself, while it has paint
 * not saved; each reads this, so Back is never held twice or by no one.
 */
export function preparingHoldsBack(compact: boolean, isPreparing: boolean): boolean {
  return compact && isPreparing;
}

/** Put the keyboard on the map, which takes its keys. */
function focusTheMap() {
  document.querySelector<HTMLElement>('[role="application"][aria-label="Map"]')?.focus({ preventScroll: true });
}

export default function PreparingBanner() {
  const { isPreparing, viewedMap, currentMap, backToTable, preparingEnded, clearPreparingEnded } = useCampaign();
  const { t } = useTranslation();
  const compact = useCompactLayout();
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  const { showToast } = useToast();
  const tableSwitch = useTableSwitch();
  const [leaving, setLeaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const goBack = async () => {
    setLeaving(true);
    try {
      await backToTable();
    } catch (err: unknown) {
      showToast(
        err instanceof TableKeptMovingError ? err.message : apiErrorMessage(err) || i18n.t('session.preparing.loadFailed'),
        'error',
      );
    } finally {
      setLeaving(false);
    }
  };
  // For the phone's Back, whose entry is held for as long as preparing lasts.
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  useEffect(() => {
    if (!preparingHoldsBack(compact, isPreparing)) return;
    const entry = dialogOpened(() => { void goBackRef.current(); }, nextOpening());
    return () => entry.release();
  }, [compact, isPreparing]);

  // Preparing ended from elsewhere: the map deleted, or the GM seat gone.
  useEffect(() => {
    if (!preparingEnded) return;
    showToast(preparingEndedMessage(preparingEnded), 'info');
    clearPreparingEnded();
  }, [preparingEnded, clearPreparingEnded, showToast]);

  // What a screen reader is told, in a region that stays on the page so the
  // change is read: preparing starting, the table moving meanwhile, and the
  // page going back to the table.
  const viewedName = viewedMap?.name ?? '';
  const tableName = currentMap?.name ?? null;
  const tableWords = tableName ? i18n.t('session.preparing.tableOnName', { name: tableName }) : i18n.t('session.preparing.tableOnNone');
  const [announcement, setAnnouncement] = useState('');
  const wasPreparing = useRef(false);
  useEffect(() => {
    if (isPreparing) {
      setAnnouncement(i18n.t('session.preparing.announce', { name: viewedName, table: tableWords }));
    } else if (wasPreparing.current) {
      setAnnouncement(tableName ? i18n.t('session.preparing.backOnNamed', { name: tableName }) : i18n.t('session.preparing.backOn'));
      // The banner held the keyboard, and has gone: it goes to the map.
      const focused = document.activeElement;
      if (!focused || focused === document.body || !focused.isConnected) focusTheMap();
    }
    wasPreparing.current = isPreparing;
  }, [isPreparing, viewedName, tableName, tableWords]);

  // The banner has no room for a message of its own.
  const { error: switchError, clearError } = tableSwitch;
  useEffect(() => {
    if (!switchError) return;
    showToast(switchError, 'error');
    clearError();
  }, [switchError, clearError, showToast]);

  const live = <p role="status" className="sr-only">{announcement}</p>;
  if (!isPreparing || !viewedMap) return live;
  const short = compact && sideways;

  return (
    <>
    {live}
    <div
      role="region"
      aria-label={t('session.preparing.region')}
      className={`flex items-center gap-x-3 gap-y-1 px-3 py-1.5 bg-info/10 border-b border-info/30 text-info-ink ${short ? '' : 'flex-wrap'}`}
    >
      <p className={`flex items-center gap-1.5 text-xs min-w-0 ${short ? 'flex-1' : 'basis-full sm:basis-auto sm:flex-1'}`}>
        <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {t('session.preparing.editing')} <strong className="font-semibold">{viewedMap.name}</strong>.{' '}
          {currentMap
            ? <>{t('session.preparing.tableOn')} <strong className="font-semibold">{currentMap.name}</strong>.</>
            : t('session.preparing.tableOnNone')}
        </span>
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => { void goBack(); }}
          loading={leaving}
          aria-label={t('session.preparing.back')}
          title={t('session.preparing.backHint')}
        >
          {short ? t('session.preparing.backShort') : t('session.preparing.back')}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => { void tableSwitch.requestSwitch(viewedMap); }}
          loading={tableSwitch.switching && !tableSwitch.pending}
          aria-label={t('session.preparing.bring')}
          title={t('session.preparing.bringHint')}
        >
          {short ? t('session.preparing.bringShort') : t('session.preparing.bring')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly={short}
          icon={Info}
          onClick={() => setHelpOpen((open) => !open)}
          aria-expanded={helpOpen}
          aria-controls={helpOpen ? 'preparing-what-reaches-the-table' : undefined}
          aria-label={t('session.preparing.help')}
        >
          {short ? null : t('session.preparing.help')}
        </Button>
      </div>
      {helpOpen && (
        <p id="preparing-what-reaches-the-table" className="basis-full text-xs">
          {t('session.preparing.helpText')}
        </p>
      )}

      <Modal
        open={tableSwitch.pending !== null}
        onClose={tableSwitch.cancel}
        title={t('session.preparing.bring')}
        size="sm"
        closeDisabled={tableSwitch.switching}
      >
        {tableSwitch.pending && (
          <TokenTransferConfirmation
            tokens={tableSwitch.tableTokens}
            fromMap={currentMap}
            targetMap={tableSwitch.pending}
            onConfirm={(ids) => { void tableSwitch.confirm(ids); }}
            onCancel={tableSwitch.cancel}
            isSwitching={tableSwitch.switching}
          />
        )}
      </Modal>
    </div>
    </>
  );
}
