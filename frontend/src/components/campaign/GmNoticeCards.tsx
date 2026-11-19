// ============================================
// The GM's notices over the map: one card each, newest on top, closed with
// "Close". Fed by the live chat stream only (not by history), so a notice
// is seen once, when it is sent.
// ============================================

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGmNoticeStore, gmNoticeFor } from '@/stores/gmNoticeStore';
import { ItemIcon } from '@/components/character-sheets/fifth-edition/components/ItemIcon';
import type { ChatMessageBroadcast } from '@/types';

export default function GmNoticeCards({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { socket } = useWebSocket();
  const { user } = useAuth();
  const notices = useGmNoticeStore((s) => s.notices);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (data: ChatMessageBroadcast) => {
      const notice = gmNoticeFor(data, user?.id);
      if (notice) useGmNoticeStore.getState().add(notice);
    };
    socket.onChatMessage(onMessage);
    return () => {
      socket.off('chat.message', onMessage);
    };
  }, [socket, user?.id]);

  useEffect(() => () => useGmNoticeStore.getState().clear(), []);

  if (notices.length === 0) return null;
  return (
    <div role="region" aria-label={t('gmNotice.label')} className={`space-y-1 ${className}`}>
      {notices.map((notice) => (
        <div key={notice.id} role="status" className="flex items-start gap-2 rounded-cozy border border-warning/40 bg-parchment/95 px-3 py-2 text-sm text-warning-ink shadow-md">
          {notice.item && <ItemIcon item={{ name: notice.item.name }} size={28} />}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">{t('gmNotice.label')}</div>
            <p data-testid="gm-notice-text" className="whitespace-pre-wrap wrap-break-word text-brand-ink">{notice.text}</p>
          </div>
          <button
            type="button"
            aria-label={t('gmNotice.close')}
            onClick={() => useGmNoticeStore.getState().dismiss(notice.id)}
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm text-stone-gray hover:bg-brand/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
