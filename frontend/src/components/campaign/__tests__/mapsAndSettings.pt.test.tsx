/**
 * The map library, the two map modals and the campaign settings, in Portuguese.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import type { Campaign, CampaignMap } from '@/types';

let current: Campaign;
const campaignApi = vi.hoisted(() => ({
  listCampaignInvitations: vi.fn().mockResolvedValue({ invitations: [] }),
  getCampaignBooks: () => Promise.resolve([]),
  getAssetUrl: (id: string) => `/api/assets/maps/${id}`,
  getAssetThumbnailUrl: (id: string) => `/api/assets/maps/${id}/thumbnail`,
  listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: {} }),
}));
vi.mock('@/services/api', () => ({ default: campaignApi, api: campaignApi }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: current, refreshCampaign: vi.fn(), userRole: 'GM', currentMap: null, viewedMap: null,
    isPreparing: false, updateMap: () => {}, openToPrepare: () => Promise.resolve(true),
    mayChangeViewedMap: () => Promise.resolve(true), upsertCampaignMap: () => {}, removeCampaignMap: () => {},
  }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/services/campaign.service', () => ({ default: { updateCampaign: vi.fn(), deleteCampaign: vi.fn() } }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/services/map.service', () => ({ default: { createMap: vi.fn(), updateMap: vi.fn(), getMaps: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/utils/detectMapGrid', () => ({ detectMapGrid: vi.fn().mockResolvedValue(null) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: ({ label }: { label: string }) => <span>{label}</span> }));

import CampaignSettingsModal from '../CampaignSettingsModal';
import CreateMapModal from '../CreateMapModal';
import EditMapModal from '../EditMapModal';
import MapManager from '../MapManager';

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
});

const map = {
  id: 'map-1', campaignId: 'c1', name: 'Cave', imageUrl: '', width: 10, height: 10, gridSize: 50, tokens: [],
} as unknown as CampaignMap;

describe('maps and campaign settings in Portuguese', () => {
  it('shows the Map Library in Portuguese', async () => {
    current = { id: 'c1', name: 'A Cripta', memberships: [], ownerId: 'dm', currentMapId: null } as unknown as Campaign;
    await inPortuguese(async () => {
      render(<MapManager isOpen onClose={() => undefined} />);
      expect(await screen.findByText('Biblioteca de mapas')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Criar mapa/ }).length).toBeGreaterThan(0);
      expect(screen.getByText('Importar UVTT')).toBeInTheDocument();
      expect(await screen.findByText('Ainda não há mapas')).toBeInTheDocument();
      expect(screen.queryByText('Map Library')).toBeNull();
      expect(screen.queryByText('Create Map')).toBeNull();
      expect(screen.queryByText('No maps yet')).toBeNull();
    });
  });

  it('shows Create Map in Portuguese', async () => {
    await inPortuguese(async () => {
      render(<CreateMapModal isOpen campaignId="c1" onClose={() => undefined} onCreated={() => undefined} />);
      expect(screen.getByRole('dialog', { name: 'Criar mapa' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Criar mapa' })).toBeInTheDocument();
      expect(screen.getByText('Nome do mapa')).toBeInTheDocument();
      expect(screen.getByText('Padrão de 5E')).toBeInTheDocument();
      expect(screen.queryByText('Map Name')).toBeNull();
      expect(screen.queryByText('Grid Settings')).toBeNull();
    });
  });

  it('shows Edit Map in Portuguese', async () => {
    await inPortuguese(async () => {
      render(<EditMapModal isOpen map={map} campaignId="c1" onClose={() => undefined} onUpdated={() => undefined} />);
      expect(screen.getByRole('dialog', { name: 'Editar mapa' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
      expect(screen.getByText('Iluminação e névoa')).toBeInTheDocument();
      expect(screen.queryByText('Save Changes')).toBeNull();
      expect(screen.queryByText('Lighting and Fog')).toBeNull();
    });
  });

  it('shows the campaign settings in Portuguese', async () => {
    current = { id: 'c1', name: 'A Cripta', description: '', chatCooldownEnabled: false, chatCooldownSeconds: 0, memberships: [], userRole: 'GM', ownerId: 'dm' } as unknown as Campaign;
    await inPortuguese(async () => {
      render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
      expect(screen.getByText('Configurações da campanha')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Salvar alterações/ })).toBeInTheDocument();
      expect(screen.getByText('Nome da campanha')).toBeInTheDocument();
      expect(screen.getByText('Jogadores podem desenhar')).toBeInTheDocument();
      expect(screen.queryByText('Campaign Settings')).toBeNull();
      expect(screen.queryByText('Players may draw')).toBeNull();
    });
  });
});

describe('confirm dialogs and the grid preview in Portuguese', () => {
  it('shows Cancelar on the delete-map confirm', async () => {
    current = { id: 'c1', name: 'A Cripta', memberships: [], ownerId: 'dm', currentMapId: null } as unknown as Campaign;
    const maps = await import('@/services/map.service');
    (maps.default.getMaps as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([map]);
    await inPortuguese(async () => {
      render(<MapManager isOpen onClose={() => undefined} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Excluir mapa' }));
      expect(await screen.findByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.queryByText('Cancel')).toBeNull();
    });
  });

  it('labels the grid preview in Portuguese', async () => {
    await inPortuguese(async () => {
      render(<CreateMapModal isOpen campaignId="c1" onClose={() => undefined} onCreated={() => undefined} />);
      expect(screen.getByLabelText('Prévia do alinhamento da grade')).toBeInTheDocument();
      expect(screen.queryByLabelText('Grid alignment preview')).toBeNull();
    });
  });
});
