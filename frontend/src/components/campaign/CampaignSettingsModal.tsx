// ============================================
// CampaignSettingsModal
// GM-only slide-over panel for campaign settings
// General info, member management, danger zone
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Settings,
  Save,
  Loader2,
  Users,
  Trash2,
  UserMinus,
  UserPlus,
  AlertTriangle,
  ShieldCheck,
  Crown,
  MessageCircle,
  Download,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import campaignService from '@/services/campaign.service';
import InvitePlayerModal from './InvitePlayerModal';
import CampaignBooksPicker from './CampaignBooksPicker';
import CampaignCreationSettings from './CampaignCreationSettings';
import { Trans, useTranslation } from 'react-i18next';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { CampaignRole, GameSystem } from '@/types';
import type { AbilityScoreMethod, AccessRevoked, AssignableCampaignRole, CampaignDetailLevel, CampaignBookChoice, CampaignMembership, CampaignInvitationSummary } from '@/types';
import Button from '@/components/ui/Button';
import SlideOver, { SlideOverClose, SlideOverTitle } from '@/components/ui/SlideOver';
import { apiErrorMessage } from '@/utils/errors';
import { isCampaignOwner } from '@/utils/campaignRoles';
import { CAMPAIGN_LIMITS } from '@/constants/campaignLimits';

interface CampaignSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Told once the campaign is deleted, with the notice every tab of the
   * campaign is sent too (useAccessRevoked says it once, whichever comes
   * first, and goes to the dashboard).
   */
  onDeleted: (revoked: AccessRevoked) => void;
}

// ============================================
// Tab type
// ============================================

type SettingsTab = 'general' | 'chat' | 'members' | 'danger';

/** What the Role picker beside a member offers, in its order. */
const ROLE_CHOICES = [CampaignRole.PLAYER, CampaignRole.SPECTATOR] as const satisfies readonly AssignableCampaignRole[];

/** The picker's value as a role it offers. */
const roleChoice = (value: string): AssignableCampaignRole | undefined => ROLE_CHOICES.find((role) => role === value);

/** A switch's press, a finger's height around its 24 px pill on a touch screen. */
const SWITCH_PRESS = "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:content-['']";

