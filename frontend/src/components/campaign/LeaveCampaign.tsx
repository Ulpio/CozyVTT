// ============================================
// Leave Campaign
// A player's or a spectator's way out of the campaign, asked first, in the
// Campaign Info panel. The GM and the owner, whom the server refuses, are
// shown how to get out instead.
// ============================================

import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import { isCampaignOwner } from '@/utils/campaignRoles';
import ConfirmDialog from '../common/ConfirmDialog';
import { CampaignRole } from '@/types';
import type { AccessRevoked, Campaign } from '@/types';

interface LeaveCampaignProps {
  campaign: Pick<Campaign, 'id' | 'name' | 'ownerId'>;
  userRole: CampaignRole;
  /**
   * Told once the server has taken the member out, with the notice their
   * socket is sent too (useAccessRevoked says it once, whichever comes first).
   */
  onLeft: (revoked: AccessRevoked) => void;
}

const hint = 'text-xs text-warm-gray';

export default function LeaveCampaign({ campaign, userRole, onLeft }: LeaveCampaignProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [left, setLeft] = useState(false);

  // In the order the server refuses them: an owner in the GM seat is told
  // about owning it, since handing the seat over would not let them leave.
  if (isCampaignOwner(campaign, user?.id)) {
    return (
      <p className={hint}>
        <Trans
          i18nKey={userRole === CampaignRole.GM ? 'leaveCampaign.ownerHintGm' : 'leaveCampaign.ownerHintOwner'}
          components={{ b: <strong /> }}
        />
      </p>
    );
  }
  if (userRole === CampaignRole.GM) {
    return (
      <p className={hint}>
        <Trans i18nKey="leaveCampaign.gmHint" components={{ b: <strong /> }} />
      </p>
    );
  }
  if (left) return null;

  const handleLeave = async () => {
    setLeaving(true);
    try {
      const { message } = await api.leaveCampaign(campaign.id);
      setLeft(true);
      setAsking(false);
      onLeft({ campaignId: campaign.id, reason: 'left', message });
    } catch (err) {
      setAsking(false);
      showToast(apiErrorMessage(err) ?? t('leaveCampaign.failed'), 'error');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="touch-target flex items-center gap-2 px-3 py-2 w-full rounded-lg border border-danger/20 text-danger-ink hover:bg-danger/10 transition-colors text-sm font-medium"
      >
        <LogOut className="w-4 h-4" aria-hidden="true" />
        {t('leaveCampaign.button')}
      </button>
      <ConfirmDialog
        isOpen={asking}
        title={t('leaveCampaign.dialogTitle', { name: campaign.name })}
        message={t('leaveCampaign.message')}
        confirmLabel={t('leaveCampaign.button')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isLoading={leaving}
        onConfirm={() => void handleLeave()}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
