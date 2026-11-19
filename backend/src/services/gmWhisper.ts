/** A message to the GM alone, shared by the services that warn the table's referee. */

import { prisma } from '../config/database';
import { campaignSockets, getSocketInstance } from '../websocket/utils';
import type { AuthenticatedSocket } from '../websocket/auth';

/** Tell the GM, and only the GM, something: a stored whisper from the GM to themself, sent live to their sockets. */
export async function whisperGm(campaignId: string, content: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { ownerId: true, memberships: { where: { role: 'GM' }, select: { userId: true } } },
  });
  if (!campaign) return;
  const gmId = campaign.memberships.some((m) => m.userId === campaign.ownerId) ? campaign.ownerId : campaign.memberships[0]?.userId;
  if (!gmId) return;
  const message = await prisma.message.create({
    data: { campaignId, userId: gmId, type: 'WHISPER', recipientId: gmId, content },
    include: { user: { select: { displayName: true } } },
  });
  const payload = {
    id: message.id,
    userId: gmId,
    userName: message.user?.displayName ?? null,
    content: message.content,
    type: message.type,
    timestamp: message.createdAt.toISOString(),
    recipientId: gmId,
  };
  for (const s of await campaignSockets(getSocketInstance(), campaignId)) {
    if ((s as unknown as AuthenticatedSocket).userId === gmId) s.emit('chat.message', payload);
  }
}
