/**
 * The Token Manager and the dialog that asks before a token goes, in Portuguese.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { inPortuguese } from '@/test/inPortuguese';
import TokenManager from '../TokenManager';
import { useGameStore } from '@/stores/gameStore';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    useReducedMotionConfig: () => false,
    useIsPresent: () => true,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: {
      id: 'campaign-1',
      memberships: [{ userId: 'u1', role: 'PLAYER', user: { displayName: 'Ana' } }],
      characters: [{ id: 'c1', name: 'Mira', userId: 'u1' }],
      maps: [{ id: 'map-1', name: 'Cave' }],
    },
    currentMap: { id: 'map-1', width: 20, height: 20 },
    viewedMap: { id: 'map-1', width: 20, height: 20 },
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { emitMapChange: vi.fn() } }) }));
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

const api = vi.hoisted(() => ({ deleteToken: vi.fn(), listAssets: vi.fn() }));
vi.mock('@/services/api', () => ({ api, default: api }));

const goblin: Token = {
  id: 'goblin', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
  useGameStore.getState().setTokens([goblin], 'map-1');
});

describe('the Token Manager in Portuguese', () => {
  it('names its heading, the token types and the character choice', async () => {
    await inPortuguese(async () => {
      render(<TokenManager isOpen onClose={() => {}} />);
      expect(screen.getByRole('dialog', { name: 'Gerenciador de tokens' })).toBeInTheDocument();
      expect(screen.getByText('Tokens no mapa')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pequeno/Médio1×1' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Jogador' }));
      expect(screen.getByRole('option', { name: 'Sem personagem' })).toBeInTheDocument();
      expect(screen.queryByText('Token Manager')).toBeNull();
      expect(screen.queryByText('No character')).toBeNull();
    });
  });

  it('asks in Portuguese before removing a token', async () => {
    await inPortuguese(async () => {
      render(<TokenManager isOpen onClose={() => {}} />);
      await userEvent.click(screen.getByRole('button', { name: 'Remover Goblin do mapa' }));
      const dialog = await screen.findByRole('dialog', { name: 'Remover token' });
      expect(dialog).toHaveTextContent('Remover "Goblin" deste mapa?');
      expect(within(dialog).getByRole('button', { name: 'Remover' })).toBeInTheDocument();
    });
  });
});
