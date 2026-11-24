/**
 * What a browser pass in Portuguese still found in English during play: the
 * skip link, the connection state, Campaign Info (and the About window it
 * opens, and the way out of the campaign), the session and vibe panels, a
 * roll in the dice log, the sheet windows, the roll mode, a modal's close
 * button, an action sheet's Cancel, the tool stack's handle and the
 * keyboard shortcuts window.
 */

import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createRef } from 'react';
import { inPortuguese } from '@/test/inPortuguese';
import { CampaignRole } from '@/types';
import type { Character, CampaignMembership, DiceRolledEvent } from '@/types';

const state = vi.hoisted(() => ({
  role: 'PLAYER' as string,
  status: 'ACTIVE' as string,
  session: null as null | { id: string; sessionNumber: number; startedAt: string },
  currentVibe: null as string | null,
  vibeOn: true,
  ws: 'connected' as string,
  me: 'player-1',
}));

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: {
      id: 'c1', name: 'A Coroa Afundada', status: state.status, ownerId: 'owner-1', memberships: [], createdAt: '2026-10-01T00:00:00.000Z',
      vibeSettings: { enabled: state.vibeOn, periods: [{ name: 'Dawn', hue: '#ff9966', filter: 'none' }, { name: 'Night', hue: '#223366', filter: 'none' }] },
    },
    userRole: state.role,
    activeSession: state.session,
    currentVibe: state.currentVibe,
    setActiveSession: vi.fn(),
    updateCampaignStatus: vi.fn(),
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: state.me, platformRole: 'USER' } }),
  useOptionalAuth: () => ({ user: { id: state.me, platformRole: 'USER' } }),
  AuthProvider: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ status: state.ws, error: null, reconnect: vi.fn(), socket: { emitVibeUpdate: vi.fn() } }),
  useOptionalWebSocket: () => ({ socket: { rollDice: vi.fn(), emitHitDiceSpend: vi.fn(), on: vi.fn(), off: vi.fn() } }),
}));
vi.mock('@/services/api', () => {
  const client = { leaveCampaign: vi.fn(), checkSetupStatus: vi.fn(() => new Promise(() => undefined)), getRegistrationStatus: vi.fn(() => new Promise(() => undefined)), getUser: vi.fn() };
  return { api: client, default: client };
});
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/components/common/ToastContainer', () => ({ default: () => null }));
vi.mock('../InvitePlayerModal', () => ({ default: () => null }));
vi.mock('@/components/character-sheets/fifth-edition/FifthEditionCharacterView', () => ({
  FifthEditionCharacterView: () => <p>Ficha</p>,
}));

import App from '@/App';
import ConnectionStatus from '@/components/ConnectionStatus';
import CampaignInfo from '../CampaignInfo';
import LeaveCampaign from '../LeaveCampaign';
import VibeTracker from '../VibeTracker';
import SessionControls from '../SessionControls';
import DiceResult from '../DiceResult';
import GmToolPanelContainer from '../GmToolPanelContainer';
import ShortcutsPanel from '../ShortcutsPanel';
import ActionSheet from '../compact/ActionSheet';
import Modal from '@/components/ui/Modal';
import CharacterSheetViewerModal from '@/components/character/CharacterSheetViewerModal';
import CharacterSheetEditorModal from '@/components/character/CharacterSheetEditorModal';
import { RollModeControl } from '@/components/character-sheets/RollModeControl';
import { rollTarget } from '@/components/character-sheets/useSheetRolls';
import { fantasyD20Character } from '@/components/character-sheets/fantasy-d20/__tests__/fantasyD20Fixture';

beforeEach(() => {
  state.role = 'PLAYER';
  state.status = 'ACTIVE';
  state.session = null;
  state.currentVibe = null;
  state.vibeOn = true;
  state.ws = 'connected';
  state.me = 'player-1';
});
afterEach(cleanup);

