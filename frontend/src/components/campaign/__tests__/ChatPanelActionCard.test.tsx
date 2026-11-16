/** A bar action's card in the chat log: kept from history and from `chat.message`, replaced by `chat.message.updated`. */
import { it, expect, vi, beforeAll } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { ChatMessageBroadcast, ChatMessageUpdated } from '@/types';

vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [], chatCooldownEnabled: false } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
vi.mock('@/services/actions.service', () => ({ actionsService: { undo: vi.fn(), concentration: vi.fn() } }));

let onMessage: ((data: ChatMessageBroadcast) => void) | null = null;
let onUpdated: ((data: ChatMessageUpdated) => void) | null = null;
const socket = {
  onChatMessage: (fn: (data: ChatMessageBroadcast) => void) => { onMessage = fn; },
  onChatMessageUpdated: (fn: (data: ChatMessageUpdated) => void) => { onUpdated = fn; },
  onChatSystem: vi.fn(),
  off: vi.fn(),
  sendChatMessage: vi.fn(),
};
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket, joinedEpoch: 1 }) }));
vi.mock('@/services/message.service', () => ({
  getMessages: async () => ({
    messages: [{ id: 'old', campaignId: 'campaign-1', userId: 'u2', type: 'CHARACTER_ACTION', content: 'pt', metadata: { kind: 'action', actor: { tokenId: 'a', name: 'Mara' }, actionName: 'Bola', mode: 'normal', targets: [{ tokenId: 'g', name: 'Goblin', isCharacter: false, state: 'wounded' }] }, createdAt: new Date().toISOString() }],
    pagination: { hasMore: false, nextCursor: null },
  }),
}));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

import ChatPanel from '../ChatPanel';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

it('keeps the card from history and live, and swaps its metadata on chat.message.updated', async () => {
  render(<ChatPanel />);
  expect(await screen.findByText('Goblin: wounded')).toBeInTheDocument();
  expect(screen.queryByText('pt')).toBeNull();

  act(() => {
    onMessage?.({ id: 'live', userId: 'u2', userName: 'Zed', content: 'pt', type: 'CHARACTER_ACTION' as ChatMessageBroadcast['type'], timestamp: new Date().toISOString(),
      metadata: { kind: 'action', actor: { tokenId: 'a', name: 'Zed' }, actionName: 'Raio', mode: 'normal', targets: [] } });
  });
  expect(screen.getByText('Zed · Raio')).toBeInTheDocument();

  act(() => {
    onUpdated?.({ id: 'live', metadata: { kind: 'action', actor: { tokenId: 'a', name: 'Zed' }, actionName: 'Raio', mode: 'normal', targets: [], undoneAt: 'x' } });
  });
  expect(screen.getByText('Undone')).toBeInTheDocument();
});
