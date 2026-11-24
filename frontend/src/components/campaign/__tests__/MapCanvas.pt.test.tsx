/**
 * The map's own buttons in Portuguese: the zoom pair and Ping, drawn by
 * MapCanvas itself. The stand-ins are MapCanvasNoTokenHint.test.tsx's.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import type { CampaignMap } from '@/types';

const h = vi.hoisted(() => {
  const raw = { on() { return raw; }, off() { return raw; }, emit() { return raw; } };
  return { raw, state: { currentMap: null as unknown } };
});

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', async () => {
  const mapActions = (await import('@/test/viewedMapContext')).mapActionsFor(() => h.state.currentMap, () => undefined);
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', status: 'ACTIVE', characters: [], maps: [{ id: 'map-a', name: 'Map A' }], memberships: [] };
  return {
    useCampaign: () => ({
      currentMap: h.state.currentMap, viewedMap: h.state.currentMap, setCurrentMap: noop, ...mapActions,
      userRole: 'PLAYER', campaign, updateCampaignSpiritLayer: noop, gmViewBothPlanes: false, playerSpiritVisible: false,
      setPlayerSpiritVisible: noop, activeVibeEffect: null, updateVibe: noop, activeAtmosphereEffect: null, characterHpCache: {},
    }),
  };
});
vi.mock('@/contexts/WebSocketContext', () => {
  const client = new Proxy({ getSocket: () => h.raw } as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return () => () => undefined;
    },
  });
  return { useWebSocket: () => ({ socket: client, joinedEpoch: 1, status: 'connected', reconnectCount: 0 }) };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
vi.mock('@/services/map.service', () => ({
  default: { updateMap: vi.fn().mockResolvedValue({}), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));
vi.mock('@/services/api', () => {
  const client = new Proxy({}, { get: () => vi.fn().mockResolvedValue({}) });
  return { api: client, default: client };
});

import MapCanvasOnly from '../MapCanvas';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { useGameStore } from '@/stores/gameStore';

const map = {
  id: 'map-a', campaignId: 'campaign-1', name: 'Map A', imageUrl: '/api/assets/maps/x', width: 20, height: 20, gridSize: 50,
  tokens: [], wallSegments: [], lights: [], fogEnabled: false, lightingEnabled: false, globalIllumination: true, explorationEnabled: false,
} as unknown as CampaignMap;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  act(() => { useGameStore.getState().clearGameState(); });
  h.state.currentMap = map;
});

describe('the map in Portuguese', () => {
  it('names the zoom buttons, Ping and the map itself', async () => {
    await inPortuguese(() => {
      render(<LayoutProvider compact={false}><MapCanvasOnly /></LayoutProvider>);
      expect(screen.getByRole('button', { name: 'Aproximar' })).toHaveAttribute('title', 'Aproximar');
      expect(screen.getByRole('button', { name: 'Afastar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sinalizar' }).getAttribute('title')).toMatch(/^Sinalizar: toque ou clique no mapa/);
      expect(screen.getByRole('button', { name: 'Ajustar à tela' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Zoom In' })).toBeNull();
    });
  });
});
