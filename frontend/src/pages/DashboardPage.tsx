// ============================================
// Dashboard Page
// Campaign list and main navigation hub
// Protected route - requires authentication
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Plus, LogOut, User, ArrowRight, Mail, FolderOpen, Shield, AlertCircle, Upload, FileText, BookOpen } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useCampaignsQuery, useCharactersQuery, usePendingInvitationsQuery, queryKeys } from '@/hooks/queries';
import CampaignCard from '@/components/CampaignCard';
import CreateCampaignModal from '@/components/CreateCampaignModal';
import CampaignImportDialog from '@/components/campaign/CampaignImportDialog';
import InvitationModal from '@/components/campaign/InvitationModal';
import CampaignCardSkeleton from '@/components/skeletons/CampaignCardSkeleton';
import LeftCampaignNotes from '@/components/LeftCampaignNotes';
import type { Campaign, CampaignInvitation } from '@/types';
import { CampaignRole, PlatformRole } from '@/types';
import Button from '@/components/ui/Button';
import { apiErrorMessage } from '@/utils/errors';
import { gameSystemName } from '@/constants/game-systems';
import { AboutButton } from '@/components/common/AboutDialog';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { mascotUrl, instanceName } = useTheme();
  const { t } = useTranslation();

  const [selectedInvitation, setSelectedInvitation] = useState<CampaignInvitation | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Server resources via react-query — cached, deduped, refetched on
  // network reconnect (client defaults in lib/queryClient.ts).
  const queryClient = useQueryClient();
  const campaignsQuery = useCampaignsQuery();
  const charactersQuery = useCharactersQuery();
  const invitationsQuery = usePendingInvitationsQuery();

  const campaigns = campaignsQuery.data ?? [];
  const characters = charactersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const loading = campaignsQuery.isPending || charactersQuery.isPending || invitationsQuery.isPending;
  const queryError = campaignsQuery.error || charactersQuery.error || invitationsQuery.error;
  const error = queryError
    ? (apiErrorMessage(queryError) || t('dashboard.loadFailed'))
    : '';

  // Refresh button + post-invitation-response resync
  const loadData = () => {
    campaignsQuery.refetch();
    charactersQuery.refetch();
    invitationsQuery.refetch();
    queryClient.invalidateQueries({ queryKey: queryKeys.leftCampaigns });
  };

  const handleCampaignCreated = (newCampaign: Campaign) => {
    queryClient.setQueryData<Campaign[]>(queryKeys.campaigns, (prev) => [newCampaign, ...(prev ?? [])]);
    showToast(t('dashboard.campaignCreated', { name: newCampaign.name }), 'success');
  };

  const handleLogout = async () => {
    await logout();
  };

  // Get user's role in a campaign
  const getUserRole = (campaign: Campaign): CampaignRole => {
    const membership = campaign.memberships?.find(m => m.userId === user?.id);
    return membership?.role || CampaignRole.PLAYER;
  };

  return (
    <div className="min-h-page bg-linear-to-br/srgb from-soft-cream via-parchment to-warm-amber/20">
      {/* Header */}
      <header className="bg-moss-green/10 border-b border-moss-green/20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Wraps so the actions drop below the title on a phone narrower
              than both: an administrator's four buttons need about 230 px. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-6">
            {/* Left: Logo + Title */}
            <div className="flex items-center gap-4">
              <div className="p-1 rounded-lg bg-moss-green/10" aria-hidden="true">
                <img src={mascotUrl} alt="" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-brand-ink font-heading">
                  {instanceName}
                </h1>
                <p className="text-sm text-warm-gray">
                  {t('dashboard.welcome', { name: user?.displayName ?? '' })}
                </p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              {user?.platformRole === PlatformRole.ADMIN && (
                <Button
                  onClick={() => navigate('/admin')}
                  variant="secondary" className="flex items-center gap-2"
                  aria-label={t('dashboard.adminLabel')}
                >
                  <Shield className="w-4 h-4 text-brand-ink" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('dashboard.admin')}</span>
                </Button>
              )}

              <Button
                onClick={handleLogout}
                variant="danger" className="flex items-center gap-2"
                aria-label={t('dashboard.logoutLabel')}
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('dashboard.logout')}</span>
              </Button>

              {/* Profile Avatar Button */}
              <button
                onClick={() => navigate('/profile')}
                aria-label={t('dashboard.profileLabel', { name: user?.displayName ?? t('dashboard.yourAccount') })}
                className="w-12 h-12 rounded-full border-2 border-moss-green/30 hover:border-moss-green/60 transition-colors overflow-hidden flex items-center justify-center bg-moss-green/10 shrink-0"
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-6 h-6 text-brand-ink" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Quick Links Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Characters Section */}
            <section className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-spirit-purple/10">
                    <User className="w-6 h-6 text-spirit-ink" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-brand-ink font-heading">
                      {t('dashboard.characters.title')}
                    </h2>
                    <p className="text-sm text-warm-gray">
                      {loading ? t('common.loading') : t('dashboard.characters.count', { count: characters.length })}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/characters')}
                  className="flex items-center gap-2"
                >
                  <span className="max-sm:sr-only">{t('dashboard.characters.manage')}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Characters loading skeleton */}
              {loading && (
                <div className="mt-4 space-y-3 animate-pulse">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="p-3 rounded-lg bg-parchment/50 border border-moss-green/10 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-moss-green/10 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-2/3 bg-moss-green/15 rounded-sm" />
                        <div className="h-3 w-1/3 bg-stone-gray/10 rounded-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Characters Preview */}
              {!loading && characters.length > 0 && (
                <div className="mt-4">
                  <div className="grid grid-cols-1 gap-3">
                    {characters.slice(0, 2).map((character) => (
                      <div
                        key={character.id}
                        className="p-3 rounded-lg bg-parchment/50 border border-moss-green/20
                                 hover:border-moss-green/40 transition-colors cursor-pointer"
                        onClick={() => navigate('/characters')}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-moss-green/10 border border-moss-green/30
                                        flex items-center justify-center overflow-hidden shrink-0">
                            {character.tokenImageUrl ? (
                              <img
                                src={character.tokenImageUrl}
                                alt={character.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-5 h-5 text-brand-ink" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-stone-gray truncate text-sm">
                              {character.name}
                            </p>
                            <p className="text-xs text-warm-gray truncate">
                              {gameSystemName(character.gameSystem)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {characters.length > 2 && (
                    <p className="text-sm text-warm-gray mt-3 text-center">
                      {t('dashboard.characters.more', { count: characters.length - 2 })}
                    </p>
                  )}
                </div>
              )}

              {!loading && characters.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-warm-gray mb-3 text-sm">{t('dashboard.characters.none')}</p>
                  <Button
                    onClick={() => navigate('/characters')}
                    variant="secondary" className="inline-flex items-center gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    {t('dashboard.characters.create')}
                  </Button>
                </div>
              )}
            </section>

            {/* Assets Library Section */}
            <section className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-warm-amber/10">
                    <FolderOpen className="w-6 h-6 text-accent-ink" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-brand-ink font-heading">
                      {t('dashboard.assets.title')}
                    </h2>
                    <p className="text-sm text-warm-gray">
                      {t('dashboard.assets.subtitle')}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/assets')}
                  className="flex items-center gap-2"
                >
                  <span className="max-sm:sr-only">{t('dashboard.assets.open')}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3 mt-4">
                <div
                  className="p-4 rounded-lg bg-parchment/50 border border-moss-green/20
                           hover:border-moss-green/40 transition-colors cursor-pointer text-center"
                  onClick={() => navigate('/assets')}
                >
                  <FolderOpen className="w-8 h-8 mx-auto mb-2 text-accent-ink/60" />
                  <p className="text-sm font-medium text-brand-ink mb-1">
                    {t('dashboard.assets.cardTitle')}
                  </p>
                  <p className="text-xs text-warm-gray">
                    {t('dashboard.assets.cardText')}
                  </p>
                </div>
              </div>
            </section>

            {/* Documents Section */}
            <section className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-moss-green/10">
                    <BookOpen className="w-6 h-6 text-brand-ink" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-brand-ink font-heading">
                      {t('dashboard.documents.title')}
                    </h2>
                    <p className="text-sm text-warm-gray">
                      {t('dashboard.documents.subtitle')}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/documents')}
                  className="flex items-center gap-2"
                >
                  <span className="max-sm:sr-only">{t('dashboard.documents.open')}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3 mt-4">
                <div
                  className="p-4 rounded-lg bg-parchment/50 border border-moss-green/20
                           hover:border-moss-green/40 transition-colors cursor-pointer text-center"
                  onClick={() => navigate('/documents')}
                >
                  <BookOpen className="w-8 h-8 mx-auto mb-2 text-brand-ink/60" />
                  <p className="text-sm font-medium text-brand-ink mb-1">
                    {t('dashboard.documents.cardTitle')}
                  </p>
                  <p className="text-xs text-warm-gray">
                    {t('dashboard.documents.cardText')}
                  </p>
                </div>
              </div>
            </section>

            {/* Character Templates Section */}
            <section className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-moss-green/10">
                    <FileText className="w-6 h-6 text-brand-ink" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-brand-ink font-heading">
                      {t('dashboard.templates.title')}
                    </h2>
                    <p className="text-sm text-warm-gray">{t('dashboard.templates.subtitle')}</p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/character-templates')}
                  className="flex items-center gap-2"
                >
                  <span className="max-sm:sr-only">{t('dashboard.templates.open')}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3 mt-4">
                <div
                  className="p-4 rounded-lg bg-parchment/50 border border-moss-green/20
                           hover:border-moss-green/40 transition-colors cursor-pointer text-center"
                  onClick={() => navigate('/character-templates')}
                >
                  <FileText className="w-8 h-8 mx-auto mb-2 text-brand-ink/40" />
                  <p className="text-sm font-medium text-brand-ink mb-1">
                    {t('dashboard.templates.cardTitle')}
                  </p>
                  <p className="text-xs text-warm-gray">
                    {t('dashboard.templates.cardText')}
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Pending Invitations Section */}
          {!loading && invitations.length > 0 && (
            <section className="glass-panel p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-moss-green/10">
                  <Mail className="w-6 h-6 text-brand-ink" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-brand-ink font-heading">
                    {t('dashboard.invitations.title')}
                  </h2>
                  <p className="text-sm text-warm-gray">
                    {t('dashboard.invitations.count', { count: invitations.length })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="p-4 rounded-lg bg-parchment/50 border border-moss-green/20 hover:border-moss-green/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedInvitation(invitation)}
                  >
                    <h3 className="font-semibold text-brand-ink mb-1">
                      {invitation.campaign?.name}
                    </h3>
                    {invitation.campaign?.description && (
                      <p className="text-sm text-warm-gray mb-2 line-clamp-2">
                        {invitation.campaign.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-warm-gray">
                      <span>
                        {invitation.campaign?.gm && `${t('roles.GM')}: ${invitation.campaign.gm.displayName}`}
                      </span>
                      <button className="text-brand-ink hover:underline font-medium">
                        {t('dashboard.invitations.view')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Campaigns Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-brand-ink font-heading">
                {t('dashboard.campaigns.title')}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowImportDialog(true)}
                  variant="secondary" className="flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span className="max-sm:sr-only">{t('dashboard.campaigns.import')}</span>
                </Button>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  {t('dashboard.campaigns.create')}
                </Button>
              </div>
            </div>

            {/* Error Message */}
            {error && !loading && (
              <div className="mb-6 bg-danger/10 border border-danger/20 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-danger-ink shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-danger-ink font-medium">{error}</p>
                </div>
                <Button
                  onClick={loadData}
                  variant="secondary" className="text-xs py-1 px-3 shrink-0"
                >
                  {t('common.tryAgain')}
                </Button>
              </div>
            )}

            {/* Loading State — skeleton cards */}
            {loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <CampaignCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && campaigns.length === 0 && (
              <div className="glass-panel p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="mb-4 inline-block p-4 rounded-full bg-moss-green/10">
                    <img src={mascotUrl} alt="" className="w-12 h-12 object-contain" />
                  </div>
                  <h3 className="text-xl font-semibold text-brand-ink mb-2">
                    {t('dashboard.campaigns.emptyTitle')}
                  </h3>
                  {/* Most people here join a friend's game, so that comes first;
                      running one yourself is the other way in. */}
                  <p className="text-warm-gray mb-3">
                    <strong className="text-brand-ink">{t('dashboard.campaigns.emptyJoinLead')}</strong> {t('dashboard.campaigns.emptyJoin')}
                  </p>
                  <p className="text-warm-gray mb-6">
                    <strong className="text-brand-ink">{t('dashboard.campaigns.emptyRunLead')}</strong> {t('dashboard.campaigns.emptyRun')}
                  </p>
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    {t('dashboard.campaigns.emptyCreate')}
                  </Button>
                </div>
              </div>
            )}

            {/* Campaign Grid */}
            {!loading && campaigns.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    userRole={getUserRole(campaign)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Notes and saved rolls from campaigns the user was removed from */}
          <LeftCampaignNotes />

          {/* Campaign Stats (if campaigns exist) */}
          {!loading && campaigns.length > 0 && (
            <section className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-brand-ink mb-4">
                {t('dashboard.stats.title')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-moss-green/5">
                  <p className="text-3xl font-bold text-brand-ink">
                    {campaigns.filter(c => getUserRole(c) === CampaignRole.GM).length}
                  </p>
                  <p className="text-sm text-warm-gray mt-1">{t('dashboard.stats.asGm')}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-spirit-purple/5">
                  <p className="text-3xl font-bold text-spirit-ink">
                    {campaigns.filter(c => getUserRole(c) === CampaignRole.PLAYER).length}
                  </p>
                  <p className="text-sm text-warm-gray mt-1">{t('dashboard.stats.asPlayer')}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-warm-amber/5">
                  <p className="text-3xl font-bold text-accent-ink">
                    {campaigns.filter(c => c.status === 'ACTIVE').length}
                  </p>
                  <p className="text-sm text-warm-gray mt-1">{t('dashboard.stats.active')}</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 flex justify-center">
        <AboutButton />
      </footer>

      {/* Create Campaign Modal */}
      <CreateCampaignModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCampaignCreated}
      />

      {/* Import Campaign Dialog */}
      <CampaignImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onSuccess={loadData}
      />

      {/* Invitation Modal */}
      {selectedInvitation && (
        <InvitationModal
          invitation={selectedInvitation}
          onClose={() => setSelectedInvitation(null)}
          onAccept={() => {
            setSelectedInvitation(null);
            loadData(); // Refresh data to show new campaign membership
          }}
          onDecline={() => {
            setSelectedInvitation(null);
            loadData(); // Refresh data to remove invitation
          }}
        />
      )}
    </div>
  );
}