const roll = (over: Partial<DiceRolledEvent> = {}): DiceRolledEvent => ({
  id: 'r1', userId: 'u1', userName: 'Mara', characterName: 'Bramble', expression: '1d20+5', result: 25, purpose: 'Teste de Força',
  timestamp: new Date().toISOString(), secret: true,
  breakdown: {
    expression: '1d20+5', formula: '20 + 5', total: 25,
    rolls: [{ type: 'dice', notation: '1d20', count: 1, sides: 20, results: [20], kept: [20], total: 20 }, { type: 'modifier', value: 5 }],
  },
  ...over,
});

it('the skip link', async () => {
  await inPortuguese(() => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo principal' })).toBeInTheDocument();
  });
});

it('the connection state, in each of its states', async () => {
  await inPortuguese(() => {
    render(<ConnectionStatus />);
    expect(screen.getByText('Conectado')).toBeInTheDocument();
    cleanup();
    state.ws = 'connecting';
    render(<ConnectionStatus />);
    expect(screen.getByText('Conectando...')).toBeInTheDocument();
    cleanup();
    state.ws = 'error';
    render(<ConnectionStatus />);
    expect(screen.getByText('Erro de conexão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    cleanup();
    state.ws = 'disconnected';
    render(<ConnectionStatus />);
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
  });
});

it("Campaign Info, a player's and the GM's, and the About window it opens", async () => {
  await inPortuguese(() => {
    render(<CampaignInfo onLeft={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Informações da campanha' })).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Mestre:')).toBeInTheDocument();
    expect(screen.getByText('Membros:')).toBeInTheDocument();
    expect(screen.getByText('Sua função:')).toBeInTheDocument();
    expect(screen.getByText('Sua função:').nextElementSibling?.textContent).toBe('Jogador');
    expect(screen.getByRole('button', { name: 'Sair da campanha' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sobre o CozyVTT' }));
    expect(screen.getByRole('dialog', { name: 'Sobre o CozyVTT' })).toBeInTheDocument();
    cleanup();

    state.role = 'GM';
    state.me = 'gm-1';
    render(<CampaignInfo onLeft={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Convidar jogador' })).toBeInTheDocument();
    expect(screen.getByText(/passe antes o lugar de mestre/)).toBeInTheDocument();
  });
});

it('Leave Campaign and its question', async () => {
  await inPortuguese(() => {
    render(<LeaveCampaign campaign={{ id: 'c1', name: 'A Coroa Afundada', ownerId: 'owner-1' }} userRole={CampaignRole.PLAYER} onLeft={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair da campanha' }));
    const dialog = screen.getByRole('dialog', { name: 'Sair de A Coroa Afundada?' });
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    cleanup();

    state.me = 'owner-1';
    render(<LeaveCampaign campaign={{ id: 'c1', name: 'A Coroa Afundada', ownerId: 'owner-1' }} userRole={CampaignRole.PLAYER} onLeft={vi.fn()} />);
    expect(screen.getByText(/Você é o dono desta campanha/)).toBeInTheDocument();
  });
});

it("the vibe tracker, the player's and the GM's", async () => {
  await inPortuguese(() => {
    render(<VibeTracker />);
    expect(screen.getByRole('heading', { name: 'Clima da cena' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum clima definido')).toBeInTheDocument();
    expect(screen.getByText('Aguardando o mestre montar a cena...')).toBeInTheDocument();
    cleanup();

    state.role = 'GM';
    state.currentVibe = 'Night';
    render(<VibeTracker />);
    expect(screen.getByTitle('Definir o clima como Amanhecer')).toBeInTheDocument();
    expect(screen.getAllByText('Noite').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Configurar períodos' })).toBeInTheDocument();
  });
});

it('the GM session controls', async () => {
  await inPortuguese(() => {
    state.role = 'GM';
    state.session = { id: 's1', sessionNumber: 2, startedAt: new Date().toISOString() };
    render(<SessionControls />);
    expect(screen.getByRole('heading', { name: 'Controles da sessão' })).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pausar sessão' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Encerrar sessão' })).toBeInTheDocument();
  });
});

it('a roll in the dice log: who rolled, the time and the critical labels', async () => {
  await inPortuguese(() => {
    render(<DiceResult roll={roll()} isCurrentUser rollerIsGM={false} />);
    expect(screen.getByText('(você rolou)')).toBeInTheDocument();
    expect(screen.getByText('agora há pouco')).toBeInTheDocument();
    expect(screen.getByText('🎉 SUCESSO CRÍTICO!')).toBeInTheDocument();
    cleanup();

    render(<DiceResult roll={roll({ timestamp: new Date(Date.now() - 5 * 60000).toISOString() })} isCurrentUser={false} rollerIsGM />);
    expect(screen.getByText('(o mestre rolou)')).toBeInTheDocument();
    expect(screen.getByText('há 5min')).toBeInTheDocument();
    cleanup();

    render(<DiceResult roll={roll()} isCurrentUser={false} dense />);
    expect(screen.getByText('(rolado por Mara)')).toBeInTheDocument();
    expect(screen.getByText('Sucesso crítico!')).toBeInTheDocument();
    cleanup();

    const fumble = roll({
      secret: false,
      breakdown: { expression: '1d20', formula: '1', total: 1, rolls: [{ type: 'dice', notation: '1d20', count: 1, sides: 20, results: [1], kept: [1], total: 1 }] },
    });
    render(<DiceResult roll={fumble} isCurrentUser dense />);
    expect(screen.getByText('Falha crítica!')).toBeInTheDocument();
  });
});

const sheetCharacter = {
  id: 'char-1', userId: 'wenna-id', name: 'Aldra', gameSystem: 'FIFTH_EDITION', data: {}, campaignId: 'camp-1',
  updatedAt: '2026-01-01T00:00:00.000Z', user: { id: 'wenna-id', displayName: 'Wenna', avatarUrl: null },
} as unknown as Character;
const gm = { userId: 'dm', campaignId: 'camp-1', role: 'GM', characterIds: [] } as unknown as CampaignMembership;

it('the sheet viewer and the roll mode it offers', async () => {
  await inPortuguese(() => {
    state.me = 'dm';
    render(<CharacterSheetViewerModal character={sheetCharacter} campaignId="camp-1" membership={gm} onClose={() => {}} />);
    expect(screen.getByText('Jogador: Wenna')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar janela' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    expect(screen.getByText(/Você está vendo o personagem de/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Modo de rolagem' })).toBeInTheDocument();
  });
});

it('the sheet editor window', async () => {
  await inPortuguese(async () => {
    render(<CharacterSheetEditorModal character={fantasyD20Character()} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /^Editar ficha do personagem: / })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar janela' })).toBeInTheDocument();
  });
});

it('the roll mode control and the title that says how to roll with a mode', async () => {
  await inPortuguese(() => {
    render(<RollModeControl mode="normal" onChange={() => {}} gameSystem="FIFTH_EDITION" />);
    expect(screen.getByRole('group', { name: 'Modo de rolagem' })).toBeInTheDocument();
    expect(rollTarget('1d20', 'x', 'FIFTH_EDITION').title).toBe('Clique: rolar  |  Clique direito ou toque e segure: Vantagem / Desvantagem');
  });
});

it("a modal's close button", async () => {
  await inPortuguese(() => {
    render(<Modal open onClose={() => {}} title="Teste">corpo</Modal>);
    expect(screen.getByRole('button', { name: 'Fechar janela' })).toBeInTheDocument();
  });
});

it("an action sheet's Cancel", async () => {
  await inPortuguese(() => {
    render(<ActionSheet open title="Goblin" items={[]} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});

it("the tool stack's handle", async () => {
  await inPortuguese(() => {
    render(<GmToolPanelContainer containerRef={createRef<HTMLDivElement>()}><p>Névoa</p></GmToolPanelContainer>);
    expect(screen.getByTitle('Arraste para mover os painéis; clique duas vezes para devolvê-los ao canto')).toBeInTheDocument();
  });
});

it('the keyboard shortcuts window', async () => {
  await inPortuguese(() => {
    render(<ShortcutsPanel open onClose={() => undefined} role="GM" />);
    const dialog = screen.getByRole('dialog', { name: 'Atalhos de teclado' });
    expect(within(dialog).getByText('No mapa')).toBeInTheDocument();
    expect(within(dialog).getByText('Mover o token selecionado uma casa')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Setas', { selector: 'kbd' }).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Paredes e desfazer, só para o mestre')).toBeInTheDocument();
  });
});

