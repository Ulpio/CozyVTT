/**
 * The action bar: whose it is, what it offers, and what pressing a button
 * does. The server is stood in for by `h.options` (what it lists per actor).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useGameStore } from '@/stores/gameStore';
import { useActionStore } from '@/stores/actionStore';
import { h, token, longsword, fireBolt, magicMissile, scimitar, shortbow, fireBreath, rage, healingWord, sneakAttack, divineSmite, combatTurn } from './barHarness';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    userRole: h.role,
    campaign: { id: 'camp-1', gameSystem: h.gameSystem, detailLevel: h.detailLevel, characters: h.characters },
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
    equipItem: (...a: unknown[]) => h.equip(...a),
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
  h.list.mockImplementation(async (_map: string, actor: string) => ({ options: h.options[actor] ?? [], ...(h.combat ? { combat: h.combat } : {}) }));
  h.getCharacter.mockImplementation(async (id: string) => ({ character: h.sheets[id] }));
  h.combat = undefined;
  h.roll.mockReset();
  h.recharge.mockReset();
  h.rechargeReset.mockReset();
  h.equip.mockReset();
  h.equip.mockResolvedValue({ ok: true });
  h.detailLevel = 'FAITHFUL';
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

describe('the turn on the bar', () => {
  beforeEach(() => { h.userId = 'u2'; });
  const spent = 'Você já usou a ação neste turno.';

  it('greys an action spell with the refusal as its title and leaves a bonus spell enabled', async () => {
    h.options['tok-wizard'] = [fireBolt, healingWord];
    h.combat = combatTurn({ spend: { action: true } });
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Spells' }));
    const bolt = await screen.findByRole('button', { name: 'Fire Bolt' });
    expect(bolt).toBeDisabled();
    expect(bolt).toHaveAttribute('title', spent);
    expect(screen.getByRole('button', { name: 'Healing Word' })).toBeEnabled();
  });

  it('allows only reactions off turn, and says it is not the turn', async () => {
    h.options['tok-wizard'] = [fireBolt, { ...healingWord, cost: 'reaction' }];
    h.combat = combatTurn({ yourTurn: false });
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Spells' }));
    expect(await screen.findByRole('button', { name: 'Fire Bolt' })).toHaveAttribute('title', 'Não é a sua vez.');
    expect(screen.getByRole('button', { name: 'Healing Word' })).toBeEnabled();
  });

  it('greys a spell that takes too long to cast in a fight', async () => {
    h.options['tok-wizard'] = [{ ...fireBolt, combatUnavailable: true, castingTime: '1 minute' }];
    h.combat = combatTurn();
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Spells' }));
    const bolt = await screen.findByRole('button', { name: 'Fire Bolt' });
    expect(bolt).toBeDisabled();
    expect(bolt).toHaveAttribute('title', 'Takes 1 minute');
  });

  it('shows the strip and greys an attack when the action is spent', async () => {
    h.userId = 'u1';
    h.combat = combatTurn({ spend: { action: true, attacksLeft: 0 } });
    render(<ActionBar />);
    const sword = await screen.findByRole('button', { name: 'Longsword' });
    expect(sword).toBeDisabled();
    expect(sword).toHaveAttribute('title', spent);
    expect(screen.getByText('Your turn')).toBeInTheDocument();
  });

  it('greys nothing and shows no strip without a combat', async () => {
    h.userId = 'u1';
    render(<ActionBar />);
    expect(await screen.findByRole('button', { name: 'Longsword' })).toBeEnabled();
    expect(screen.queryByText('Your turn')).toBeNull();
  });

  it('lists again when the turn changes', async () => {
    h.userId = 'u1';
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    const calls = h.list.mock.calls.length;
    act(() => { useGameStore.getState().setCombatState({ active: true, round: 1, currentTokenId: 'tok-fighter', combatants: [], spend: {} } as never); });
    await waitFor(() => expect(h.list.mock.calls.length).toBe(calls + 1));
  });
});

describe('class features on the bar', () => {
  it('lists them under Features with the uses as pips, and the commons under their own menu', async () => {
    h.options['tok-fighter'] = [longsword, rage, { id: 'common:dash', name: 'Dash', group: 'common', resolution: 'post', cost: 'action' }, { id: 'common:dash:bonus', name: 'Dash (bonus)', group: 'common', resolution: 'post', cost: 'bonus' }];
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Features' }));
    const panel = await screen.findByRole('group', { name: 'Features' });
    expect(within(panel).getByRole('button', { name: /Rage/ })).toBeEnabled();
    expect(within(panel).getByLabelText('2 of 3 uses')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Common actions' }));
    const commons = await screen.findByRole('group', { name: 'Common actions' });
    expect(within(commons).getByRole('button', { name: 'Dash' })).toBeInTheDocument();
    expect(within(commons).getByRole('button', { name: 'Dash (bonus)' })).toBeInTheDocument();
  });

  it('greys a feature with no uses left, and offers to end one that is running', async () => {
    h.options['tok-fighter'] = [{ ...rage, uses: { left: 0, max: 3 } }, { ...rage, id: 'feature:book/barbaro/outra', name: 'Frenzy', active: true, uses: { left: 0, max: 3 } }];
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Features' }));
    const panel = await screen.findByRole('group', { name: 'Features' });
    expect(within(panel).getByRole('button', { name: /^Rage/ })).toHaveAttribute('title', 'No uses left');
    expect(within(panel).getByRole('button', { name: /^Rage/ })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: /End Frenzy/ })).toBeEnabled();
  });

  it('uses a feature at once, naming no target', async () => {
    const { actionsService } = await import('@/services/actions.service');
    vi.mocked(actionsService.resolve).mockClear();
    h.options['tok-fighter'] = [longsword, rage];
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Features' }));
    fireEvent.click(await screen.findByRole('button', { name: /Rage/ }));
    await waitFor(() => expect(actionsService.resolve).toHaveBeenCalled());
    expect(vi.mocked(actionsService.resolve).mock.calls[0][0]).toMatchObject({ actionId: 'feature:book/barbaro/furia', actorTokenId: 'tok-fighter' });
  });

  it('asks how much Lay on Hands spends, within what is left', async () => {
    const { actionsService } = await import('@/services/actions.service');
    vi.mocked(actionsService.resolve).mockClear();
    h.options['tok-fighter'] = [{ id: 'feature:book/paladino/maos', name: 'Lay on Hands', group: 'feature', resolution: 'feature', cost: 'action', uses: { left: 7, max: 10 }, chosenAmount: true, reach: { kind: 'touch' } }];
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Features' }));
    fireEvent.click(await screen.findByRole('button', { name: /Lay on Hands/ }));
    const amount = await screen.findByLabelText('Amount');
    expect(amount).toHaveAttribute('max', '7');
    fireEvent.change(amount, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    await act(async () => { await useActionStore.getState().resolvePending('tok-fighter'); });
    expect(vi.mocked(actionsService.resolve).mock.calls[0][0]).toMatchObject({ amount: 4, targetTokenId: 'tok-fighter' });
  });
});

describe('riders on a weapon attack', () => {
  it('sends the Sneak Attack rider that was ticked', async () => {
    const { actionsService } = await import('@/services/actions.service');
    vi.mocked(actionsService.resolve).mockClear();
    h.options['tok-fighter'] = [{ ...longsword, grips: undefined, riders: [sneakAttack] }];
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'with Sneak Attack' }));
    await act(async () => { await useActionStore.getState().resolvePending('goblin'); });
    expect(vi.mocked(actionsService.resolve).mock.calls[0][0]).toMatchObject({ riders: [{ featureId: sneakAttack.featureId }] });
  });

  it('sends no riders when none is ticked', async () => {
    const { actionsService } = await import('@/services/actions.service');
    vi.mocked(actionsService.resolve).mockClear();
    h.options['tok-fighter'] = [{ ...longsword, grips: undefined, riders: [sneakAttack] }];
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }));
    await screen.findByRole('checkbox', { name: 'with Sneak Attack' });
    await act(async () => { await useActionStore.getState().resolvePending('goblin'); });
    expect(vi.mocked(actionsService.resolve).mock.calls[0][0]).not.toHaveProperty('riders');
  });

  it('asks the slot of a smite rider among the free ones and sends its level', async () => {
    const { actionsService } = await import('@/services/actions.service');
    vi.mocked(actionsService.resolve).mockClear();
    h.sheets = { ...h.sheets, 'c-fighter': { ...fighterSheet, data: { ...fighterSheet.data, spellcasting: { slots: { '1': { total: 2, expended: 2 }, '2': { total: 2, expended: 0 }, '3': { total: 1, expended: 0 } } } } } };
    h.options['tok-fighter'] = [{ ...longsword, grips: undefined, riders: [divineSmite] }];
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'with Divine Smite' }));
    const picker = await screen.findByRole('combobox', { name: 'Slot for Divine Smite' });
    expect(within(picker).queryByRole('option', { name: /Circle 1/ })).toBeNull();
    fireEvent.change(picker, { target: { value: '3' } });
    await act(async () => { await useActionStore.getState().resolvePending('goblin'); });
    expect(vi.mocked(actionsService.resolve).mock.calls[0][0]).toMatchObject({ riders: [{ featureId: divineSmite.featureId, slotLevel: 3 }] });
  });

  it('greys a rider with no uses left', async () => {
    h.options['tok-fighter'] = [{ ...longsword, grips: undefined, riders: [{ ...sneakAttack, uses: { left: 0, max: 1 } }] }];
    render(<ActionBar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }));
    expect(await screen.findByRole('checkbox', { name: 'with Sneak Attack' })).toBeDisabled();
  });
});

const longbow = { id: 'attack:0', name: 'Longbow', group: 'attack', resolution: 'attack', cost: 'attack', reach: { kind: 'feet', normal: 150, long: 600 }, ammunition: { slug: 'flechas-20', label: 'flechas' } } as never;
const archerSheet = (inventory: unknown[]) => ({
  ...fighterSheet, data: { ...fighterSheet.data, inventory },
});
const arrows = (extra: object) => ({ id: 'arrows', name: 'Arrows', quantity: 17, compendiumRef: { bookId: 'b', slug: 'flechas-20' }, ...extra });

describe('the bar\'s items, weapon swap and ammunition', () => {
  it('shows the items as icons with their quantity', async () => {
    h.sheets['c-fighter'] = archerSheet([{ id: 'arrows', name: 'Arrows', quantity: 20 }, { id: 'rope', name: 'Rope' }]);
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    fireEvent.click(screen.getByRole('button', { name: 'Items' }));
    const panel = await screen.findByRole('group', { name: 'Items' });
    expect(within(panel).getAllByTestId('item-icon')).toHaveLength(2);
    expect(within(panel).getByText('×20')).toBeInTheDocument();
    expect(within(panel).queryByText('×1')).toBeNull();
  });

  it('swaps the weapon in hand through the server: a two-handed one is held in both hands', async () => {
    h.sheets['c-fighter'] = archerSheet([
      { id: 'sword', name: 'Longsword', slot: 'main', equipped: true, compendiumRef: { bookId: 'b', slug: 'espada-longa' } },
      { id: 'great', name: 'Greatsword', notes: 'Heavy, two-handed', compendiumRef: { bookId: 'b', slug: 'espada-grande' } },
      { id: 'rope', name: 'Rope' },
    ]);
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    fireEvent.click(screen.getByRole('button', { name: 'Swap weapon' }));
    const panel = await screen.findByRole('group', { name: 'Swap weapon' });
    expect(within(panel).queryByRole('button', { name: /Rope/ })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: /Greatsword/ }));
    await waitFor(() => expect(h.equip).toHaveBeenCalledWith({ characterId: 'c-fighter', itemId: 'great', slot: 'both' }));
  });

  it('tries main first and again with both when the server says the item does not go there', async () => {
    h.sheets['c-fighter'] = archerSheet([{ id: 'great', name: 'Greatsword', compendiumRef: { bookId: 'b', slug: 'espada-grande' } }]);
    h.equip.mockResolvedValueOnce({ ok: false, error: 'Esse item não vai nesse espaço.' }).mockResolvedValueOnce({ ok: true });
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    fireEvent.click(screen.getByRole('button', { name: 'Swap weapon' }));
    fireEvent.click(await screen.findByRole('button', { name: /Greatsword/ }));
    await waitFor(() => expect(h.equip).toHaveBeenCalledTimes(2));
    expect(h.equip.mock.calls.map((c) => (c[0] as { slot: string }).slot)).toEqual(['main', 'both']);
  });

  it('reports the refusal and sends one request at a time', async () => {
    h.sheets['c-fighter'] = archerSheet([{ id: 'dagger', name: 'Dagger', compendiumRef: { bookId: 'b', slug: 'adaga' } }]);
    let answer: (v: unknown) => void = () => {};
    h.equip.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    fireEvent.click(screen.getByRole('button', { name: 'Swap weapon' }));
    const pick = await screen.findByRole('button', { name: /Dagger/ });
    fireEvent.click(pick);
    fireEvent.click(pick);
    expect(h.equip).toHaveBeenCalledTimes(1);
    expect(pick).toBeDisabled();
    await act(async () => { answer({ ok: false, error: 'Não é a sua vez.' }); });
    await waitFor(() => expect(useActionStore.getState().lastError?.message).toBe('Não é a sua vez.'));
    expect(pick).toBeEnabled();
  });

  it('puts the weapon in hand back in the backpack', async () => {
    h.sheets['c-fighter'] = archerSheet([{ id: 'sword', name: 'Longsword', slot: 'main', equipped: true, compendiumRef: { bookId: 'b', slug: 'espada-longa' } }]);
    render(<ActionBar />);
    await screen.findByRole('button', { name: 'Longsword' });
    fireEvent.click(screen.getByRole('button', { name: 'Swap weapon' }));
    const panel = await screen.findByRole('group', { name: 'Swap weapon' });
    fireEvent.click(within(panel).getByRole('button', { name: /Longsword/ }));
    await waitFor(() => expect(h.equip).toHaveBeenCalledWith({ characterId: 'c-fighter', itemId: 'sword', slot: null }));
  });

  it('shows the arrows left on a bow in Faithful, from the stack in the ammo slot', async () => {
    h.options['tok-fighter'] = [longbow];
    h.sheets['c-fighter'] = archerSheet([arrows({ slot: 'ammo' }), arrows({ id: 'spare', quantity: 5 })]);
    render(<ActionBar />);
    expect(await screen.findByRole('button', { name: 'Longbow · 17' })).toBeInTheDocument();
  });

  it('counts the first stack in the backpack when none is in the ammo slot, and 0 when there is none', async () => {
    h.options['tok-fighter'] = [longbow];
    h.sheets['c-fighter'] = archerSheet([arrows({ quantity: 9 })]);
    const { unmount } = render(<ActionBar />);
    expect(await screen.findByRole('button', { name: 'Longbow · 9' })).toBeInTheDocument();
    unmount();
    h.sheets['c-fighter'] = archerSheet([]);
    render(<ActionBar />);
    expect(await screen.findByRole('button', { name: 'Longbow · 0' })).toBeInTheDocument();
  });

  it('shows no count in Flexible', async () => {
    h.detailLevel = 'FLEXIBLE';
    h.options['tok-fighter'] = [longbow];
    h.sheets['c-fighter'] = archerSheet([arrows({ slot: 'ammo' })]);
    render(<ActionBar />);
    expect(await screen.findByRole('button', { name: 'Longbow' })).toBeInTheDocument();
  });
});
