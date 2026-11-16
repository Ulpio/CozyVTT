// ============================================
// Desktop Table: the campaign page's desktop arrangement
// A slim header, the paused banner, and the map with two folding columns:
// Left:   the party (campaign info, the roster and, for the GM, the tokens),
//         folded away until asked for, so the map has the room
// Center: the map
// Right:  the session rail (chat, dice, initiative, notes, session)
//
// The map, the session panels and the Party content are the page's,
// drawn once and moved into this arrangement's slots (tableHosts.tsx), so
// they outlive it. What is here is the arrangement's own: the header's
// buttons, the columns' sizes and whether a side column is folded away.
// The windows the header opens are the page's too, so its buttons only
// ask the page to open them.
// ============================================

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLeavePage } from '@/hooks/useLeaveGuard';
import { ArrowLeft, Sun, PauseCircle, PanelRightClose, PanelRightOpen, Settings, BookOpen, Keyboard, Users, Eye } from 'lucide-react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
  type PanelImperativeHandle,
} from 'react-resizable-panels';
import { useCampaign } from '@/contexts/CampaignContext';
import SessionSidebar from '@/components/campaign/SessionSidebar';
import ActionBar from '@/components/campaign/actionBar/ActionBar';
import GmToolMenus from '@/components/campaign/GmToolMenus';
import type { SessionToolKey } from '@/components/campaign/SessionToolbar';
import { useTableSlot } from '@/components/campaign/tableHosts';
import ConnectionStatus from '@/components/ConnectionStatus';
import GameSystemBadge from '@/components/common/GameSystemBadge';
import { SessionPausedBanner } from '@/components/campaign/sessionStatus';
import { CampaignStatus } from '@/types';
import type { Campaign } from '@/types';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { optionalStorage } from '@/utils/optionalStorage';
import { cn } from '@/utils/cn';

interface DesktopTableProps {
  campaign: Campaign;
  /** Whether the viewer owns the campaign, which may differ from running it. */
  isOwner: boolean;
  /** Which of the GM's slide-overs are open, which the toolbar shows pressed. */
  openTools: Record<SessionToolKey, boolean>;
  /** Open one of the GM's slide-overs; `settings` is also an owner's way to the settings. */
  onOpenTool: (key: SessionToolKey) => void;
  onOpenDocuments: () => void;
  onOpenShortcuts: () => void;
}

/** The party column's share when it opens with no size of its own to go back to. */
const PARTY_OPEN_SIZE = '22%';
const RAIL_OPEN_SIZE = '25%';

