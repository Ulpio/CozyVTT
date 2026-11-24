/**
 * The map and table messages that earlier tasks found outside their files, in
 * Portuguese: the selection announcement, the Quick Editor and its fields, the
 * picker's empty state, the transfer prompt, the notes placeholder, and the
 * messages kept in hooks and utilities.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, act, within, fireEvent } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';

const h = vi.hoisted(() => {
  const raw = { on() { return raw; }, off() { return raw; }, emit() { return raw; } };
  return { raw, state: { currentMap: null as unknown }, listNotes: vi.fn(), getNote: vi.fn() };
});

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
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', async () => {
  const mapActions = (await import('@/test/viewedMapContext')).mapActionsFor(() => h.state.currentMap, () => undefined);
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', status: 'ACTIVE', characters: [], maps: [{ id: 'map-a', name: 'Map A' }], memberships: [], gameSystem: 'FIFTH_EDITION' };
  return {
    useCampaign: () => ({
      currentMap: h.state.currentMap, viewedMap: h.state.currentMap, setCurrentMap: noop, ...mapActions,
      userRole: 'GM', campaign, updateCampaignSpiritLayer: noop, gmViewBothPlanes: false, playerSpiritVisible: false,
      setPlayerSpiritVisible: noop, activeVibeEffect: null, updateVibe: noop, activeAtmosphereEffect: null, characterHpCache: {},
    }),
    TableKeptMovingError: class TableKeptMovingError extends Error {},
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
vi.mock('@/components/assets/AssetUploadModal', () => ({ default: () => null }));
vi.mock('@/services/map.service', () => ({
  default: { updateMap: vi.fn().mockResolvedValue({}), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));
vi.mock('@/services/api', () => {
  const client = new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === 'listNotes') return h.listNotes;
      if (prop === 'getNote') return h.getNote;
      if (prop === 'listAssets') return vi.fn().mockResolvedValue({ assets: [], pagination: {} });
      return vi.fn().mockResolvedValue({});
    },
  });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import NpcQuickEditor from '../NpcQuickEditor';
import TokenVisionField from '../TokenVisionField';
import TokenTransferConfirmation from '../TokenTransferConfirmation';
import PersonalNotes from '../PersonalNotes';
import AssetPicker from '@/components/assets/AssetPicker';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { useGameStore } from '@/stores/gameStore';
import { AssetType } from '@/types';
import { signedOutNotSaved } from '@/utils/signedOut';
import { preparingEndedMessage } from '../PreparingBanner';
import { DrawnPictureRefused, uploadDrawnPicture } from '@/services/drawnPicture';

const map = {
  id: 'map-a', campaignId: 'campaign-1', name: 'Map A', imageUrl: '/api/assets/maps/x', width: 20, height: 20, gridSize: 50,
  tokens: [], wallSegments: [], lights: [], fogEnabled: false, lightingEnabled: false, globalIllumination: true, explorationEnabled: false,
} as unknown as CampaignMap;

const goblin: Token = {
  id: 'tok-goblin', name: 'Goblin', imageUrl: '', characterId: null, position: { x: 0, y: 19 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null, metadata: {},
  disposition: null, hp: { current: 7, max: 7, temp: 0 }, showHpBar: false, notes: '', initiative: null, obscured: false,
} as unknown as Token;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  act(() => { useGameStore.getState().clearGameState(); });
  h.state.currentMap = map;
});

describe('the map and table messages in Portuguese', () => {
  it('announces the selected token', async () => {
    await inPortuguese(() => {
      render(<LayoutProvider compact={false}><MapCanvas /></LayoutProvider>);
      act(() => {
        useGameStore.getState().setTokens([goblin], 'map-a');
        useGameStore.getState().selectToken('tok-goblin');
      });
      expect(screen.getByRole('status').textContent).toBe('Goblin selecionado, quadrado 0, 19');
    });
  });

  it('shows the darkvision field in Portuguese', async () => {
    await inPortuguese(() => {
      render(<TokenVisionField value={12} feetPerSquare={5} />);
      expect(screen.getByText('Visão no escuro')).toBeInTheDocument();
      expect(screen.getByLabelText('Visão no escuro em quadrados da grade')).toBeInTheDocument();
      expect(screen.getByText(/12 = 60 pés neste mapa/)).toBeInTheDocument();
    });
  });

  it('shows the Quick Editor and its condition toggles in Portuguese', async () => {
    await inPortuguese(() => {
      useGameStore.getState().setTokens([goblin]);
      render(<NpcQuickEditor token={goblin} campaignId="campaign-1" mapId="map-a" onClose={() => {}} onTokenUpdate={() => {}} />);
      const conditions = screen.getByRole('group', { name: 'Condições' });
      expect(within(conditions).getByRole('button', { name: 'Agarrado' })).toBeInTheDocument();
      expect(within(conditions).queryByRole('button', { name: 'Grappled' })).toBeNull();
      expect(screen.getByText('Pontos de vida')).toBeInTheDocument();
      expect(screen.getByText('Ações rápidas')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Esconder dos jogadores' })).toBeInTheDocument();
    });
  });

  it('shows the picker empty state in Portuguese', async () => {
    await inPortuguese(async () => {
      render(<AssetPicker label="Imagem" type={AssetType.MAP} selectedAssetId={null} onSelect={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: 'Procurar recursos' }));
      expect(await screen.findByText('Nenhum recurso encontrado. Envie um para começar.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Enviar novo/ })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Buscar recursos...')).toBeInTheDocument();
    });
  });

  it('shows the token transfer prompt in Portuguese', async () => {
    await inPortuguese(() => {
      const target = { id: 'm2', name: 'Cripta' } as unknown as CampaignMap;
      render(<TokenTransferConfirmation tokens={[goblin, { ...goblin, id: 'g2' }]} fromMap={{ name: 'Vila' }} targetMap={target} onConfirm={() => {}} onCancel={() => {}} isSwitching={false} />);
      expect(screen.getByText('Selecionar todos')).toBeInTheDocument();
      expect(screen.getByText('Selecionar nenhum')).toBeInTheDocument();
      expect(screen.getByText(/Vila, o mapa dos jogadores, tem 2 tokens/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Trocar de mapa' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    });
  });

  it('shows the notes placeholder in Portuguese', async () => {
    h.listNotes.mockResolvedValue({ notes: [{ id: 'n1', title: 'Primeira', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] });
    h.getNote.mockResolvedValue({ note: { id: 'n1', title: 'Primeira', content: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } });
    await inPortuguese(async () => {
      render(<PersonalNotes />);
      const picker = await screen.findByLabelText<HTMLSelectElement>('Escolha uma nota');
      await vi.waitFor(() => expect(picker.querySelector('option[value="n1"]')).not.toBeNull());
      fireEvent.change(picker, { target: { value: 'n1' } });
      const box = await screen.findByLabelText('Conteúdo da nota');
      expect(box).toHaveAttribute('placeholder', '# Título\n\n- uma lista\n- de coisas\n\n[um link](https://example.com)');
    });
  });

  it('says the sign-in ended and why a table move ended, in Portuguese', async () => {
    await inPortuguese(() => {
      expect(signedOutNotSaved()).toBe('Não salvo: você foi desconectado. Entre de novo em uma nova aba e depois aperte Salvar.');
      expect(preparingEndedMessage({ mapName: 'Cripta', reason: 'deleted' })).toBe('Cripta foi excluído, então você voltou ao mapa dos jogadores.');
    });
  });

  it('says why a drawn picture was refused, in Portuguese', async () => {
    await inPortuguese(async () => {
      const refused = await uploadDrawnPicture({ size: 200 * 1024 * 1024 } as Blob, 'campaign-1').catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(DrawnPictureRefused);
      expect((refused as Error).message).toMatch(/^Esta imagem tem 200,0 MB, acima do limite deste servidor de /);
    });
  });
});
