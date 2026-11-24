// ============================================
// Vibe tracker handler: vibe.update
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { findVibePeriod, normalizeVibeSettings } from '../../utils/vibe-presets';
import { vibePeriodAudioAssetId } from '../../utils/vibeAudio';
import { lastAmbientVolume, setCampaignAmbientAudio } from '../../services/atmosphereAudio';
import { sendSystemMessage } from '../utils';
import { withinCeiling } from '../shared';
import logger from '../../utils/logger';
import { GM_ONLY } from '../../services/gmNotice';

export function registerVibeHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * VIBE.UPDATE - GM changes the current vibe period and its audio follows.
   * Updates campaign.currentVibe, broadcasts period data to all members, and
   * sets the period's track as the table's ambient audio (none means silence).
   */
  socket.on('vibe.update', async (data: { period: string }) => {
    try {
      if (!socket.campaignId || !socket.userId) {
        socket.emit('error', { message: 'Você não está em uma campanha.' });
        return;
      }
      if (!withinCeiling(socket, 'vibe.update')) return;

      // GM only
      if (socket.role !== 'GM') {
        socket.emit('error', { message: GM_ONLY });
        return;
      }

      const { period } = data;

      if (!period || typeof period !== 'string') {
        socket.emit('error', { message: 'Informe o período.' });
        return;
      }

      // Fetch campaign vibe settings
      const campaign = await prisma.campaign.findUnique({
        where: { id: socket.campaignId },
        select: { vibeSettings: true, currentVibe: true },
      });

      if (!campaign) {
        socket.emit('error', { message: 'Campanha não encontrada.' });
        return;
      }

      // Normalize settings to handle old and new formats
      const vibeSettings = normalizeVibeSettings(campaign.vibeSettings);

      // Check if vibe tracker is enabled
      if (!vibeSettings.enabled) {
        socket.emit('error', { message: 'O clima não está ativado nesta campanha.' });
        return;
      }

      // Find the requested period in settings
      const vibePeriod = findVibePeriod(vibeSettings, period);

      if (!vibePeriod) {
        const availablePeriods = vibeSettings.periods.map((p: { name: string }) => p.name).join(', ');
        socket.emit('error', {
          message: `Período de clima desconhecido: ${period}. Disponíveis: ${availablePeriods}`,
        });
        return;
      }

      // Update campaign currentVibe
      await prisma.campaign.update({
        where: { id: socket.campaignId },
        data: { currentVibe: vibePeriod.name },
      });

      // Broadcast to all campaign members (including sender for confirmation)
      io.to(socket.campaignId).emit('vibe.updated', {
        period: vibePeriod.name,
        hue: vibePeriod.hue,
        filter: vibePeriod.filter,
        audio: vibePeriod.audio,
        updatedBy: socket.userId,
        timestamp: new Date().toISOString(),
      });

      // The vibe owns the soundtrack: a period with a track starts it for
      // the table, one without silences it. Older settings carried free-text
      // notes in this field; those count as no track. A dead or forbidden id
      // silences the table and tells the GM, but never blocks the switch.
      const requestedAudio = vibePeriodAudioAssetId(vibePeriod.audio);
      const volume = await lastAmbientVolume(socket.campaignId);
      const audioResult = await setCampaignAmbientAudio(io, socket.campaignId, socket.userId, requestedAudio, { volume });
      if (!audioResult.ok) {
        await setCampaignAmbientAudio(io, socket.campaignId, socket.userId, null, { volume });
        socket.emit('error', {
          message: `O áudio do período "${vibePeriod.name}" não está disponível, então o clima mudou sem áudio.`,
        });
      }

      // Send system message
      const periodDisplayName = vibePeriod.name.charAt(0).toUpperCase() + vibePeriod.name.slice(1);
      await sendSystemMessage(
        socket.campaignId,
        `O tempo avança para ${periodDisplayName}.`,
        { userId: socket.userId, action: 'vibe.update', period: vibePeriod.name }
      );

      logger.info('vibe.update', { period: vibePeriod.name, userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('vibe.update failed', { err: error });
      socket.emit('error', { message: 'Não foi possível atualizar o clima.' });
    }
  });
}
