/**
 * Targeting mode: with a bar action picked (actionStore.pending), a click on a
 * token resolves the action against it instead of selecting or picking it up;
 * Esc and a right click cancel; empty ground does nothing. The harness is that
 * of MapCanvasKeyboard.test.tsx.
 */


import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';
import { mouse } from '@/test/pointer';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'GM' as string,
    currentMap: null as unknown,
    status: 'ACTIVE' as string,
    memberships: [] as Array<{ userId: string; role: string; user: { displayName: string } }>,
    characters: [] as Array<{ id: string; userId: string; name: string }>,
  };
  const handlers = new Map<string, Set<(data: never) => void>>();
  const sent: Array<[string, unknown]> = [];
  const updateToken = vi.fn();
  const raw = {
    on(event: string, fn: (data: never) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
      return raw;
    },
    off(event: string, fn: (data: never) => void) {
      handlers.get(event)?.delete(fn);
      return raw;
    },
    emit(event: string, payload: unknown) {
      sent.push([event, payload]);
      return raw;
    },
  };
  return {
    state,
    handlers,
    sent,
    raw,
    updateToken,
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
  const mapActions = (await import('@/test/viewedMapContext')).mapActionsFor(() => h.state.currentMap, (map) => h.set({ currentMap: map }));
  const setCurrentMap = (next: unknown) => {
    h.set({ currentMap: typeof next === 'function' ? (next as (p: unknown) => unknown)(h.state.currentMap) : next });
  };
  const noop = () => undefined;
  const campaign = {
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false,
    get characters() { return h.state.characters; },
    get status() { return h.state.status; },
    get memberships() { return h.state.memberships; },
  };
  return {
    useCampaign: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return {
        currentMap: h.state.currentMap,
        viewedMap: h.state.currentMap,
        setCurrentMap,
        ...mapActions,
        userRole: h.state.userRole,
        campaign,
        updateCampaignSpiritLayer: noop,
        gmViewBothPlanes: false,
        playerSpiritVisible: false,
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
  const record = (event: string) => (payload: unknown) => { h.sent.push([event, payload]); };
  const client = new Proxy({
    getSocket: () => h.raw,
    emitTokenMoveStart: record('token.move.start'),
    emitTokenMove: record('token.move'),
    emitTokenMoveEnd: record('token.move.end'),
    emitMapPing: record('map.ping'),
    onMapChanged: (cb: (data: never) => void) => { h.raw.on('map.changed', cb); },
    onTokenMoved: (cb: (data: never) => void) => { h.raw.on('token.moved', cb); },
    onServerRefusal: (cb: (data: never) => void) => { h.raw.on('error', cb); },
    off: (event: string, cb: (data: never) => void) => { h.raw.off(event, cb); },
  } as Record<string, unknown>, {
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
  default: { updateMap: vi.fn(), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));

vi.mock('@/services/actions.service', () => ({ actionsService: { resolve: vi.fn(), list: vi.fn(), undo: vi.fn(), concentration: vi.fn() } }));
vi.mock('@/services/api', () => {
  const client = new Proxy({}, {
    get: (_target, prop: string) => (prop === 'updateToken' ? h.updateToken : vi.fn().mockResolvedValue({})),
  });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';
import { useActionStore } from '@/stores/actionStore';
import type { ActionOption } from '@/types/actions';

function mapNamed(id: string, extra: Partial<CampaignMap> = {}): CampaignMap {
  return {
    id,
    campaignId: 'campaign-1',
    name: `Map ${id}`,
    imageUrl: '/api/assets/maps/x',
    width: 20,
    height: 20,
    gridSize: 50,
    tokens: [],
    wallSegments: [],
    lights: [],
    fogEnabled: false,
    lightingEnabled: false,
    globalIllumination: true,
    explorationEnabled: false,
    ...extra,
  } as unknown as CampaignMap;
}

/** A one-square token; grid y counts up from the bottom row, 0, to the top, 19. */
function token(id: string, name: string, x: number, y: number, extra: Partial<Token> = {}): Token {
  return {
    id, name, imageUrl: '', characterId: null, position: { x, y }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null, ...extra,
  } as unknown as Token;
}

const goblin = () => token('tok-goblin', 'Goblin', 0, 19);
const mine = (x = 2, y = 10) => token('tok-mine', 'Aldra', x, y, { type: TokenType.PLAYER, controlledBy: 'me' });

/** The centre of square (x, y) on screen, at 100% and no pan. */
const at = (x: number, y: number) => ({ clientX: x * 50 + 10, clientY: (19 - y) * 50 + 10 });

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

function sentOf(event: string): unknown[] {
  return h.sent.filter(([e]) => e === event).map(([, p]) => p);
}

/** Tokens on the map on screen, as the page holds them once that map has loaded. */
function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens, (h.state.currentMap as { id?: string } | null)?.id ?? null); });
}

function click(point: { clientX: number; clientY: number }) {
  mouse.down(surface(), point);
  mouse.up(surface(), point);
}

const selected = () => useGameStore.getState().selectedTokenId;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  h.updateToken.mockReset().mockResolvedValue({});
  act(() => {
    useGameStore.getState().clearGameState();
  });
  h.set({ userRole: 'GM', status: 'ACTIVE', memberships: [], characters: [], currentMap: mapNamed('map-a') });
});

afterEach(() => {
  vi.useRealTimers();
});

const sword: ActionOption = { id: 'weapon:sword', name: 'Sword', group: 'attack', resolution: 'attack', reach: { kind: 'feet', normal: 5 } };
let resolvePending: ReturnType<typeof vi.fn>;

function arm() {
  resolvePending = vi.fn().mockResolvedValue({ ok: true });
  act(() => {
    useActionStore.setState({ pending: { actorTokenId: 'tok-mine', option: sword }, resolvePending } as never);
  });
}

describe('targeting mode', () => {
  beforeEach(() => {
    act(() => { useActionStore.setState({ pending: null, concentrationConfirm: null, lastError: null }); });
  });

  it('a click on a token resolves against it and neither selects nor picks it up', () => {
    render(<MapCanvas />);
    show(mine(), goblin());
    arm();

    click(at(0, 19));

    expect(resolvePending).toHaveBeenCalledWith('tok-goblin');
    expect(selected()).toBeNull();
    expect(sentOf('token.move.start')).toEqual([]);
  });

  it('a click on empty ground does nothing: it keeps the action and selects nothing', () => {
    render(<MapCanvas />);
    show(mine(), goblin());
    arm();

    click(at(10, 5));

    expect(resolvePending).not.toHaveBeenCalled();
    expect(useActionStore.getState().pending).not.toBeNull();
    expect(selected()).toBeNull();
  });

  it('Escape cancels the pending action', () => {
    render(<MapCanvas />);
    show(mine(), goblin());
    arm();
    act(() => { useActionStore.setState({ cancel: () => useActionStore.setState({ pending: null }) } as never); });

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(useActionStore.getState().pending).toBeNull();
  });

  it('a right click cancels it and opens no menu', () => {
    render(<MapCanvas />);
    show(mine(), goblin());
    arm();
    act(() => { useActionStore.setState({ cancel: () => useActionStore.setState({ pending: null }) } as never); });

    fireEvent.contextMenu(surface(), at(0, 19));

    expect(useActionStore.getState().pending).toBeNull();
    expect(screen.queryByText('Roll...')).not.toBeInTheDocument();
  });

  it('the cursor is a crosshair while targeting', () => {
    render(<MapCanvas />);
    show(mine(), goblin());
    arm();
    expect(surface().className).toContain('cursor-crosshair');
  });
});
