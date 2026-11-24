/**
 * The chat, the dice and the roll pickers in Portuguese, and the purposes a
 * Portuguese player's rolls go out with (the dice log is shared, so the
 * purpose is written in the roller's language when the roll is made).
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import { CampaignRole } from '@/types';
import type { CampaignMembership, ChatMessageAck, ChatMessageBroadcast, ChatMessageEvent, DiceMacro, DiceRollAck, DiceRollEvent, NpcStatBlock, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const membership = (userId: string, displayName: string, role: CampaignRole): CampaignMembership => ({
  id: `m-${userId}`, userId, campaignId: 'campaign-1', role, characterIds: [], joinedAt: '2026-10-01T00:00:00.000Z', user: { id: userId, displayName, avatarUrl: null },
});
const TABLE = [membership('me', 'Ash', CampaignRole.PLAYER), membership('dm', 'Dana', CampaignRole.GM), membership('mara', 'Mara', CampaignRole.PLAYER)];

vi.mock('framer-motion', () => ({
  useReducedMotionConfig: () => false,
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  } }),
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: TABLE, characters: [], chatCooldownEnabled: false } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Ash' } }) }));

const sendChatMessage = vi.fn<(data: ChatMessageEvent) => Promise<ChatMessageAck>>();
const rollDice = vi.fn<(roll: DiceRollEvent) => Promise<DiceRollAck>>();
const socket = {
  onChatMessage: (_fn: (data: ChatMessageBroadcast) => void) => undefined,
  onChatSystem: vi.fn(), onChatMessageUpdated: vi.fn(),
  onDiceRolled: vi.fn(), onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(),
  on: vi.fn(), off: vi.fn(),
  isConnected: () => true,
  sendChatMessage: (data: ChatMessageEvent) => sendChatMessage(data),
  rollDice: (roll: DiceRollEvent) => rollDice(roll),
};
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket, status: 'connected', reconnectCount: 0, joinedEpoch: 1 }),
}));
vi.mock('@/services/message.service', () => ({ getMessages: vi.fn().mockResolvedValue({ messages: [], pagination: { hasMore: false, nextCursor: null } }) }));
vi.mock('@/services/dice.service', () => ({ getDiceRolls: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/api', () => {
  const client = {
    listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }),
    createDiceMacro: vi.fn(), updateDiceMacro: vi.fn(), deleteDiceMacro: vi.fn(),
  };
  return { api: client, default: client };
});

import ChatPanel from '../ChatPanel';
import DiceRoller from '../DiceRoller';
import DiceMacroManager from '../DiceMacroManager';
import CharacterRollPicker from '../CharacterRollPicker';
import NpcRollPicker from '../NpcRollPicker';
import { getCharacterRolls } from '@/utils/characterRolls';
import { buildNpcRolls } from '@/utils/npcRolls';
import { applyRollMode } from '@/utils/rollModes';
import { attackPurpose, damagePurpose } from '@/utils/rollPurposes';
import ChatMessage from '../ChatMessage';
import { MessageType } from '@/types';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});
beforeEach(() => {
  sendChatMessage.mockReset().mockReturnValue(new Promise(() => {}));
  rollDice.mockReset().mockResolvedValue({ ok: true, id: 'r1' });
});

it('shows the chat panel in Portuguese', async () => {
  await inPortuguese(async () => {
    render(<ChatPanel />);
    const box = await screen.findByRole('textbox', { name: 'Mensagem do chat' });
    expect(box).toHaveAttribute('placeholder', 'Escreva uma mensagem…');
    const select = screen.getByRole('combobox', { name: 'Para' });
    expect(within(select).getAllByRole('option')[0]).toHaveTextContent('Todos');
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma mensagem ainda')).toBeInTheDocument();
    expect(screen.getByText('Enter envia, Shift+Enter quebra a linha')).toBeInTheDocument();
  });
});

it('words a /w refusal in Portuguese', async () => {
  await inPortuguese(async () => {
    render(<ChatPanel />);
    const box = await screen.findByRole('textbox', { name: 'Mensagem do chat' });
    fireEvent.change(box, { target: { value: '/w Zed oi' } });
    expect(screen.getByText('Ninguém nesta campanha se chama "Zed".')).toBeInTheDocument();
  });
});

it('shows a message row in Portuguese', async () => {
  await inPortuguese(async () => {
    const message = { id: 'm1', campaignId: 'campaign-1', userId: 'me', user: { id: 'me', displayName: 'Ash' }, type: MessageType.PLAYER, content: 'Oi', metadata: null, createdAt: new Date(Date.now() - 125_000).toISOString(), recipientId: null, recipient: null };
    render(<ChatMessage message={message} isCurrentUser notSentReason="falhou" onRetry={() => undefined} onDiscard={() => undefined} />);
    expect(screen.getByText(/\(Você\)/)).toBeInTheDocument();
    expect(screen.queryByText('há 2 minutos')).toBeNull();
    expect(screen.getByText('Não enviada: falhou')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    const { container } = render(<ChatMessage message={message} />);
    expect(within(container).getByText('há 2 minutos')).toBeInTheDocument();
  });
});

it('shows the dice roller in Portuguese', async () => {
  await inPortuguese(async () => {
    render(<DiceRoller />);
    expect(await screen.findByPlaceholderText('Personagem')).toBeInTheDocument();
    expect(screen.getByLabelText('Expressão de dados')).toBeInTheDocument();
    expect(screen.getByTitle('Rolagens salvas — adicionar, editar ou apagar')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma rolagem ainda. Role uns dados para começar!')).toBeInTheDocument();
  });
});

it('keeps the dice expression the player typed, and rolls it with the typed purpose', async () => {
  await inPortuguese(async () => {
    render(<DiceRoller />);
    fireEvent.change(await screen.findByLabelText('Expressão de dados'), { target: { value: '1d20+3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rolar' }));
    await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
    expect(rollDice.mock.calls[0][0]).toMatchObject({ expression: '1d20+3' });
  });
});

it('shows the saved rolls window in Portuguese', async () => {
  await inPortuguese(async () => {
    const macro: DiceMacro = { id: 'm1', userId: 'me', campaignId: 'campaign-1', name: 'Espada', expression: '1d20+5', characterName: 'Hobgoblin', purpose: 'Ataque', createdAt: '', updatedAt: '' };
    const { api } = await import('@/services/api');
    (api.listDiceMacros as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ macros: [macro] });
    render(<DiceMacroManager isOpen onClose={() => undefined} campaignId="campaign-1" initialExpression="" onMacrosChanged={() => undefined} />);
    await waitFor(() => expect(screen.getByText('como Hobgoblin, para Ataque')).toBeInTheDocument());
    expect(screen.getByText('Adicionar uma rolagem')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apagar Espada' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da rolagem')).toBeInTheDocument();
  });
});

const fifthSheet = {
  stats: { strength: { score: 16, modifier: 3 }, dexterity: { score: 10, modifier: 0 }, constitution: { score: 12, modifier: 1 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 10, modifier: 0 } },
  attacks: [{ name: 'Espada', attackBonus: 5, damageRoll: '1d8+3' }],
} as never;

it('builds a roll option in Portuguese for the player\'s own language', async () => {
  await inPortuguese(async () => {
    const rolls = getCharacterRolls('FIFTH_EDITION', fifthSheet);
    expect(rolls.abilities[0]).toMatchObject({ label: 'FOR +3', purpose: 'Teste de Força' });
    expect(rolls.combat.map((c) => c.purpose)).toEqual(['Ataque de Espada', 'Dano de Espada']);
    expect(attackPurpose('Adaga')).toBe('Ataque de Adaga');
    expect(damagePurpose('Adaga', 'A duas mãos')).toBe('Dano de Adaga (A duas mãos)');
    expect(applyRollMode('1d20+3', 'Teste de Força', 'advantage', 'FIFTH_EDITION').purpose).toBe('Teste de Força (Vantagem)');
  });
});

it('shows the character picker in Portuguese and rolls with a Portuguese purpose', async () => {
  await inPortuguese(async () => {
    const onRoll = vi.fn();
    const character = { id: 'c1', name: 'Aria', gameSystem: 'FIFTH_EDITION', data: fifthSheet } as never;
    render(<CharacterRollPicker character={character} onRoll={onRoll} onClose={() => undefined} anchorX={0} anchorY={0} />);
    expect(screen.getByText('Rolar para Aria')).toBeInTheDocument();
    expect(screen.getByText('Modo de rolagem')).toBeInTheDocument();
    expect(screen.getByText('Atributos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'FOR +3' }));
    expect(onRoll).toHaveBeenCalledWith('1d20+3', 'Teste de Força', 'Aria');
  });
});

it('shows the creature picker and its custom roll in Portuguese', async () => {
  await inPortuguese(async () => {
    const statBlock: NpcStatBlock = { ac: 15, hpMax: 7, speed: '30 ft.', abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, skills: {}, challengeRating: '1/4', actions: [{ name: 'Machadinha', description: 'Melee Weapon Attack: +3 to hit. Hit: 4 (1d6 + 1) slashing damage.' }] };
    const token = { id: 'g', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, type: TokenType.NPC, disposition: 'hostile', hp: null, showHpBar: false, notes: '', initiative: null, statBlock } as unknown as Token;
    const onRoll = vi.fn();
    render(<NpcRollPicker token={token} gameSystem="FIFTH_EDITION" onRoll={onRoll} onClose={() => undefined} anchorX={0} anchorY={0} />);
    expect(screen.getByText('Rolagem livre')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Machadinha (Ataque +3)' }));
    expect(onRoll).toHaveBeenCalledWith('1d20+3', 'Ataque de Machadinha', 'Goblin');
    expect(buildNpcRolls(statBlock, 'FIFTH_EDITION').abilities[0].purpose).toBe('Teste de Força');
  });
});