export default function DesktopTable({
  campaign,
  isOwner,
  openTools,
  onOpenTool,
  onOpenDocuments,
  onOpenShortcuts,
}: DesktopTableProps) {
  const { t } = useTranslation();
  const leavePage = useLeavePage();
  const { userRole, currentMap } = useCampaign();
  const mapSlot = useTableSlot('map');
  const partySlot = useTableSlot('party');

  // Resizable panel layout — persisted to localStorage so each user's
  // column sizes survive reloads. A new id from the layout that opened the
  // party column by default, so a saved layout of that one does not keep it
  // open.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'cozyvtt-session-layout-v2',
    storage: optionalStorage,
  });
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const togglePanel = (
    panelRef: React.RefObject<PanelImperativeHandle | null>,
    fallbackSize: string
  ) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      // A panel that starts folded, or comes back folded from a saved
      // layout, has no previous size to expand back to — fall back to its
      // default share.
      if (panel.getSize().asPercentage === 0) {
        panel.resize(fallbackSize);
      }
    } else {
      panel.collapse();
    }
  };

  const partyLabel = leftCollapsed ? t('session.party.show') : t('session.party.hide');
  const railLabel = rightCollapsed ? t('session.rail.show') : t('session.rail.hide');

  return (
    <>
      {/* Header Bar — one slim row; wraps onto a second in a narrow window
          instead of running off its edge. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 bg-moss-green/10 border-b border-moss-green/20 shadow-xs">
        <div className="flex min-w-0 items-center gap-2">
          <Tooltip content={t('session.backLabel')} side="bottom">
            <Button
              // Asking first about work the page holds, such as Paint not saved.
              onClick={() => leavePage('/dashboard')}
              variant="ghost"
              size="sm"
              className="flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span className="max-md:sr-only">{t('session.back')}</span>
            </Button>
          </Tooltip>

          <h1 className="min-w-0 break-words text-lg font-bold text-brand-ink font-heading">
            {campaign.name}
          </h1>
          <GameSystemBadge gameSystem={campaign.gameSystem} size="sm" />

          {/* Session status (visible to all) */}
          {campaign.status === CampaignStatus.ACTIVE && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success/10 border border-success/20">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success-ink hidden sm:inline">{t('session.status.ACTIVE')}</span>
            </div>
          )}
          {campaign.status === CampaignStatus.PAUSED && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
              <PauseCircle className="w-3.5 h-3.5 text-accent-ink" />
              <span className="text-xs font-medium text-accent-ink hidden sm:inline">{t('session.status.PAUSED')}</span>
            </div>
          )}
          {campaign.status === CampaignStatus.INACTIVE && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-gray/10 border border-stone-gray/20">
              <div className="w-2 h-2 rounded-full bg-stone-gray/50" />
              <span className="text-xs font-medium text-stone-gray hidden sm:inline">{t('session.status.INACTIVE')}</span>
            </div>
          )}

          {/* Vibe indicator (visible to all) */}
          {campaign?.currentVibe && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
              <Sun className="w-3.5 h-3.5 text-accent-ink" />
              <span className="text-xs font-medium text-accent-ink capitalize hidden sm:inline">
                {campaign.currentVibe}
              </span>
            </div>
          )}
          <ConnectionStatus />
        </div>

        {/* What the players are looking at, always in view for the GM: the
            map the table is on. While the GM prepares another map, the banner
            over the map says which one they are editing. */}
        <div className="flex flex-1 justify-center min-w-0">
          {userRole === 'GM' && (
            <p className="flex items-center gap-2 min-w-0 px-3 py-1.5 rounded-lg bg-surface-light/60 border border-moss-green/20 text-sm">
              <Eye className="w-4 h-4 shrink-0 text-brand-ink" aria-hidden="true" />
              <span className="text-warm-gray whitespace-nowrap">{t('session.playersSee')}</span>
              <strong className="font-semibold text-ink truncate">{currentMap?.name ?? t('session.noMap')}</strong>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {userRole === 'GM' ? (
            <GmToolMenus
              openPanels={openTools}
              onOpen={onOpenTool}
              onOpenDocuments={onOpenDocuments}
              onOpenShortcuts={onOpenShortcuts}
              spiritLayerEnabled={campaign?.spiritLayerEnabled}
            />
          ) : (
            <>
              {/* An owner who has handed the game over keeps two powers —
                  deleting the campaign and taking the seat back — and this is
                  their way to them. */}
              {isOwner && (
                <Tooltip content={t('session.ownerSettingsHint')} side="bottom">
                  <Button
                    variant="ghost"
                    iconOnly
                    icon={Settings}
                    aria-label={t('session.ownerSettings')}
                    onClick={() => onOpenTool('settings')}
                  />
                </Tooltip>
              )}
              {/* Documents shared with the campaign: a rulebook the table is
                  meant to read has to be reachable by the people reading it. */}
              <Tooltip content={t('session.documents')} side="bottom">
                <Button
                  variant="ghost"
                  iconOnly
                  icon={BookOpen}
                  aria-label={t('session.documents')}
                  onClick={onOpenDocuments}
                />
              </Tooltip>
              <Tooltip content={t('session.shortcuts')} side="bottom">
                <Button
                  variant="ghost"
                  iconOnly
                  icon={Keyboard}
                  aria-label={t('session.shortcuts')}
                  onClick={onOpenShortcuts}
                />
              </Tooltip>
            </>
          )}

          {/* Column toggles (all roles) */}
          <div className="h-6 w-px bg-moss-green/20" aria-hidden="true" />
          <Tooltip content={partyLabel} side="bottom">
            <Button
              variant="ghost"
              size="sm"
              aria-label={partyLabel}
              aria-pressed={!leftCollapsed}
              onClick={() => togglePanel(leftPanelRef, PARTY_OPEN_SIZE)}
              className={cn('flex items-center gap-1.5', !leftCollapsed && 'bg-accent/15! text-accent-ink!')}
            >
              <Users className="w-4 h-4" aria-hidden="true" />
              <span className="max-lg:sr-only" aria-hidden="true">{t('session.party.button')}</span>
            </Button>
          </Tooltip>
          <Tooltip content={railLabel} side="bottom">
            <Button
              variant="ghost"
              iconOnly
              icon={rightCollapsed ? PanelRightOpen : PanelRightClose}
              aria-label={railLabel}
              onClick={() => togglePanel(rightPanelRef, RAIL_OPEN_SIZE)}
            />
          </Tooltip>
        </div>
      </header>

      {/* Session Paused Banner — visible to players when session is paused */}
      {campaign.status === CampaignStatus.PAUSED && userRole !== 'GM' && <SessionPausedBanner />}

      {/* Main Content - Resizable Panels. Relative, so it clips what is
          absolutely placed inside it too, such as the hidden names of the
          rail's icon tabs, which otherwise widened a narrow page. */}
      <main className="relative flex-1 min-h-0 overflow-hidden">
        {/* The dividers are 6 pixels wide; the library takes a drag over a
            wider strip than it draws. 44 pixels where the primary pointer
            is coarse is the size a finger needs; a mouse keeps its 10. It
            takes a press in the strip on anything inside the group, whatever
            is drawn over the divider, so the menus and pickers opened in
            these columns are drawn on the body (components/ui/FloatingLayer.tsx),
            where being in front keeps their presses. A z-index on <main> or
            the page's root at or above theirs would undo that. */}
        <Group
          orientation="horizontal"
          className="h-full w-full"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          resizeTargetMinimumSize={{ coarse: 44, fine: 10 }}
        >
          {/* Left Panel — party & campaign info, folded until asked for */}
          <Panel
            id="party"
            defaultSize={0}
            minSize="260px"
            collapsible
            panelRef={leftPanelRef}
            onResize={(size) => setLeftCollapsed(size.asPercentage === 0)}
            className="h-full"
          >
            {/* The Party content (campaign info, the roster and, for the GM,
                the Token Roster) is the page's, moved in here (tableHosts.tsx). */}
            <aside ref={partySlot.ref} className="h-full overflow-y-auto p-4 bg-parchment/30 border-r border-moss-green/20" />
          </Panel>

          <Separator className="w-1.5 bg-moss-green/10 transition-colors data-[separator=hover]:bg-brand/30 data-[separator=active]:bg-brand/50" />

          {/* Center Panel — map canvas, with the room the party leaves */}
          <Panel id="map" defaultSize={75} minSize={35} className="h-full">
            {/* The map is the page's, moved in here (tableHosts.tsx). */}
            <section ref={mapSlot.ref} className="h-full min-w-0 p-2" />
          </Panel>

          <Separator className="w-1.5 bg-moss-green/10 transition-colors data-[separator=hover]:bg-brand/30 data-[separator=active]:bg-brand/50" />

          {/* Right Panel — tabbed session rail (Chat / Dice / Initiative / Notes / Session) */}
          <Panel
            id="rail"
            defaultSize={25}
            minSize="300px"
            collapsible
            panelRef={rightPanelRef}
            onResize={(size) => setRightCollapsed(size.asPercentage === 0)}
            className="h-full"
          >
            <SessionSidebar />
          </Panel>
        </Group>
      </main>

      {/* The action bar: the player's own character, or the GM's selected token. */}
      <ActionBar />
    </>
  );
}