export default function CampaignSettingsModal({
  isOpen,
  onClose,
  onDeleted,
}: CampaignSettingsModalProps) {
  const { campaign, refreshCampaign, userRole } = useCampaign();

  /**
   * The panel is open to the GM and to the campaign's owner, who are not always
   * the same person once the game has been handed over.
   *
   * An owner who is no longer the GM keeps exactly two powers, and the server
   * agrees with this list: they can delete the campaign, and they can take the
   * GM seat back. Everything else here — renaming, chat settings, exporting,
   * inviting, removing members — is gated on being the GM, so offering it would
   * only produce refusals.
   */
  const isGmViewer = userRole === 'GM';
  const { showToast } = useToast();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  /** A role by the name this language gives it. */
  const roleLabel = (role: CampaignRole) => t(`roles.${role}`);
  const mayDelete = isCampaignOwner(campaign, user?.id) || user?.platformRole === 'ADMIN';

  // ── Tab ─────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // ── General settings form ────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [savingGeneral, setSavingGeneral] = useState(false);

  // ── Players may draw ─────────────────────────
  // What the switch shows while its save is on its way; the campaign's own
  // value otherwise, which the settings broadcast keeps current.
  const [playersMayDrawShown, setPlayersMayDrawShown] = useState<boolean | null>(null);

  // ── Books ────────────────────────────────────
  // The campaign's system's books, loaded when the panel opens; saved at once.
  const [books, setBooks] = useState<CampaignBookChoice[] | null>(null);
  const [savingBooks, setSavingBooks] = useState(false);

  // ── Character creation ───────────────────────
  // What the creation settings show while their save is on its way; the
  // campaign's own values otherwise. A refusal drops it, which puts them back.
  const [creationShown, setCreationShown] = useState<{ abilityScoreMethods: AbilityScoreMethod[]; detailLevel: CampaignDetailLevel } | null>(null);

  // ── Chat settings ────────────────────────────
  const [chatCooldownEnabled, setChatCooldownEnabled] = useState(false);
  const [chatCooldownSeconds, setChatCooldownSeconds] = useState(5);
  const [savingChat, setSavingChat] = useState(false);

  // ── Members ──────────────────────────────────
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<CampaignMembership | null>(null);
  // The member just removed and where their row stood, so the focus can stay
  // in the list once the removal has finished.
  const removedMember = useRef<{ userId: string; index: number } | null>(null);
  const memberListRef = useRef<HTMLDivElement>(null);
  const inviteButtonRef = useRef<HTMLButtonElement>(null);
  // What Remove's question calls the member asked about.
  const removingRole = memberToRemove ? roleLabel(memberToRemove.role) : roleLabel(CampaignRole.PLAYER);
  const [memberToPromote, setMemberToPromote] = useState<CampaignMembership | null>(null);
  const [promotingMemberId, setPromotingMemberId] = useState<string | null>(null);
  // The role each Role picker shows while its change is on its way, by member;
  // the membership's own role otherwise.
  const [pendingRoles, setPendingRoles] = useState<Record<string, AssignableCampaignRole>>({});
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  // The invitations that still stand, for the GM to see and withdraw.
  const [invitations, setInvitations] = useState<CampaignInvitationSummary[]>([]);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  // ── Export ────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportIncludeAudio, setExportIncludeAudio] = useState(false);

  // ── Danger zone ──────────────────────────────
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Seed the form when the dialog opens, or for another campaign. Not on
  // every campaign object: the page fetches the same campaign again when
  // someone joins or leaves and after a reconnect, and re-seeding then threw
  // away what the GM was typing and jumped back to the first tab.
  useEffect(() => {
    if (isOpen && campaign) {
      setName(campaign.name);
      setDescription(campaign.description ?? '');
      setChatCooldownEnabled(campaign.chatCooldownEnabled);
      setChatCooldownSeconds(campaign.chatCooldownSeconds);
      setDeleteConfirmName('');
      setActiveTab(isGmViewer ? 'general' : 'members');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- seeds the form on opening and for another campaign; a refetch of the same one must keep what the GM typed
  }, [isOpen, campaign?.id]);

  const loadInvitations = useCallback(async () => {
    if (!campaign?.id) return;
    try {
      setInvitations((await api.listCampaignInvitations(campaign.id)).invitations);
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.invitationsLoadFailed'), 'error');
    }
  }, [campaign?.id, showToast, t]);

  useEffect(() => {
    if (isOpen && isGmViewer && activeTab === 'members') void loadInvitations();
  }, [isOpen, isGmViewer, activeTab, loadInvitations]);

  // The books, read again each time the panel opens and when the system changes.
  useEffect(() => {
    if (!isOpen || !campaign?.id) return;
    let live = true;
    // Never another campaign's list while this one's is on its way, or if it fails.
    setBooks(null);
    api.getCampaignBooks(campaign.id).then(
      (list) => live && setBooks(list),
      (err) => live && showToast(apiErrorMessage(err) ?? t('campaignBooks.loadFailed'), 'error')
    );
    return () => {
      live = false;
    };
  }, [isOpen, campaign?.id, campaign?.gameSystem, showToast, t]);

  const handleBooks = async (bookIds: string[]) => {
    if (!campaign?.id || !books) return;
    const before = books;
    setBooks(books.map((b) => ({ ...b, enabled: bookIds.includes(b.id) })));
    setSavingBooks(true);
    try {
      setBooks(await api.setCampaignBooks(campaign.id, bookIds));
    } catch (err) {
      setBooks(before);
      showToast(apiErrorMessage(err) ?? t('campaignBooks.saveFailed'), 'error');
    } finally {
      setSavingBooks(false);
    }
  };

  /** Creation settings: saved as soon as they change; shown as the campaign has them again if the save fails. */
  const handleCreation = async (patch: Partial<{ abilityScoreMethods: AbilityScoreMethod[]; detailLevel: CampaignDetailLevel }>) => {
    if (!campaign?.id) return;
    const next = {
      abilityScoreMethods: creationShown?.abilityScoreMethods ?? campaign.abilityScoreMethods,
      detailLevel: creationShown?.detailLevel ?? campaign.detailLevel,
      ...patch,
    };
    setCreationShown(next);
    try {
      await campaignService.updateCampaign(campaign.id, patch);
      await refreshCampaign();
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignCreation.saveFailed'), 'error');
    } finally {
      setCreationShown(null);
    }
  };

  // Remove is disabled while the member is removed, so the confirmation
  // cannot hand the focus back to it. Once the removal has finished the focus
  // goes to Remove again if the row is still there, or else to the first
  // control of the next row that has one, the one before when there is none
  // after, or Invite Player.
  useEffect(() => {
    const removed = removedMember.current;
    const list = memberListRef.current;
    if (removingMemberId !== null || !removed || !list) return;
    removedMember.current = null;
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-member-row]'));
    const firstControl = (row: HTMLElement) =>
      row.querySelector<HTMLElement>('select:not([disabled]), button:not([disabled])');
    const stayed = rows.find((row) => row.dataset.memberRow === removed.userId);
    if (stayed) {
      (stayed.querySelector<HTMLElement>('[data-remove-member]') ?? firstControl(stayed))?.focus();
      return;
    }
    const after = rows.slice(Math.max(removed.index, 0));
    const before = rows.slice(0, Math.max(removed.index, 0)).reverse();
    for (const row of [...after, ...before]) {
      const control = firstControl(row);
      if (control) {
        control.focus();
        return;
      }
    }
    inviteButtonRef.current?.focus();
  }, [removingMemberId]);

  if (!campaign) return null;

  const memberships: CampaignMembership[] = campaign.memberships ?? [];

  const handleWithdrawInvitation = async (invitation: CampaignInvitationSummary) => {
    setWithdrawingId(invitation.id);
    try {
      await api.withdrawCampaignInvitation(campaign.id, invitation.id);
      setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
      showToast(t('campaignSettings.withdrew', { name: invitation.user.displayName }), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.withdrawFailed'), 'error');
    } finally {
      setWithdrawingId(null);
    }
  };

  // ── Handlers ─────────────────────────────────

  const handleSaveGeneral = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast(t('campaignSettings.nameEmpty'), 'error');
      return;
    }
    setSavingGeneral(true);
    try {
      await campaignService.updateCampaign(campaign.id, {
        name: trimmedName,
        // An emptied box clears the description; leaving it out kept the old one.
        description: description.trim() || null,
      });
      await refreshCampaign();
      showToast(t('campaignSettings.saved'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.saveFailed'), 'error');
    } finally {
      setSavingGeneral(false);
    }
  };

  /** Players may draw: saved as soon as it is switched, so it reaches a table in play at once. */
  const handlePlayersMayDraw = async (next: boolean) => {
    setPlayersMayDrawShown(next);
    try {
      await campaignService.updateCampaign(campaign.id, { playersMayDraw: next });
      await refreshCampaign();
      showToast(next ? t('campaignSettings.drawOn') : t('campaignSettings.drawOff'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.drawFailed'), 'error');
    } finally {
      setPlayersMayDrawShown(null);
    }
  };

  const handleSaveChat = async () => {
    setSavingChat(true);
    try {
      await campaignService.updateCampaign(campaign.id, {
        chatCooldownEnabled,
        chatCooldownSeconds,
      });
      await refreshCampaign();
      showToast(t('campaignSettings.chatSaved'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.chatSaveFailed'), 'error');
    } finally {
      setSavingChat(false);
    }
  };

  const handleRemoveMemberClick = (membership: CampaignMembership) => {
    setMemberToRemove(membership);
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;
    removedMember.current = {
      userId: memberToRemove.userId,
      index: memberships.findIndex((m) => m.userId === memberToRemove.userId),
    };
    setRemovingMemberId(memberToRemove.userId);
    setMemberToRemove(null);
    try {
      await api.removeCampaignMember(campaign.id, memberToRemove.userId);
      await refreshCampaign();
      showToast(t('campaignSettings.removed', { role: roleLabel(memberToRemove.role) }), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.removeFailed'), 'error');
    } finally {
      setRemovingMemberId(null);
    }
  };

  /**
   * Make a member a player or a spectator. The picker shows the role chosen
   * while the server is asked, and the campaign is read again once it has
   * answered, so the row keeps it; a refusal puts the row back and says why.
   * The member's own page follows through `campaign.role.changed`.
   */
  const handleChangeRole = async (membership: CampaignMembership, role: AssignableCampaignRole) => {
    if (role === membership.role) return;
    const { userId } = membership;
    setPendingRoles((prev) => ({ ...prev, [userId]: role }));
    try {
      await api.changeCampaignMemberRole(campaign.id, userId, role);
      await refreshCampaign();
      showToast(t('campaignSettings.roleChanged', { name: membership.user?.displayName ?? t('campaignSettings.theMember'), role: roleLabel(role).toLowerCase() }), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.roleChangeFailed'), 'error');
    } finally {
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  };

  /**
   * Hand the game to someone else. One action on the server: they become GM and
   * you become a player. Ownership of the campaign does not move, so if you own
   * it you still do.
   */
  const handleConfirmMakeGm = async () => {
    if (!memberToPromote) return;
    const promoted = memberToPromote;
    setPromotingMemberId(promoted.userId);
    setMemberToPromote(null);
    try {
      await api.transferGM(campaign.id, promoted.userId);
      await refreshCampaign();
      showToast(t('campaignSettings.nowGm', { name: promoted.user?.displayName ?? t('campaignSettings.they') }), 'success');
      // This panel is GM-only, and the caller has just stopped being the GM.
      onClose();
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.transferFailed'), 'error');
    } finally {
      setPromotingMemberId(null);
    }
  };

  // The server also tells this tab, before it answers; the page's handler
  // says whichever comes first, once, as for Leave Campaign.
  const handleDeleteCampaign = async () => {
    setShowDeleteConfirm(false);
    setDeletingCampaign(true);
    try {
      await campaignService.deleteCampaign(campaign.id);
      onDeleted({ campaignId: campaign.id, reason: 'campaign-deleted', message: t('campaignSettings.deletedNotice', { name: campaign.name }) });
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.deleteFailed'), 'error');
      setDeletingCampaign(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      const outcome = await api.downloadCampaignExport(
        campaign.id,
        { includeAudio: exportIncludeAudio },
        `${safeName}-export.cozyvtt`
      );
      if (outcome === 'saved') showToast(t('campaignSettings.exported'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? t('campaignSettings.exportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  // Nobody the server refuses to remove: yourself, the GM, and the
  // campaign's owner, who keeps their place at the table whoever runs it.
  const mayRemove = (membership: CampaignMembership) =>
    membership.userId !== user?.id && membership.role !== 'GM' && membership.userId !== campaign.ownerId;

  const deleteNameMatches = deleteConfirmName.trim() === campaign.name;

  // ── Render ───────────────────────────────────

  return (
    <>
      <SlideOver
        open={isOpen}
        onClose={onClose}
        className="max-w-xl bg-paper-white shadow-2xl flex flex-col"
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-moss-green/10 backdrop-blur-xs border-b border-moss-green/20 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-brand-ink" />
              <div>
                <SlideOverTitle className="text-xl font-bold text-brand-ink">{t('campaignSettings.title')}</SlideOverTitle>
                <p className="text-xs text-stone-gray truncate max-w-[220px]">{campaign.name}</p>
              </div>
            </div>
            <SlideOverClose
              className="p-2 hover:bg-moss-green/10 rounded-lg transition-colors"
              iconClassName="w-5 h-5 text-stone-gray"
            />
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 mt-4">
            {(
              [
                ...(isGmViewer
                  ? [
                      { id: 'general', label: t('campaignSettings.tabs.general') },
                      { id: 'chat', label: t('campaignSettings.tabs.chat') },
                    ]
                  : []),
                { id: 'members', label: t('campaignSettings.tabs.members') },
                // Only Delete Campaign is here, which the server leaves
                // to the owner or an administrator, whatever their role.
                ...(mayDelete ? [{ id: 'danger', label: t('campaignSettings.tabs.danger') }] : []),
              ] as { id: SettingsTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`touch-target px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? tab.id === 'danger'
                      ? 'bg-danger/10 text-danger-ink border border-danger/20'
                      : 'bg-moss-green/15 text-brand-ink border border-moss-green/20'
                    : 'text-stone-gray hover:bg-warm-gray/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ════ GENERAL TAB ════ */}
          {activeTab === 'general' && (
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="cs-name"
                  className="block text-sm font-semibold text-stone-gray mb-1.5"
                >
                  {t('campaignSettings.nameLabel')} <span className="text-danger-ink">*</span>
                </label>
                <input
                  id="cs-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={CAMPAIGN_LIMITS.maxNameLength}
                  className="input-cozy w-full"
                  placeholder={t('campaignSettings.namePlaceholder')}
                />
              </div>

              <div>
                <label
                  htmlFor="cs-description"
                  className="block text-sm font-semibold text-stone-gray mb-1.5"
                >
                  {t('campaignSettings.descriptionLabel')} <span className="text-warm-gray font-normal">{t('campaignSettings.optional')}</span>
                </label>
                <textarea
                  id="cs-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={CAMPAIGN_LIMITS.maxDescriptionLength}
                  className="input-cozy w-full resize-none"
                  placeholder={t('campaignSettings.descriptionPlaceholder')}
                />
                <p className="mt-1 text-xs text-warm-gray text-right">
                  {description.length}/{CAMPAIGN_LIMITS.maxDescriptionLength}
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleSaveGeneral}
                  disabled={savingGeneral || !name.trim()}
                  className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingGeneral ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('campaignSettings.saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {t('campaignSettings.save')}
                    </>
                  )}
                </Button>
              </div>

              {/* ── Players may draw ── */}
              <div className="pt-4 mt-4 border-t border-moss-green/15 flex items-center justify-between gap-4">
                <div>
                  <p id="cs-players-may-draw" className="text-sm font-semibold text-stone-gray">{t('campaignSettings.playersMayDraw')}</p>
                  <p className="text-xs text-warm-gray mt-0.5">
                    {t('campaignSettings.playersMayDrawHint')}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={playersMayDrawShown ?? campaign.playersMayDraw ?? true}
                  aria-labelledby="cs-players-may-draw"
                  onClick={() => void handlePlayersMayDraw(!(playersMayDrawShown ?? campaign.playersMayDraw ?? true))}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-moss-green/50 ${SWITCH_PRESS} ${
                    (playersMayDrawShown ?? campaign.playersMayDraw ?? true) ? 'bg-moss-green' : 'bg-warm-gray/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      (playersMayDrawShown ?? campaign.playersMayDraw ?? true) ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* ── Books ── */}
              {books && (
                <div className="pt-4 mt-4 border-t border-moss-green/15">
                  <CampaignBooksPicker books={books} onChange={(ids) => void handleBooks(ids)} disabled={!isGmViewer || savingBooks} />
                </div>
              )}

              {/* ── Character creation ── */}
              {campaign.gameSystem === GameSystem.FIFTH_EDITION && (
                <div className="pt-4 mt-4 border-t border-moss-green/15">
                  <CampaignCreationSettings
                    methods={creationShown?.abilityScoreMethods ?? campaign.abilityScoreMethods}
                    detailLevel={creationShown?.detailLevel ?? campaign.detailLevel}
                    onChange={(patch) => void handleCreation(patch)}
                    disabled={!isGmViewer || creationShown !== null}
                  />
                </div>
              )}

              {/* ── Export ── */}
              <div className="pt-4 mt-4 border-t border-moss-green/15 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-gray">
                  <Download className="w-4 h-4 text-brand-ink" />
                  {t('campaignSettings.exportTitle')}
                </div>
                <p className="text-xs text-warm-gray">
                  <Trans i18nKey="campaignSettings.exportHint" components={{ mono: <span className="font-mono" /> }} />
                </p>

                <div className="flex items-center justify-between">
                  <div>
                    <p id="cs-export-audio" className="text-sm text-stone-gray">{t('campaignSettings.includeAudio')}</p>
                    <p className="text-xs text-warm-gray">{t('campaignSettings.includeAudioHint')}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={exportIncludeAudio}
                    aria-labelledby="cs-export-audio"
                    onClick={() => setExportIncludeAudio((v) => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-moss-green/50 ${SWITCH_PRESS} ${
                      exportIncludeAudio ? 'bg-moss-green' : 'bg-warm-gray/30'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        exportIncludeAudio ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <Button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  variant="secondary" className="w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('campaignSettings.exporting')}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      {t('campaignSettings.exportTitle')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ════ CHAT TAB ════ */}
          {activeTab === 'chat' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-moss-green/5 border border-moss-green/15">
                <MessageCircle className="w-5 h-5 text-brand-ink shrink-0 mt-0.5" />
                <p className="text-sm text-stone-gray">
                  {t('campaignSettings.chatIntro')}
                </p>
              </div>

              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-gray">{t('campaignSettings.cooldown')}</p>
                  <p className="text-xs text-warm-gray mt-0.5">{t('campaignSettings.cooldownHint')}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={chatCooldownEnabled}
                  onClick={() => setChatCooldownEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-moss-green/50 ${
                    chatCooldownEnabled ? 'bg-moss-green' : 'bg-warm-gray/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      chatCooldownEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Cooldown duration */}
              {chatCooldownEnabled && (
                <div>
                  <label
                    htmlFor="cs-cooldown-seconds"
                    className="block text-sm font-semibold text-stone-gray mb-1.5"
                  >
                    {t('campaignSettings.cooldownDuration')} <span className="font-normal text-warm-gray">{t('campaignSettings.seconds')}</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="cs-cooldown-seconds"
                      type="number"
                      min={1}
                      max={300}
                      value={chatCooldownSeconds}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(300, Number(e.target.value)));
                        setChatCooldownSeconds(v);
                      }}
                      className="input-cozy w-28"
                    />
                    <span className="text-sm text-warm-gray">
                      {t('campaignSettings.secondsBetween', { count: chatCooldownSeconds })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-warm-gray">{t('campaignSettings.cooldownRange')}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleSaveChat}
                  disabled={savingChat}
                  className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingChat ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('campaignSettings.saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {t('campaignSettings.save')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ════ MEMBERS TAB ════ */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              {/* Invite button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-stone-gray">
                  <Users className="w-4 h-4" />
                  <span>{t('campaignSettings.members', { count: memberships.length })}</span>
                </div>
                {isGmViewer && (
                <Button
                  ref={inviteButtonRef}
                  type="button"
                  onClick={() => { setInviteKey((k) => k + 1); setShowInviteModal(true); }}
                  variant="secondary" className="flex items-center gap-2 text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  {t('invite.title')}
                </Button>
                )}
              </div>

              {/* Member list */}
              <div ref={memberListRef} className="space-y-2">
                {memberships.map((membership) => {
                  const isSelf = membership.userId === user?.id;
                  const isGm = membership.role === 'GM';
                  const isRemoving = removingMemberId === membership.userId;
                  const pendingRole = pendingRoles[membership.userId];
                  const memberName = membership.user?.displayName ?? t('campaignSettings.thisMember');

                  // The controls go under the name when they do not fit beside it.
                  return (
                    <div
                      key={membership.userId}
                      data-member-row={membership.userId}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3 rounded-lg bg-parchment/50 border border-moss-green/10"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 basis-40">
                        <div className="w-8 h-8 rounded-full bg-moss-green/15 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-brand-ink uppercase">
                            {(membership.user?.displayName ?? '?')[0]}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-stone-gray truncate">
                            {membership.user?.displayName ?? t('campaignSettings.unknown')}
                            {isSelf && (
                              <span className="ml-1.5 text-xs font-normal text-warm-gray">{t('campaignSettings.you')}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        {/* Role: a picker for the GM beside everyone but
                            themselves, the campaign's owner included; a
                            badge otherwise */}
                        {isGmViewer && !isGm ? (
                          // Left enabled while busy: a browser moves the
                          // focus off a control disabled under it, and a
                          // change from the keyboard is sent at once. A
                          // change made meanwhile is ignored, and the
                          // controlled value puts the choice back.
                          <select
                            aria-label={t('campaignSettings.roleOf', { name: memberName })}
                            value={pendingRole ?? membership.role}
                            aria-busy={pendingRole !== undefined || undefined}
                            aria-disabled={pendingRole !== undefined || isRemoving || undefined}
                            onChange={(e) => {
                              if (pendingRole !== undefined || isRemoving) return;
                              const role = roleChoice(e.target.value);
                              if (role) void handleChangeRole(membership, role);
                            }}
                            className="touch-target rounded-cozy border border-ink-muted/30 bg-paper/80 px-2 py-1 text-xs font-medium text-ink focus:outline-hidden focus:ring-2 focus:ring-brand aria-disabled:opacity-60"
                          >
                            {ROLE_CHOICES.map((role) => (
                              <option key={role} value={role}>{roleLabel(role)}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                              isGm
                                ? 'bg-spirit-purple/10 text-spirit-ink border-spirit-purple/20'
                                : membership.role === 'SPECTATOR'
                                ? 'bg-stone-gray/10 text-stone-gray border-stone-gray/20'
                                : 'bg-moss-green/10 text-brand-ink border-moss-green/20'
                            }`}
                          >
                            {isGm ? (
                              <span className="flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                {roleLabel(membership.role)}
                              </span>
                            ) : (
                              roleLabel(membership.role)
                            )}
                          </span>
                        )}

                        {/* Hand over the game. Offered on anyone who is
                            not already the GM, including a spectator. */}
                        {!isGm && (
                          <button
                            type="button"
                            onClick={() => setMemberToPromote(membership)}
                            disabled={promotingMemberId === membership.userId}
                            title={t('campaignSettings.makeGm', { name: membership.user?.displayName ?? t('campaignSettings.thisPlayer') })}
                            className="touch-target inline-flex items-center justify-center p-1.5 rounded-lg text-spirit-ink hover:bg-spirit-purple/10 transition-colors disabled:opacity-40"
                            aria-label={t('campaignSettings.makeGm', { name: membership.user?.displayName ?? t('campaignSettings.thisPlayer') })}
                          >
                            {promotingMemberId === membership.userId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Crown className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {/* Remove button: not for yourself, the GM or the owner */}
                        {isGmViewer && mayRemove(membership) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMemberClick(membership)}
                            disabled={isRemoving}
                            data-remove-member
                            className="touch-target inline-flex items-center justify-center p-1.5 rounded-lg text-danger-ink hover:text-danger-ink hover:bg-danger/10 transition-colors disabled:opacity-40"
                            aria-label={t('campaignSettings.removeAria', { name: membership.user?.displayName })}
                          >
                            {isRemoving ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <UserMinus className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Invitations that still stand: who has been asked, until when */}
              {isGmViewer && invitations.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide">{t('campaignSettings.invited')}</h3>
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-parchment/30 border border-dashed border-moss-green/20"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-black truncate">{invitation.user.displayName}</p>
                        <p className="text-xs text-stone-gray">
                          {invitation.expiresAt
                            ? t('campaignSettings.invitedUntil', { date: new Date(invitation.expiresAt).toLocaleDateString(i18n.language) })
                            : t('campaignSettings.invited')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleWithdrawInvitation(invitation)}
                        disabled={withdrawingId === invitation.id}
                        className="touch-target inline-flex items-center justify-center p-1.5 rounded-lg text-danger-ink hover:bg-danger/10 transition-colors disabled:opacity-40"
                        aria-label={t('campaignSettings.withdrawAria', { name: invitation.user.displayName })}
                        title={t('campaignSettings.withdrawTitle')}
                      >
                        {withdrawingId === invitation.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════ DANGER ZONE TAB ════ */}
          {activeTab === 'danger' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-danger/10 border border-danger/30">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-5 h-5 text-danger-ink shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-danger-ink mb-1">{t('campaignSettings.deleteTitle')}</h3>
                    <p className="text-sm text-danger-ink">
                      <Trans i18nKey="campaignSettings.deleteBody" components={{ b: <strong /> }} />
                    </p>
                    <p className="text-sm text-danger-ink mt-2">
                      <Trans i18nKey="campaignSettings.deleteIrreversible" components={{ b: <strong /> }} />
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="cs-delete-confirm"
                      className="block text-sm font-semibold text-danger-ink mb-1.5"
                    >
                      <Trans
                        i18nKey="campaignSettings.typeToConfirm"
                        values={{ name: campaign.name }}
                        components={{ name: <span className="font-mono bg-danger/10 px-1 rounded-sm" /> }}
                      />
                    </label>
                    <input
                      id="cs-delete-confirm"
                      type="text"
                      value={deleteConfirmName}
                      onChange={(e) => setDeleteConfirmName(e.target.value)}
                      className="input-cozy w-full border-danger/30 focus:border-danger/60 focus:ring-danger/20"
                      placeholder={campaign.name}
                      autoComplete="off"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!deleteNameMatches || deletingCampaign}
                    variant="danger" className="w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deletingCampaign ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('campaignSettings.deleting')}
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        {t('campaignSettings.deleteTitle')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SlideOver>

      {/* Remove member confirm dialog, named for the member's role */}
      <ConfirmDialog
        isOpen={!!memberToRemove}
        title={t('campaignSettings.removeTitle', { role: removingRole })}
        message={t('campaignSettings.removeMessage', { who: memberToRemove?.user?.displayName ?? t('campaignSettings.thisRole', { role: removingRole.toLowerCase() }), campaign: campaign.name })}
        confirmLabel={t('campaignSettings.removeConfirm')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />

      {/* Transfer GM confirm dialog */}
      <ConfirmDialog
        isOpen={!!memberToPromote}
        title={t('campaignSettings.handTitle')}
        message={t('campaignSettings.handMessage', { name: memberToPromote?.user?.displayName ?? t('campaignSettings.thisPlayer'), campaign: campaign.name })}
        confirmLabel={t('campaignSettings.handConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmMakeGm}
        onCancel={() => setMemberToPromote(null)}
      />

      {/* Final delete confirm dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={t('campaignSettings.deleteTitle')}
        message={t('campaignSettings.finalMessage', { campaign: campaign.name })}
        confirmLabel={t('campaignSettings.deleteForever')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isLoading={deletingCampaign}
        onConfirm={handleDeleteCampaign}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Invite player modal */}
      {/* Mounted from its first opening on, so it fades out on close. */}
      {inviteKey > 0 && (
        <InvitePlayerModal
          key={inviteKey}
          open={showInviteModal}
          campaignId={campaign.id}
          onClose={() => setShowInviteModal(false)}
          // The invite dialog says it was sent. Nothing on the campaign
          // changes until it is accepted, which the roster hears about; the
          // new invitation joins the Invited list.
          onSuccess={() => { setShowInviteModal(false); void loadInvitations(); }}
        />
      )}
    </>
  );
}
