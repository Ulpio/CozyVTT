/**
 * The initiative tracker, personal notes, session history, the end-session
 * box, the party column, the token roster and the invite box in Portuguese,
 * and the "joined" word of a whisper's label.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import { useGameStore } from '@/stores/gameStore';
import { CampaignRole, TokenLayer, TokenType } from '@/types';
import type { CampaignMembership, CombatantEntry, RosterMember, Token } from '@/types';
import { whisperTargets } from '@/utils/chatWhisper';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    userRole: 'GM',
    campaign: { id: 'c1', memberships: [] },
    currentMap: { id: 'map-1', width: 20, height: 20, tokens: [] },
    viewedMap: { id: 'map-1', width: 20, height: 20 },
    activeSession: null,
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitMapChange: vi.fn() }, isConnected: true }),
}));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: { smtp: { configured: true } } }) }));
vi.mock('@/services/api', () => {
  const client = {
    listSessions: vi.fn(), updateSessionNotes: vi.fn(),
    listNotes: vi.fn(), getNote: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
    getCampaignCharacters: vi.fn(),
    listInvitableUsers: vi.fn(), inviteUserToCampaign: vi.fn(),
  };
  return { api: client, default: client };
});

import api from '@/services/api';
import InitiativeTracker from '../InitiativeTracker';
import SessionHistory from '../SessionHistory';
import PersonalNotes from '../PersonalNotes';
import EndSessionModal from '../EndSessionModal';
import CampaignRoster from '../CampaignRoster';
import TokenRoster from '../TokenRoster';
import InvitePlayerModal from '../InvitePlayerModal';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const entry = (tokenId: string, name: string): CombatantEntry => ({
  tokenId, mapId: 'map-1', name, imageUrl: '', initiative: 12, hp: { current: 5, max: 9, temp: 0 }, type: 'npc', disposition: null, characterId: null,
});

const goblin: Token = {
  id: 'goblin', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: false, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  useGameStore.getState().setTokens([goblin], 'map-1');
  useGameStore.getState().setCombatState({
    spend: {}, active: false, round: 1, currentTokenId: null, combatants: [entry('a', 'Goblin'), entry('b', 'Orc')],
  });
});

it('shows the initiative tracker in Portuguese', async () => {
  await inPortuguese(() => {
    render(<InitiativeTracker />);
    expect(screen.getByText('Iniciativa')).toBeTruthy();
    expect(screen.getAllByTitle('Subir uma posição').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Remover da iniciativa').length).toBe(2);
    expect(screen.getByText('2 prontos')).toBeTruthy();
    expect(screen.getAllByText('PV 5/9', { exact: false }).length).toBe(2);
    expect(screen.getByRole('button', { name: 'Iniciativa de Goblin: 12. Editar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Iniciar combate/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Adicionar combatente/ })).toBeTruthy();
    expect(document.body.textContent).toContain('Arraste para reordenar · Clique num valor para editar · ');
  });
});

it('shows the past sessions in Portuguese', async () => {
  mocked.listSessions.mockResolvedValue({
    sessions: [{ id: 's1', sessionNumber: 2, startedAt: '2026-01-01T18:00:00.000Z', endedAt: '2026-01-01T22:00:00.000Z', notes: null }],
  });
  await inPortuguese(async () => {
    render(<SessionHistory />);
    expect(screen.getByRole('heading', { name: 'Sessões anteriores' })).toBeTruthy();
    expect(await screen.findByText('Sessão 2')).toBeTruthy();
    expect(screen.getByText('Nenhuma nota foi escrita.')).toBeTruthy();
    expect(screen.getByLabelText('Editar as notas da sessão 2')).toBeTruthy();
    expect(screen.getByLabelText('Atualizar as sessões anteriores')).toBeTruthy();
  });
});

it('shows the personal notes in Portuguese', async () => {
  mocked.listNotes.mockResolvedValue({ notes: [] });
  await inPortuguese(async () => {
    render(<PersonalNotes />);
    expect(screen.getByTitle('Nova nota')).toBeTruthy();
    expect(screen.getByLabelText('Escolha uma nota')).toBeTruthy();
    expect(await screen.findByText('Nenhuma nota ainda')).toBeTruthy();
  });
});

it('shows the end-session box in Portuguese', async () => {
  const started = new Date(Date.now() - (3600 + 1) * 1000).toISOString();
  await inPortuguese(() => {
    render(<EndSessionModal session={{ id: 's', sessionNumber: 4, startedAt: started }} onConfirm={vi.fn()} onClose={vi.fn()} isSubmitting={false} />);
    expect(screen.getByRole('button', { name: 'Encerrar sessão' })).toBeTruthy();
    expect(screen.getByText('Resumo da sessão')).toBeTruthy();
    expect(screen.getByText('1 hora 0 minutos')).toBeTruthy();
    expect(document.body.textContent).toContain('Sessão → Sessões anteriores');
  });
});

it('shows the party column in Portuguese', async () => {
  const member = (userId: string, userName: string, role: CampaignRole): RosterMember => ({
    userId, userName, userAvatar: null, role, joinedAt: '2026-10-01T00:00:00.000Z', characters: [],
  });
  mocked.getCampaignCharacters.mockResolvedValue({
    roster: [member('dm', 'Dana', CampaignRole.GM), member('p1', 'Ash', CampaignRole.PLAYER), member('s1', 'Lia', CampaignRole.SPECTATOR)],
  });
  await inPortuguese(async () => {
    render(<CampaignRoster />);
    expect(await screen.findByRole('heading', { name: 'Grupo da campanha' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Jogadores' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mestre' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Espectadores' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Ash está fora da sessão' })).toBeTruthy();
  });
});

it('shows the token roster in Portuguese', async () => {
  await inPortuguese(() => {
    render(<TokenRoster onEditToken={vi.fn()} />);
    expect(screen.getByText('Lista de tokens')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remover Goblin do mapa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar Goblin aos jogadores' })).toBeTruthy();
    expect(screen.getByText('(oculto)')).toBeTruthy();
  });
});

it('shows the invite box in Portuguese', async () => {
  mocked.listInvitableUsers.mockResolvedValue({ users: [], hasMore: false });
  await inPortuguese(async () => {
    render(<InvitePlayerModal campaignId="c1" onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('Convidar jogador')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar convite' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar pelo nome de exibição'), { target: { value: 'a' } });
    expect(await screen.findByText(/Ninguém chamado/, undefined, { timeout: 2000 })).toBeTruthy();
    await waitFor(() => expect(mocked.listInvitableUsers).toHaveBeenCalled());
  });
});

it('writes "joined" in Portuguese in a whisper label', async () => {
  const m = (userId: string, role: CampaignRole): CampaignMembership => ({
    id: `m-${userId}`, userId, campaignId: 'c1', role, characterIds: [], joinedAt: '2026-10-03T12:00:00.000Z',
    user: { id: userId, displayName: 'Mara', avatarUrl: null },
  });
  await inPortuguese(() => {
    // Same name and same role: the role does not tell them apart, the day joined does.
    const targets = whisperTargets([m('u1', CampaignRole.PLAYER), m('u2', CampaignRole.PLAYER)], []);
    expect(targets.get('u1')?.label).toMatch(/^Mara \(Jogador, entrou em .+\)$/);
  });
});
