/** The GM's private notice to a player about their character, shared by the notice event and giving items. */

import { prisma } from '../config/database';
import { campaignSockets, getSocketInstance, stillInCampaign } from '../websocket/utils';
import type { AuthenticatedSocket } from '../websocket/auth';
import type { Viewer } from '../rules/actions/actionCard';
import { refuse, type Refusal } from './actionResolver/common';

export const GM_ONLY = 'Só o mestre pode fazer isso.';
export const NOTICE_LENGTH = 'O aviso precisa ter de 1 a 500 caracteres.';
export const NO_PLAYER = 'Esse personagem não tem jogador na mesa.';
export const NO_CHARACTER = 'Personagem não encontrado.';

/** The owner of the character when they are a PLAYER member of the campaign now, else null. */
export async function noticeRecipient(campaignId: string, characterId: string): Promise<string | null> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { userId: true, campaignId: true } });
  if (!character || character.campaignId !== campaignId) return null;
  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: character.userId, campaignId } },
    select: { role: true },
  });
  return membership?.role === 'PLAYER' ? character.userId : null;
}

/**
 * Store a whisper from the GM to the character's owner and send it live to the
 * owner's sockets and the GMs'. It carries `metadata.kind = 'gmNotice'`.
 */
export async function sendNotice(
  campaignId: string,
  requester: Viewer,
  characterId: string,
  text: string,
  item?: { name: string; quantity: number; compendiumRef?: { bookId: string; slug: string } },
): Promise<{ ok: true; messageId: string } | Refusal> {
  if (requester.role !== 'GM') return refuse(GM_ONLY);
  const content = text.trim();
  if (content.length < 1 || content.length > 500) return refuse(NOTICE_LENGTH);
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { campaignId: true } });
  if (!character || character.campaignId !== campaignId) return refuse(NO_CHARACTER);
  const recipientId = await noticeRecipient(campaignId, characterId);
  if (!recipientId) return refuse(NO_PLAYER);

  const metadata = { kind: 'gmNotice', characterId, ...(item ? { item: { name: item.name, quantity: item.quantity, ...(item.compendiumRef ? { compendiumRef: item.compendiumRef } : {}) } } : {}) };
  const message = await prisma.message.create({
    data: { campaignId, userId: requester.userId, type: 'WHISPER', recipientId, content, metadata },
    include: { user: { select: { displayName: true } }, recipient: { select: { displayName: true } } },
  });
  const payload = {
    id: message.id,
    userId: requester.userId,
    userName: message.user?.displayName ?? null,
    content: message.content,
    type: message.type,
    timestamp: message.createdAt.toISOString(),
    recipientId,
    recipientName: message.recipient?.displayName ?? null,
    metadata,
  };
  // Stored, so the notice stands whatever happens in telling the sockets.
  try {
    const sockets = stillInCampaign(await campaignSockets(getSocketInstance(), campaignId), campaignId);
    for (const s of sockets) {
      const a = s as unknown as AuthenticatedSocket;
      if (a.userId === recipientId || a.role === 'GM') s.emit('chat.message', payload);
    }
  } catch {
    // The reader finds it in the history.
  }
  return { ok: true, messageId: message.id };
}
