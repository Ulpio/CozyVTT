/**
 * A row tapped in the initiative column asks the map to centre on its token
 * (requestCentreOn). The stand-ins are MapCanvasNoTokenHint.test.tsx's; the
 * view is read from useMapControls, wrapped to keep its latest return.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';

const controls = vi.hoisted(() => ({ current: null as null | { zoom: number; panOffset: { x: number; y: number } } }));

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'PLAYER' as string,
    currentMap: null as unknown,
    spiritLayerEnabled: false,
    playerSpiritVisible: false,
    memberships: [] as Array<{ userId: string; role: string; user: { displayName: string } }>,
  };
  const raw = {
    on() { return raw; },
    off() { return raw; },
    emit() { return raw; },
  };
  return {
    state,
    raw,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    snapshot: () => version,
    set(patch: Partial<typeof state>) {
      Object.assign(state, patch);
      version += 1;
      listeners.forEach((l) => l());
    },
  };
});

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const mapActions = (await import('@/test/viewedMapContext')).mapActionsFor(() => h.state.currentMap, () => undefined);
  const noop = () => undefined;
  const campaign = {
    id: 'campaign-1', name: 'Test', status: 'ACTIVE', characters: [], maps: [{ id: 'map-a', name: 'Map A' }],
    get spiritLayerEnabled() { return h.state.spiritLayerEnabled; },
    get memberships() { return h.state.memberships; },
  };
  return {
    useCampaign: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return {
        currentMap: h.state.currentMap,
        viewedMap: h.state.currentMap,
        setCurrentMap: noop,
        ...mapActions,
        userRole: h.state.userRole,
        campaign,
        updateCampaignSpiritLayer: noop,
        gmViewBothPlanes: false,
        playerSpiritVisible: h.state.playerSpiritVisible,
        setPlayerSpiritVisible: noop,
        activeVibeEffect: null,
        updateVibe: noop,
        activeAtmosphereEffect: null,
        characterHpCache: {},
      };
    },
  };
});

vi.mock('@/contexts/WebSocketContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const client = new Proxy({ getSocket: () => h.raw } as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return () => () => undefined;
    },
  });
  return {
    useWebSocket: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return { socket: client, joinedEpoch: 1, status: 'connected', reconnectCount: 0 };
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }),
}));

vi.mock('@/services/map.service', () => ({
  default: { updateMap: vi.fn().mockResolvedValue({}), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));

vi.mock('@/services/api', () => {
  const client = new Proxy({}, { get: () => vi.fn().mockResolvedValue({}) });
  return { api: client, default: client };
});

vi.mock('@/hooks/useMapControls', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/useMapControls')>();
  return {
    ...real,
    useMapControls: (config: Parameters<typeof real.useMapControls>[0]) => {
      const value = real.useMapControls(config);
      controls.current = value;
      return value;
    },
  };
});

import MapCanvasOnly from '../MapCanvas';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { useGameStore } from '@/stores/gameStore';


function mapWith(extra: Partial<CampaignMap> = {}): CampaignMap {
  return {
    id: 'map-a',
    campaignId: 'campaign-1',
    name: 'Map A',
    imageUrl: '/api/assets/maps/x',
    width: 20,
    height: 20,
    gridSize: 50,
    tokens: [],
    wallSegments: [],
    lights: [],
    fogEnabled: false,
    lightingEnabled: true,
    globalIllumination: false,
    explorationEnabled: false,
    ...extra,
  } as unknown as CampaignMap;
}

/** A one-square token on the material plane, controlled by nobody unless given. */
function token(id: string, extra: Partial<Token> = {}): Token {
  return {
    id, name: `Token ${id}`, imageUrl: '', characterId: null, position: { x: 2, y: 2 }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.PLAYER, conditions: [], rotation: 0, controlledBy: null,
    hp: null, showHpBar: false, ...extra,
  } as unknown as Token;
}

/** Tokens on the map, as the page holds them once it has loaded. */
function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens, 'map-a'); });
}

function MapCanvas() {
  return (
    <LayoutProvider compact={false}>
      <MapCanvasOnly />
    </LayoutProvider>
  );
}

const CANVAS = { width: 800, height: 600 };

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
  HTMLElement.prototype.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: CANVAS.width, bottom: CANVAS.height, ...CANVAS, toJSON: () => ({}),
  });
});

beforeEach(() => {
  act(() => { useGameStore.getState().clearGameState(); });
  h.set({
    userRole: 'PLAYER',
    currentMap: mapWith(),
    memberships: [
      { userId: 'dm', role: 'GM', user: { displayName: 'Dee' } },
      { userId: 'me', role: 'PLAYER', user: { displayName: 'Me' } },
    ],
  });
});

/** Where the token's centre is on the canvas, from the view the map is in. */
function screenCentre(t: Token) {
  const { zoom, panOffset } = controls.current!;
  const map = mapWith();
  const w = t.size?.width ?? 1;
  const hgt = t.size?.height ?? 1;
  return {
    x: (t.position.x + w / 2) * map.gridSize * zoom + panOffset.x,
    y: (map.height - t.position.y - hgt / 2) * map.gridSize * zoom + panOffset.y,
  };
}

describe('centring the map on a combatant', () => {
  it('puts a token on the current map at the canvas centre', () => {
    render(<MapCanvas />);
    const far = token('far', { position: { x: 10, y: 10 } });
    show(far);
    act(() => { useGameStore.getState().requestCentreOn('far'); });
    const at = screenCentre(far);
    expect(Math.abs(at.x - CANVAS.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(at.y - CANVAS.height / 2)).toBeLessThanOrEqual(1);
  });

  it('centres a multi-square token by its middle', () => {
    render(<MapCanvas />);
    const big = token('big', { position: { x: 3, y: 4 }, size: { width: 3, height: 3 } });
    show(big);
    act(() => { useGameStore.getState().requestCentreOn('big'); });
    const at = screenCentre(big);
    expect(Math.abs(at.x - CANVAS.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(at.y - CANVAS.height / 2)).toBeLessThanOrEqual(1);
  });

  it('leaves the view alone for a token that is not on this map', () => {
    render(<MapCanvas />);
    show(token('here'));
    const before = { ...controls.current!.panOffset };
    act(() => { useGameStore.getState().requestCentreOn('elsewhere'); });
    expect(controls.current!.panOffset).toEqual(before);
  });

  it('leaves the view alone when the store holds the tokens of another map', () => {
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([token('there', { position: { x: 10, y: 10 } })], 'map-b'); });
    const before = { ...controls.current!.panOffset };
    act(() => { useGameStore.getState().requestCentreOn('there'); });
    expect(controls.current!.panOffset).toEqual(before);
  });
});
