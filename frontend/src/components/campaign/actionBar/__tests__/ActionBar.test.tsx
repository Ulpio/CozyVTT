/**
 * The action bar: whose it is, what it offers, and what pressing a button
 * does. The server is stood in for by `h.options` (what it lists per actor).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useGameStore } from '@/stores/gameStore';
import { useActionStore } from '@/stores/actionStore';
import { h, token, longsword, fireBolt, magicMissile, scimitar, shortbow, fireBreath } from './barHarness';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    userRole: h.role,
    campaign: { id: 'camp-1', gameSystem: h.gameSystem, characters: h.characters },
    currentMap: { id: 'map-1' },
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.userId } }) }));
vi.mock('@/services/actions.service', () => ({
  actionsService: {
    list: (...a: unknown[]) => h.list(...a),
    resolve: vi.fn(async () => ({ ok: true })),
    recharge: (...a: unknown[]) => h.recharge(...a),
    rechargeReset: (...a: unknown[]) => h.rechargeReset(...a),
  },
}));
vi.mock('@/services/api', () => ({ api: { getCharacter: (id: string) => h.getCharacter(id) } }));
vi.mock('@/hooks/useTableRoll', () => ({ useTableRoll: () => h.roll }));
vi.mock('@/services/socket', () => ({
  default: {
    on: (e: string, fn: (d: unknown) => void) => { (h.handlers.get(e) ?? h.handlers.set(e, new Set()).get(e)!).add(fn); },
    off: (e: string, fn: (d: unknown) => void) => { h.handlers.get(e)?.delete(fn); },
  },
}));

import ActionBar from '../ActionBar';

const fighterSheet = {
  id: 'c-fighter', gameSystem: 'FIFTH_EDITION', name: 'Brienne', updatedAt: '1',
  data: {
    armorClass: 18, level: 5, hp: { current: 40, maximum: 44, temporary: 0 },
    stats: { strength: { score: 16, modifier: 3 } },
    skills: { athletics: { proficient: true, bonus: 6 } },
    inventory: [{ name: 'Longsword' }, { name: 'Rope' }],
  },
};
const wizardSheet = {
  id: 'c-wizard', gameSystem: 'FIFTH_EDITION', name: 'Merlo', updatedAt: '1',
  data: {
    armorClass: 12, level: 5, hp: { current: 20, maximum: 20, temporary: 0 },
    spellcasting: { slots: { '1': { total: 4, expended: 0 }, '2': { total: 3, expended: 3 }, '3': { total: 2, expended: 0 } } },
  },
};

function seed() {
  h.role = 'PLAYER';
  h.gameSystem = 'FIFTH_EDITION';
  h.userId = 'u1';
  h.characters = [{ id: 'c-fighter', userId: 'u1', name: 'Brienne' }, { id: 'c-wizard', userId: 'u2', name: 'Merlo' }];
  h.options = { 'tok-fighter': [longsword], 'tok-wizard': [fireBolt, magicMissile], goblin: [scimitar, shortbow] };
  h.sheets = { 'c-fighter': fighterSheet, 'c-wizard': wizardSheet };
  h.list.mockImplementation(async (_map: string, actor: string) => h.options[actor] ?? []);
  h.getCharacter.mockImplementation(async (id: string) => ({ character: h.sheets[id] }));
  h.roll.mockReset();
  h.recharge.mockReset();
  h.rechargeReset.mockReset();
  h.roll.mockResolvedValue(true);
  h.handlers.clear();
  window.localStorage.clear();
  act(() => {
    useActionStore.setState({ pending: null, mode: 'normal', concentrationConfirm: null, lastError: null });
    useGameStore.getState().clearGameState();
    useGameStore.getState().setTokens([
      token({ id: 'tok-fighter', characterId: 'c-fighter', name: 'Brienne', type: 'PC' as never }),
      token({ id: 'tok-wizard', characterId: 'c-wizard', name: 'Merlo', type: 'PC' as never }),
      token({ id: 'goblin', name: 'Goblin', hp: { current: 7, max: 7, temp: 0 }, statBlock: { ac: 15 } as never }),
    ], 'map-1');
  });
}

beforeEach(() => { cleanup(); seed(); });

describe('the action bar for a player', () => {
  it("shows the fighter's Longsword, and pressing it asks which grip, then begins targeting", async () => {
    render(<ActionBar />);
    const button = await screen.findByRole('button', { name: 'Longsword' });
    fireEvent.click(button);
    fireEvent.click(await screen.findByRole('button', { name: 'Two hands' }));
    const pending = useActionStore.getState().pending;
    expect(pending?.option.id).toBe('attack:0');
    expect(pending?.actorTokenId).toBe('tok-fighter');
    expect(pending?.grip).toBe('two');
  });

  it("shows the actor's own HP and AC on the left", async () => {
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    await waitFor(() => expect(screen.getByText(/AC 18/)).toBeInTheDocument());
    expect(screen.getByText(/HP 40\/44/)).toBeInTheDocument();
  });

  it('lists an inventory item that matches an attack, and the others disabled', async () => {
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    fireEvent.click(screen.getByRole('button', { name: 'Items' }));
    const panel = await screen.findByRole('group', { name: 'Items' });
    expect(within(panel).getByRole('button', { name: 'Longsword' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: /^Rope/ })).toBeDisabled();
  });

  it('sends a check with the bar\'s advantage mode applied', async () => {
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    fireEvent.click(screen.getByRole('radio', { name: 'Advantage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Checks' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Athletics/ }));
    await waitFor(() => expect(h.roll).toHaveBeenCalled());
    const roll = h.roll.mock.calls[0][0] as { expression: string };
    expect(roll.expression).toMatch(/^2d20kh1/);
  });

  it('has no bar when the player has no token on this map', () => {
    h.characters = [{ id: 'c-wizard', userId: 'u2', name: 'Merlo' }];
    const { container } = render(<ActionBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no bar outside a 5e campaign', () => {
    h.gameSystem = 'FANTASY_D20';
    const { container } = render(<ActionBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no bar for a spectator', () => {
    h.role = 'SPECTATOR';
    const { container } = render(<ActionBar />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the spell menu', () => {
  beforeEach(() => { h.userId = 'u2'; });

  it('lists cantrips first, and circle 1 as 4/4', async () => {
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Spells' }));
    const panel = await screen.findByRole('group', { name: 'Spells' });
    const headings = within(panel).getAllByRole('heading').map((x) => x.textContent);
    expect(headings[0]).toMatch(/Cantrips/);
    expect(headings[1]).toMatch(/Circle 1.*4\/4/);
    expect(headings.some((x) => /Circle 2.*0\/3/.test(x ?? ''))).toBe(true);
  });

  it('asks the circle for a leveled spell, with an empty circle disabled', async () => {
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Spells' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Magic Missile' }));
    expect(screen.getByRole('button', { name: /Circle 2/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Circle 3/ })).toBeEnabled();
  });

  it('disables leveled spells while the slots are unknown, keeping cantrips', async () => {
    h.sheets = { ...h.sheets, 'c-wizard': { ...wizardSheet, data: { ...wizardSheet.data, spellcasting: {} } } };
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Spells' }));
    expect(await screen.findByRole('button', { name: 'Magic Missile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fire Bolt' })).toBeEnabled();
  });

  it('casts at once, with no target, in the circle chosen', async () => {
    const { actionsService } = await import('@/services/actions.service');
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Spells' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Magic Missile' }));
    fireEvent.click(screen.getByRole('button', { name: /Circle 3/ }));
    await waitFor(() => expect(actionsService.resolve).toHaveBeenCalled());
    expect(vi.mocked(actionsService.resolve).mock.calls[0][0]).toMatchObject({ actionId: 'spell:magic-missile', slotLevel: 3, actorTokenId: 'tok-wizard' });
    expect(useActionStore.getState().pending).toBeNull();
  });
});

describe('the action bar for the GM', () => {
  beforeEach(() => { h.role = 'GM'; h.userId = 'gm'; });

  it('has no bar with nothing selected', () => {
    const { container } = render(<ActionBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the selected goblin's Scimitar and Shortbow, and its own HP and AC", async () => {
    act(() => { useGameStore.getState().selectToken('goblin'); });
    render(<ActionBar />);
    expect(await screen.findByRole('button', { name: /Scimitar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Shortbow/ })).toBeInTheDocument();
    expect(screen.getByText(/HP 7\/7/)).toBeInTheDocument();
    expect(screen.getByText(/AC 15/)).toBeInTheDocument();
  });

  it('shows a spent recharge as Roll recharge, which rolls it rather than acting', async () => {
    h.options.goblin = [scimitar, fireBreath];
    h.recharge.mockResolvedValue({ ok: true, recharged: false, d6: 2 });
    act(() => { useGameStore.getState().selectToken('goblin'); });
    render(<ActionBar />);
    const button = await screen.findByRole('button', { name: /^Fire Breath\s*Roll recharge \(5–6\)$/ });
    fireEvent.click(button);
    expect(h.recharge).toHaveBeenCalledWith('map-1', 'goblin', 'npc:2');
    expect(useActionStore.getState().pending).toBeNull();
  });

  it('brings a spent recharge back by hand', async () => {
    h.options.goblin = [fireBreath];
    h.rechargeReset.mockResolvedValue({ ok: true });
    act(() => { useGameStore.getState().selectToken('goblin'); });
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reset the recharge of Fire Breath' }));
    expect(h.rechargeReset).toHaveBeenCalledWith('map-1', 'goblin', 'npc:2');
  });

  it('keeps a recharge that is not spent a normal button', async () => {
    h.options.goblin = [{ ...fireBreath, recharge: { min: 5, spent: false } }];
    act(() => { useGameStore.getState().selectToken('goblin'); });
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fire Breath' }));
    expect(useActionStore.getState().pending?.option.id).toBe('npc:2');
    expect(screen.queryByRole('button', { name: /Reset the recharge/ })).toBeNull();
  });

  it('lists again when the token\'s recharge changes', async () => {
    act(() => { useGameStore.getState().selectToken('goblin'); });
    render(<ActionBar />);
    await screen.findByRole('button', { name: /Scimitar/ });
    const calls = h.list.mock.calls.length;
    act(() => { useGameStore.getState().patchToken('goblin', { rechargeSpent: ['npc:2'] } as never, 'map-1'); });
    await waitFor(() => expect(h.list.mock.calls.length).toBe(calls + 1));
  });
});

describe("a player's bar with a recharge on it", () => {
  // A player's bar lists their characters' tokens; a recharge there stands in for a breath they control.
  const fighter = () => token({ id: 'tok-fighter', characterId: 'c-fighter', name: 'Brienne', type: 'PC' as never });
  const goblin = () => token({ id: 'goblin', name: 'Goblin', hp: { current: 7, max: 7, temp: 0 }, statBlock: { ac: 15 } as never });

  it("lists again when the map comes again with the token (the spent mark itself is the GM's)", async () => {
    h.options['tok-fighter'] = [longsword, { ...fireBreath, recharge: { min: 5, spent: false } }];
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Fire Breath' });
    const calls = h.list.mock.calls.length;
    h.options['tok-fighter'] = [longsword, fireBreath];
    act(() => { useGameStore.getState().setTokens([fighter(), goblin()], 'map-1'); });
    expect(await screen.findByRole('button', { name: /^Fire Breath\s*Spent until it recharges$/ })).toBeDisabled();
    expect(h.list.mock.calls.length).toBe(calls + 1);
  });

  it('does not list again on a resend or a move when nothing on the bar recharges', async () => {
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    const calls = h.list.mock.calls.length;
    act(() => { useGameStore.getState().applyTokenMove('tok-fighter', { x: 3, y: 3 }); });
    act(() => { useGameStore.getState().setTokens([fighter(), goblin()], 'map-1'); });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.list.mock.calls.length).toBe(calls);
  });
});

describe('the rest of the bar', () => {
  it("shows a player a spent recharge as spent, with nothing to roll", async () => {
    h.options['tok-fighter'] = [fireBreath];
    render(<ActionBar />);
    expect(await screen.findByRole('button', { name: /^Fire Breath\s*Spent until it recharges$/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Reset the recharge/ })).toBeNull();
  });

  it('says so when the actor has nothing to do', async () => {
    h.options = {};
    render(<ActionBar />);
    expect(await screen.findByText('Nothing to do with this token.')).toBeInTheDocument();
  });

  it('survives a refused list', async () => {
    h.list.mockRejectedValue(new Error('403'));
    render(<ActionBar />);
    expect(await screen.findByText('Nothing to do with this token.')).toBeInTheDocument();
  });

  it('names the checks in the app language, rolling the same expression', async () => {
    const i18n = (await import('@/i18n')).default;
    await act(async () => { await i18n.changeLanguage('pt-BR'); });
    try {
      render(<ActionBar />);
      fireEvent.click(await screen.findByRole('button', { name: 'Testes' }));
      fireEvent.click(await screen.findByRole('button', { name: /^Atletismo/ }));
      await waitFor(() => expect(h.roll).toHaveBeenCalled());
      expect((h.roll.mock.calls[0][0] as { purpose: string }).purpose).toBe('Athletics Check');
    } finally {
      await act(async () => { await i18n.changeLanguage('en'); });
    }
  });
});
