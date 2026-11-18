/** A bar action's card in the chat: a player's view, the GM's view, undo and concentration. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useGameStore } from '@/stores/gameStore';
import { MessageType, type Message } from '@/types';
import type { ActionCardView } from '@/types/actions';

const h = { role: 'PLAYER' as string, userId: 'u1' };
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: h.role, campaign: { id: 'camp-1', characters: [{ id: 'c1', userId: 'u1' }, { id: 'c2', userId: 'u2' }] }, currentMap: { id: 'map-1' } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.userId } }) }));
const undo = vi.fn();
const concentration = vi.fn();
const undoTarget = vi.fn();
const save = vi.fn();
const saveRemaining = vi.fn();
vi.mock('@/services/actions.service', () => ({
  actionsService: {
    undo: (...a: unknown[]) => undo(...a),
    concentration: (...a: unknown[]) => concentration(...a),
    undoTarget: (...a: unknown[]) => undoTarget(...a),
    save: (...a: unknown[]) => save(...a),
    saveRemaining: (...a: unknown[]) => saveRemaining(...a),
  },
}));

import ChatMessage from '../ChatMessage';

const playerCard = {
  kind: 'action', actor: { tokenId: 'a1', name: 'Mara' }, actionName: 'Longsword', mode: 'disadvantage', disadvantageReason: 'long-range',
  targets: [
    { tokenId: 'g1', name: 'Goblin', isCharacter: false, state: 'badly-wounded', attack: { d20s: [15, 3], natural: 3, total: 11, hit: true, critical: false }, damage: [{ total: 7, type: 'slashing', breakdown: '1d8+3' }] },
    { tokenId: 'x1', maskedName: 'something-invisible', isCharacter: false },
    { tokenId: 'c1t', name: 'Mara', isCharacter: true, hp: { current: 4, max: 12, temp: 2 }, concentrationCheckDc: 10 },
  ],
} as unknown as ActionCardView;

const gmCard = {
  kind: 'action', actor: { tokenId: 'a1', name: 'Mara', userId: 'u1' }, actionName: 'Longsword', mode: 'normal', extraText: 'Goblin bleeds',
  targets: [
    { tokenId: 'g1', name: 'Goblin', isCharacter: false, showHpBar: false, ac: 15, hitChance: 0.5774999999999999, hpBefore: 7, hpAfter: 0, hpMax: 7, attack: { d20s: [18], natural: 18, total: 22, hit: true, critical: false }, damage: [{ total: 7, type: 'slashing', breakdown: '1d8+3' }] },
    { tokenId: 'c1t', name: 'Mara', isCharacter: true, showHpBar: true, ac: 14, hpBefore: 9, hpAfter: 4, hpMax: 12, concentrationCheckDc: 10 },
  ],
  undo: { hp: [] },
} as unknown as ActionCardView;

const msg = (metadata: unknown): Message => ({ id: 'm1', campaignId: 'camp-1', userId: 'u1', type: MessageType.CHARACTER_ACTION, content: 'texto em portugues', metadata, createdAt: new Date().toISOString() }) as unknown as Message;

beforeEach(() => {
  cleanup();
  undo.mockReset();
  concentration.mockReset();
  undoTarget.mockReset();
  save.mockReset();
  saveRemaining.mockReset();
  h.role = 'PLAYER';
  h.userId = 'u1';
  act(() => {
    useGameStore.getState().clearGameState();
    useGameStore.getState().setTokens([{ id: 'c1t', characterId: 'c1', name: 'Mara' }, { id: 'g1', characterId: null, name: 'Goblin' }] as never, 'map-1');
  });
});

describe('an action card in chat', () => {
  it("shows a player the target's state, the masked name, and no AC", () => {
    render(<ChatMessage message={msg(playerCard)} />);
    expect(screen.getByText('Mara → Goblin, Something invisible, Mara · Longsword', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Goblin: badly wounded')).toBeInTheDocument();
    expect(screen.getByText(/Something invisible/)).toBeInTheDocument();
    expect(screen.getByText(/disadvantage: long range/i)).toBeInTheDocument();
    expect(screen.getByText(/Hit/)).toBeInTheDocument();
    expect(screen.getByText(/7 slashing/)).toBeInTheDocument();
    expect(screen.getByText(/HP 4\/12/)).toBeInTheDocument();
    expect(screen.queryByText(/AC/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByText('texto em portugues')).toBeNull();
  });

  it('shows the GM the numbers and an Undo that undoes the message', async () => {
    h.role = 'GM';
    undo.mockResolvedValue({ ok: true });
    render(<ChatMessage message={msg(gmCard)} />);
    expect(screen.getByText(/against AC 15/)).toBeInTheDocument();
    expect(screen.getByText('58% chance')).toBeInTheDocument();
    expect(screen.getByText(/HP 7 → 0/)).toBeInTheDocument();
    expect(screen.getByText('Goblin bleeds')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo all' }));
    expect(undo).toHaveBeenCalledWith('m1');
  });

  it('says why the GM was refused, in a toast', async () => {
    h.role = 'GM';
    undo.mockResolvedValue({ ok: false, error: 'Already undone' });
    render(<ChatMessage message={msg(gmCard)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo all' }));
    expect(await screen.findByText('That action was already undone.')).toBeInTheDocument();
  });

  it('drops the Undo and says Undone once the card is undone', () => {
    h.role = 'GM';
    const { rerender } = render(<ChatMessage message={msg(gmCard)} />);
    rerender(<ChatMessage message={msg({ ...gmCard, undoneAt: '2026-01-01T00:00:00Z' })} />);
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
    expect(screen.getByText('Undone')).toBeInTheDocument();
    rerender(<ChatMessage message={msg({ ...gmCard, undoneAt: '2026-01-01T00:00:00Z', undoPartial: true })} />);
    expect(screen.getByText('Partly undone: the HP changed afterwards')).toBeInTheDocument();
  });

  it("offers concentration to the target's owner only, once", async () => {
    concentration.mockResolvedValue({ ok: true });
    const { rerender } = render(<ChatMessage message={msg(playerCard)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Concentration check (DC 10)' }));
    expect(concentration).toHaveBeenCalledWith('m1', 'c1t');
    rerender(<ChatMessage message={msg({ ...playerCard, targets: [playerCard.targets[0], { ...playerCard.targets[2], concentrationRolledAt: 'now' }] })} />);
    expect(screen.queryByRole('button', { name: /Concentration check/ })).toBeNull();
    cleanup();
    h.userId = 'u2';
    render(<ChatMessage message={msg(playerCard)} />);
    expect(screen.queryByRole('button', { name: /Concentration check/ })).toBeNull();
  });

  it('gives the GM the concentration button too', () => {
    h.role = 'GM';
    h.userId = 'gm';
    render(<ChatMessage message={msg(gmCard)} />);
    expect(screen.getByRole('button', { name: 'Concentration check (DC 10)' })).toBeInTheDocument();
  });

  it('shows no HP line for a target with no hit points tracked', () => {
    const card = { ...playerCard, targets: [{ tokenId: 'g1', name: 'Statue', isCharacter: false }] };
    render(<ChatMessage message={msg(card)} />);
    expect(screen.queryByText(/Statue:/)).toBeNull();
  });

  it('draws a concentration roll as one line', () => {
    render(<ChatMessage message={msg({ kind: 'concentration', actionMessageId: 'm0', tokenId: 'c1t', name: 'Mara', dc: 10, d20: 12, bonus: 2, total: 14, kept: true })} />);
    expect(screen.getByText(/Mara: concentration check \(DC 10\): 14, keeps concentration/)).toBeInTheDocument();
    expect(screen.queryByText(/actionMessageId/)).toBeNull();
    void waitFor;
  });
});

describe('masked tokens', () => {
  it("shows the GM a masked token's real name", () => {
    h.role = 'GM';
    const card = { ...gmCard, targets: [{ ...(gmCard as { targets: object[] }).targets[0], name: 'Goblin', maskedName: 'something-invisible' }] };
    render(<ChatMessage message={msg(card)} />);
    expect(screen.getByText(/Mara → Goblin · Longsword/)).toBeInTheDocument();
    expect(screen.queryByText(/Something/)).toBeNull();
  });
});

describe('a saving throw card', () => {
  const playerSaveCard = {
    kind: 'action', actor: { tokenId: 'w1', name: 'Merlin' }, actionName: 'Fireball', mode: 'normal',
    save: { ability: 'dex', dc: 15, halfOnSave: true }, damageRoll: [{ total: 28, type: 'fire', breakdown: '8d6' }], pendingSaves: 2,
    targets: [
      { tokenId: 'c1t', name: 'Mara', isCharacter: true, save: { ability: 'dex', dc: 15, status: 'pending' }, yourSave: true },
      { tokenId: 'c2t', name: 'Tobias', isCharacter: true, save: { ability: 'dex', dc: 15, status: 'pending' } },
      { tokenId: 'g1', name: 'Goblin', isCharacter: false, state: 'down', save: { ability: 'dex', dc: 15, status: 'rolled', success: false }, damage: [{ total: 28, type: 'fire', breakdown: '8d6' }] },
      { tokenId: 'c3t', name: 'Ilse', isCharacter: true, save: { ability: 'dex', dc: 15, status: 'rolled', success: true, mode: 'advantage', d20s: [9, 14], total: 17 }, damage: [{ total: 14, type: 'fire', breakdown: '8d6' }] },
    ],
  } as unknown as ActionCardView;

  const gmSaveCard = {
    kind: 'action', actor: { tokenId: 'w1', name: 'Merlin', userId: 'u3' }, actionName: 'Fireball', mode: 'normal',
    save: { ability: 'dex', dc: 15, halfOnSave: true }, damageRoll: [{ total: 28, type: 'fire', breakdown: '8d6' }],
    targets: [
      { tokenId: 'c1t', name: 'Mara', isCharacter: true, showHpBar: true, ac: 14, hpBefore: 12, hpAfter: 12, hpMax: 12, save: { ability: 'dex', dc: 15, bonus: 2, status: 'pending' } },
      { tokenId: 'g1', name: 'Goblin', isCharacter: false, showHpBar: false, ac: 15, hpBefore: 7, hpAfter: 0, hpMax: 7, save: { ability: 'dex', dc: 15, bonus: 2, status: 'rolled', d20s: [4], total: 6, success: false, rolledBy: 'auto' }, damage: [{ total: 28, type: 'fire', breakdown: '8d6' }] },
    ],
    undo: { hp: [] },
  } as unknown as ActionCardView;

  it('tells a player the save, the shared damage and how many saves it waits for', () => {
    render(<ChatMessage message={msg(playerSaveCard)} />);
    expect(screen.getByText('Dexterity saving throw DC 15 · half on a save')).toBeInTheDocument();
    expect(screen.getByText('Damage rolled: 28 fire')).toBeInTheDocument();
    expect(screen.getByText('Waiting for 2 saves')).toBeInTheDocument();
  });

  it("shows a character's total and a monster's result alone", () => {
    render(<ChatMessage message={msg(playerSaveCard)} />);
    expect(screen.getByText('Ilse: saved (17: 9, 14, advantage)')).toBeInTheDocument();
    expect(screen.getByText('Goblin: failed')).toBeInTheDocument();
    expect(screen.queryByText(/Goblin: failed \(/)).toBeNull();
    expect(screen.getByText('Tobias: waiting for the save')).toBeInTheDocument();
  });

  it("gives the player the roll buttons on their own target only, and sends the mode", async () => {
    save.mockResolvedValue({ ok: true });
    render(<ChatMessage message={msg(playerSaveCard)} />);
    const groups = screen.getAllByRole('group', { name: /saving throw/ });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAccessibleName('Mara: Dexterity saving throw DC 15');
    await act(async () => { fireEvent.click(within(groups[0]).getByRole('button', { name: 'Advantage' })); });
    expect(save).toHaveBeenCalledWith('m1', 'c1t', 'advantage');
  });

  it('gives a player neither Roll the rest nor any Undo', () => {
    render(<ChatMessage message={msg(playerSaveCard)} />);
    expect(screen.queryByRole('button', { name: 'Roll the rest' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('gives the GM Roll the rest, an Undo per target and Undo all', () => {
    h.role = 'GM';
    h.userId = 'gm';
    saveRemaining.mockResolvedValue({ ok: true });
    undoTarget.mockResolvedValue({ ok: true });
    undo.mockResolvedValue({ ok: true });
    render(<ChatMessage message={msg(gmSaveCard)} />);
    expect(screen.getByText('Waiting for 1 save')).toBeInTheDocument();
    expect(screen.getByText('Goblin: failed (6: 4, +2)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Roll the rest' }));
    expect(saveRemaining).toHaveBeenCalledWith('m1');
    fireEvent.click(screen.getByRole('button', { name: 'Undo Goblin' }));
    expect(undoTarget).toHaveBeenCalledWith('m1', 'g1');
    fireEvent.click(screen.getByRole('button', { name: 'Undo all' }));
    expect(undo).toHaveBeenCalledWith('m1');
    // The GM rolls through Roll the rest, not the player's buttons.
    expect(screen.queryByRole('group', { name: /saving throw/ })).toBeNull();
  });

  it('marks an undone target and drops its Undo; no Roll the rest once nothing waits', () => {
    h.role = 'GM';
    const card = { ...gmSaveCard, targets: [{ ...(gmSaveCard as { targets: object[] }).targets[0], undoneAt: 'now' }, (gmSaveCard as { targets: object[] }).targets[1]] };
    render(<ChatMessage message={msg(card)} />);
    expect(screen.getByText('Mara: undone')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo Mara' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Roll the rest' })).toBeNull();
    expect(screen.queryByText(/Waiting for/)).toBeNull();
  });
});

describe('a recharge roll', () => {
  it('reads as one line for everyone', () => {
    render(<ChatMessage message={msg({ kind: 'recharge', tokenId: 'd1', name: 'Dragon', actionName: 'Fire Breath', min: 5, d6: 6, recharged: true })} />);
    expect(screen.getByText('Dragon: recharge of Fire Breath (5–6): 6, recharged')).toBeInTheDocument();
    expect(screen.queryByText(/actionName/)).toBeNull();
  });

  it("reads as one line in the GM's own whisper, with the real name", () => {
    h.role = 'GM';
    const whisper = { ...msg({ kind: 'recharge', tokenId: 'd1', name: 'Hidden Dragon', actionName: 'Fire Breath', min: 6, d6: 3, recharged: false }), type: MessageType.WHISPER, recipientId: 'u1' } as Message;
    render(<ChatMessage message={whisper} />);
    expect(screen.getByText('Hidden Dragon: recharge of Fire Breath (6): 3, still spent')).toBeInTheDocument();
    expect(screen.queryByText(/actionName/)).toBeNull();
  });
});

describe('an attack with riders', () => {
  const card = (over: Record<string, unknown>) => ({
    kind: 'action', actor: { tokenId: 'a1', name: 'Mara' }, actionName: 'Rapier', mode: 'normal', ...over,
  }) as unknown as ActionCardView;

  it('names the line each rider added to the hit', () => {
    render(<ChatMessage message={msg(card({
      targets: [{
        tokenId: 'g1', name: 'Goblin', isCharacter: false, state: 'down', attack: { d20s: [15], natural: 15, total: 20, hit: true, critical: false },
        damage: [{ total: 7, type: 'piercing', breakdown: '1d8+3: 4+3' }, { total: 5, type: 'piercing', label: 'Sneak Attack', breakdown: '2d6: 3+2' }],
      }],
    }))} />);
    expect(screen.getByText(/7 piercing, Sneak Attack \(2d6\): 5 piercing/)).toBeInTheDocument();
  });

  it('says a rider was not used when the attack missed', () => {
    render(<ChatMessage message={msg(card({
      targets: [{ tokenId: 'g1', name: 'Goblin', isCharacter: false, state: 'unharmed', attack: { d20s: [2], natural: 2, total: 7, hit: false, critical: false } }],
      ridersUnused: ['Sneak Attack'],
    }))} />);
    expect(screen.getByText('Missed, not used: Sneak Attack')).toBeInTheDocument();
  });
});
