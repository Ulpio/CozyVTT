/** The GM's notice as a card over the player's map, and its label in the chat. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MessageType } from '@/types';
import type { ChatMessageBroadcast, Message } from '@/types';

const ws = { handlers: new Map<string, (data: ChatMessageBroadcast) => void>() };
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: {
      onChatMessage: (fn: (d: ChatMessageBroadcast) => void) => ws.handlers.set('chat.message', fn),
      off: (e: string) => ws.handlers.delete(e),
    },
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Ash' } }) }));
vi.mock('@/utils/localItemIcons', () => ({
  loadLocalItemIcons: () => Promise.resolve(),
  localItemIconUrl: () => null,
  localItemIconsVersion: () => 0,
  subscribeLocalItemIcons: () => () => {},
}));

import GmNoticeCards from '../GmNoticeCards';
import ChatMessage from '../ChatMessage';
import { useGmNoticeStore } from '@/stores/gmNoticeStore';

const notice = (id: string, content: string, extra: Partial<ChatMessageBroadcast> = {}): ChatMessageBroadcast => ({
  id, userId: 'dm', userName: 'Dana', content, type: MessageType.WHISPER, timestamp: '2026-11-19T10:00:00.000Z',
  recipientId: 'me', recipientName: 'Ash', metadata: { kind: 'gmNotice', characterId: 'c1' }, ...extra,
});
const send = (data: ChatMessageBroadcast) => act(() => { ws.handlers.get('chat.message')?.(data); });

beforeEach(() => {
  cleanup();
  ws.handlers.clear();
  useGmNoticeStore.getState().clear();
});

describe('the GM notice cards', () => {
  it('shows a notice for me and closes it', () => {
    render(<GmNoticeCards />);
    send(notice('n1', 'Meet me at the inn'));
    expect(screen.getByText('Meet me at the inn')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Meet me at the inn')).not.toBeInTheDocument();
  });

  it('stacks two notices with the newest on top', () => {
    render(<GmNoticeCards />);
    send(notice('n1', 'First'));
    send(notice('n2', 'Second'));
    const texts = screen.getAllByTestId('gm-notice-text').map((e) => e.textContent);
    expect(texts).toEqual(['Second', 'First']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    expect(screen.getAllByTestId('gm-notice-text').map((e) => e.textContent)).toEqual(['First']);
  });

  it('shows nothing for someone else, a plain whisper, or the GM who sent it', () => {
    render(<GmNoticeCards />);
    send(notice('n1', 'For Bruno', { recipientId: 'bruno' }));
    send(notice('n2', 'Just a whisper', { metadata: undefined }));
    send(notice('n3', 'Sent by me', { userId: 'me', recipientId: 'dm' }));
    expect(screen.queryAllByTestId('gm-notice-text')).toHaveLength(0);
  });

  it('shows the same notice once when it arrives twice', () => {
    render(<GmNoticeCards />);
    send(notice('n1', 'Once'));
    send(notice('n1', 'Once'));
    expect(screen.getAllByTestId('gm-notice-text')).toHaveLength(1);
  });

  it('shows an item notice with its icon', () => {
    render(<GmNoticeCards />);
    send(notice('n1', 'Você recebeu: Flechas ×20', { metadata: { kind: 'gmNotice', characterId: 'c1', item: { name: 'Flechas', quantity: 20 } } }));
    expect(screen.getByText('Você recebeu: Flechas ×20')).toBeInTheDocument();
    expect(screen.getByTestId('item-icon')).toBeInTheDocument();
  });

  it('shows nothing when a history page is loaded (only the live stream raises cards)', () => {
    render(<GmNoticeCards />);
    expect(screen.queryAllByTestId('gm-notice-text')).toHaveLength(0);
  });
});

describe('a notice in the chat', () => {
  const row = (metadata: Message['metadata']): Message => ({
    id: 'n1', campaignId: 'c', userId: 'dm', user: { id: 'dm', displayName: 'Dana' }, type: MessageType.WHISPER,
    content: 'Meet me at the inn', metadata, createdAt: new Date().toISOString(), recipientId: 'me', recipient: null,
  });

  it('is labelled GM notice and does not print its metadata', () => {
    render(<ChatMessage message={row({ kind: 'gmNotice', characterId: 'c1' })} whisperLabel="Whisper from Dana" whisperPeer="Dana" sentByGM />);
    expect(screen.getByText('GM notice')).toBeInTheDocument();
    expect(screen.queryByText(/Whisper from/)).not.toBeInTheDocument();
    expect(screen.queryByText(/characterId/)).not.toBeInTheDocument();
    expect(screen.getByText('Meet me at the inn')).toBeInTheDocument();
  });

  it('tells the GM who got the notice, and the recipient just sees GM notice', () => {
    const { rerender } = render(<ChatMessage message={row({ kind: 'gmNotice', characterId: 'c1' })} isCurrentUser whisperLabel="Whisper to Ana" whisperPeer="Ana" sentByGM />);
    expect(screen.getByText('GM notice to Ana')).toBeInTheDocument();
    rerender(<ChatMessage message={row({ kind: 'gmNotice', characterId: 'c1' })} whisperLabel="Whisper from Dana" whisperPeer="Dana" sentByGM />);
    expect(screen.getByText('GM notice')).toBeInTheDocument();
  });

  it('keeps the whisper label on a plain whisper', () => {
    render(<ChatMessage message={row(null)} whisperLabel="Whisper from Dana" whisperPeer="Dana" />);
    expect(screen.getByText('Whisper from Dana')).toBeInTheDocument();
  });
});
