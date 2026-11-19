// ============================================
// The GM's notices waiting to be closed (zustand).
//
// A card is raised only by a notice that arrives live; the chat's history
// never reaches this store, so a reload shows none. Newest first.
// ============================================

import { create } from 'zustand';

export interface GmNotice {
  id: string;
  text: string;
  item?: { name: string; quantity: number; compendiumRef?: { bookId: string; slug: string } };
}

interface GmNoticeState {
  notices: GmNotice[];
  add: (notice: GmNotice) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useGmNoticeStore = create<GmNoticeState>((set) => ({
  notices: [],
  add: (notice) => set((s) => (s.notices.some((n) => n.id === notice.id) ? s : { notices: [notice, ...s.notices] })),
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  clear: () => set({ notices: [] }),
}));

/** The notice a chat message carries for this viewer, or null: a plain message, another's, or the sender's own. */
export function gmNoticeFor(
  data: { id: string; userId: string; content: string; recipientId?: string; metadata?: unknown },
  viewerId: string | undefined,
): GmNotice | null {
  const meta = data.metadata;
  if (!meta || typeof meta !== 'object' || (meta as { kind?: unknown }).kind !== 'gmNotice') return null;
  if (!viewerId || data.recipientId !== viewerId || data.userId === viewerId) return null;
  const item = (meta as { item?: { name?: unknown; quantity?: unknown; compendiumRef?: { bookId?: unknown; slug?: unknown } } }).item;
  const valid = item && typeof item.name === 'string' && typeof item.quantity === 'number';
  const r = item?.compendiumRef;
  const compendiumRef = r && typeof r.bookId === 'string' && typeof r.slug === 'string' ? { bookId: r.bookId, slug: r.slug } : undefined;
  return { id: data.id, text: data.content, ...(valid ? { item: { name: item!.name as string, quantity: item!.quantity as number, ...(compendiumRef ? { compendiumRef } : {}) } } : {}) };
}
