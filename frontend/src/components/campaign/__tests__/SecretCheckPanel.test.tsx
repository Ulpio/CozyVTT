/**
 * The GM's secret check panel: who is ticked, what is sent, what comes back
 * and the private notice to a player.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const ability = (modifier: number) => ({ score: 10 + modifier * 2, modifier });
const sheet = (perception: boolean, extra: Record<string, unknown> = {}) => ({
  proficiencyBonus: 2, level: 3,
  stats: { strength: ability(3), dexterity: ability(1), constitution: ability(2), intelligence: ability(0), wisdom: ability(1), charisma: ability(0) },
  skills: { perception: { proficient: perception, expertise: false, bonus: 0, otherBonus: 0 } },
  ...extra,
});
const character = (id: string, name: string, userId: string, data: unknown, gameSystem = 'FIFTH_EDITION') =>
  ({ id, name, userId, gameSystem, data, campaignId: 'c1', tokenImageUrl: null, createdAt: '', updatedAt: '' });

const h = vi.hoisted(() => ({
  secretCheck: vi.fn(),
  sendNotice: vi.fn(),
  getCharacter: vi.fn(),
  noSocket: false,
}));

const CHARACTERS = [
  character('c-ana', 'Ana the Fighter', 'ana', sheet(true, { skills: { perception: { proficient: true, expertise: false, bonus: 0, otherBonus: 0 }, athletics: { proficient: true, expertise: false, bonus: 0, otherBonus: 0 } } })),
  character('c-bruno', 'Bruno the Wizard', 'bruno', sheet(false, { passivePerception: 14 })),
  character('c-npc', "GM's Hireling", 'dm', sheet(true)),
];
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: {
      id: 'c1',
      memberships: [{ userId: 'dm', role: 'GM' }, { userId: 'ana', role: 'PLAYER' }, { userId: 'bruno', role: 'PLAYER' }],
      characters: CHARACTERS.map(({ data: _d, ...rest }) => rest),
    },
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: h.noSocket ? null : { secretCheck: h.secretCheck, sendNotice: h.sendNotice }, isConnected: true }),
}));
vi.mock('@/services/api', () => ({ api: { getCharacter: h.getCharacter }, default: { getCharacter: h.getCharacter } }));

import SecretCheckPanel from '../SecretCheckPanel';
import i18n from 'i18next';

async function open2() {
  render(<SecretCheckPanel isOpen onClose={() => undefined} />);
  await screen.findByRole('checkbox', { name: 'Ana the Fighter' });
  await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
}

async function open() {
  render(<SecretCheckPanel isOpen onClose={() => undefined} />);
  await screen.findByRole('checkbox', { name: 'Ana the Fighter' });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Check' })).toBeEnabled());
}

beforeEach(() => {
  vi.clearAllMocks();
  h.noSocket = false;
  h.getCharacter.mockImplementation(async (id: string) => ({ character: CHARACTERS.find((c) => c.id === id) }));
  h.secretCheck.mockResolvedValue({
    ok: true,
    results: [
      { characterId: 'c-ana', total: 24, dice: [20], breakdown: '20 + 4' },
      { characterId: 'c-bruno', total: 2, dice: [1], breakdown: '1 + 1' },
    ],
  });
  h.sendNotice.mockResolvedValue({ ok: true });
});

async function rollPerception() {
  await open();
  fireEvent.click(screen.getByRole('checkbox', { name: "GM's Hireling" }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Check' }), { target: { value: 'skills|Perception' } });
  fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
  await screen.findByTestId('result-c-ana');
}

describe('rolling', () => {
  it('sends one secret check with a roll for each ticked character', async () => {
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: "GM's Hireling" }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Check' }), { target: { value: 'skills|Perception' } });
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    await waitFor(() => expect(h.secretCheck).toHaveBeenCalledTimes(1));
    expect(h.secretCheck).toHaveBeenCalledWith([
      { characterId: 'c-ana', expression: '1d20+3', purpose: 'Teste secreto: Perception', characterName: 'Ana the Fighter' },
      { characterId: 'c-bruno', expression: '1d20+1', purpose: 'Teste secreto: Perception', characterName: 'Bruno the Wizard' },
    ]);
  });

  it('rolls two dice in advantage and marks the die kept, a natural 20 among two included', async () => {
    h.secretCheck.mockResolvedValue({
      ok: true,
      results: [
        { characterId: 'c-ana', total: 20, dice: [3, 17], breakdown: '17 + 3' },
        { characterId: 'c-bruno', total: 21, dice: [20, 4], breakdown: '20 + 1' },
      ],
    });
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: "GM's Hireling" }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Check' }), { target: { value: 'skills|Perception' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Advantage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    await screen.findByTestId('result-c-ana');
    expect((h.secretCheck.mock.calls[0][0] as Array<{ expression: string }>)[0].expression).toBe('2d20kh1+3');
    expect(screen.getByTestId('result-c-ana')).toHaveTextContent('d20 17 + 3');
    expect(screen.getByTestId('result-c-ana')).not.toHaveTextContent('natural');
    expect(screen.getByTestId('result-c-bruno')).toHaveTextContent('natural 20');
  });

  it('says so when the answer has no result for a character that had the check', async () => {
    h.secretCheck.mockResolvedValue({ ok: true, results: [{ characterId: 'c-ana', total: 9, dice: [6], breakdown: '6 + 3' }] });
    await rollPerception();
    expect(screen.getByTestId('result-c-bruno')).toHaveTextContent('No result came back');
    expect(screen.getByTestId('result-c-bruno')).not.toHaveTextContent('Does not have this check');
  });

  it("shows each character's total from the answer, marking a natural 20 and a natural 1", async () => {
    await rollPerception();
    const ana = screen.getByTestId('result-c-ana');
    expect(within(ana).getByText('24')).toBeInTheDocument();
    expect(within(ana).getByText(/natural 20/)).toBeInTheDocument();
    expect(within(screen.getByTestId('result-c-bruno')).getByText(/natural 1/)).toBeInTheDocument();
  });

  it('says which characters do not have the check', async () => {
    h.secretCheck.mockResolvedValue({ ok: true, results: [{ characterId: 'c-ana', total: 12, dice: [8], breakdown: '8 + 5' }] });
    await open();
    fireEvent.change(screen.getByRole('combobox', { name: 'Check' }), { target: { value: 'skills|Athletics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    const bruno = await screen.findByTestId('result-c-bruno');
    expect(bruno).toHaveTextContent('Does not have this check');
    expect((h.secretCheck.mock.calls[0][0] as unknown[]).length).toBe(1);
  });

  it('says so when there is no connection', async () => {
    h.noSocket = true;
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not connected to the server.');
    expect(h.secretCheck).not.toHaveBeenCalled();
  });

  it("shows the server's refusal as it arrives", async () => {
    h.secretCheck.mockResolvedValue({ ok: false, error: 'Só o mestre pode fazer isso.' });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Só o mestre pode fazer isso.');
  });
});

it('names the check in the app language, in the select and in the purpose', async () => {
  await i18n.changeLanguage('pt-BR');
  try {
    await open2();
    expect(within(screen.getByRole('combobox')).getByRole('option', { name: 'Percepção' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'skills|Perception' } });
    fireEvent.click(screen.getByRole('checkbox', { name: "GM's Hireling" }));
    fireEvent.click(screen.getByRole('button', { name: 'Rolar' }));
    await waitFor(() => expect(h.secretCheck).toHaveBeenCalled());
    expect((h.secretCheck.mock.calls[0][0] as Array<{ purpose: string }>)[0].purpose).toBe('Teste secreto: Percepção');
  } finally {
    await i18n.changeLanguage('en');
  }
});

describe('passive Perception', () => {
  it("lists each 5e character's passive Perception, the stored one first", async () => {
    await open();
    const list = screen.getByRole('list', { name: 'Passive Perception' });
    expect(within(list).getByText('Ana the Fighter').closest('li')).toHaveTextContent('13');
    expect(within(list).getByText('Bruno the Wizard').closest('li')).toHaveTextContent('14');
  });
});

describe('notices', () => {
  it('sends the text to the character with Notify…', async () => {
    await rollPerception();
    fireEvent.click(within(screen.getByTestId('result-c-ana')).getByRole('button', { name: 'Notify…' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Notice for Ana the Fighter' }), { target: { value: 'You hear a growl.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(h.sendNotice).toHaveBeenCalledWith({ characterId: 'c-ana', text: 'You hear a growl.' }));
  });

  it('shows a refusal of the notice', async () => {
    h.sendNotice.mockResolvedValue({ ok: false, error: 'Esse personagem não tem jogador na mesa.' });
    await rollPerception();
    fireEvent.click(within(screen.getByTestId('result-c-ana')).getByRole('button', { name: 'Notify…' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Notice for Ana the Fighter' }), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Esse personagem não tem jogador na mesa.')).toBeInTheDocument();
  });

  it("offers no Notify… for the GM's own character, and says why", async () => {
    h.secretCheck.mockResolvedValue({ ok: true, results: [{ characterId: 'c-npc', total: 9, dice: [4], breakdown: '4 + 5' }] });
    await open();
    for (const name of ['Ana the Fighter', 'Bruno the Wizard']) fireEvent.click(screen.getByRole('checkbox', { name }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Check' }), { target: { value: 'skills|Perception' } });
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    const row = await screen.findByTestId('result-c-npc');
    expect(within(row).queryByRole('button', { name: 'Notify…' })).toBeNull();
    expect(within(row).getByText('This character has no player at the table.')).toBeInTheDocument();
  });
});
