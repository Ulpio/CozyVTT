/**
 * The abilities step of the guided creation: only the campaign's methods,
 * point buy's budget, a roll made once on the server and never again, a saved
 * roll shown on reopening, racial bonuses apart from the base scores, and the
 * half-elf's two +1 picks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AbilityRollDto, Campaign, CompendiumSearch } from '@/types';
import GuidedCreationModal from '../GuidedCreationModal';
import { compendiumPage } from './creationApiMock';

const searchCompendium = vi.fn();
const getAbilityRoll = vi.fn();
const rollAbilities = vi.fn();
vi.mock('@/services/api', () => {
  const client = {
    searchCompendium: (...a: unknown[]) => searchCompendium(...a),
    getAbilityRoll: (...a: unknown[]) => getAbilityRoll(...a),
    rollAbilities: (...a: unknown[]) => rollAbilities(...a),
  };
  return { api: client, default: client };
});

const ROLL: AbilityRollDto = {
  id: 'roll-1',
  rolls: [16, 15, 13, 12, 11, 7].map((total) => ({ dice: [1, 2, 3, 4], kept: [2, 3, 4], total })),
};

const campaignWith = (methods: Campaign['abilityScoreMethods']) =>
  ({ id: 'camp-1', name: 'Mesa', abilityScoreMethods: methods, detailLevel: 'FLEXIBLE' }) as Campaign;

beforeEach(() => {
  vi.clearAllMocks();
  searchCompendium.mockImplementation((p: CompendiumSearch) => compendiumPage(p));
  getAbilityRoll.mockResolvedValue(null);
  rollAbilities.mockResolvedValue(ROLL);
});

const next = () => screen.getByRole('button', { name: 'Next' });
const pick = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));

/** Opens the wizard and walks to the abilities step with a half-orc fighter (or `race`). */
async function toAbilities(campaign?: Campaign, race = 'Meio-Orc') {
  render(<GuidedCreationModal isOpen onClose={() => {}} onCreated={() => {}} campaign={campaign} />);
  await screen.findByRole('radio', { name: race });
  pick(race);
  fireEvent.click(next());
  pick('Guerreiro');
  fireEvent.click(next());
  pick('Sub campeao');
  fireEvent.click(next());
  pick('Soldado');
  fireEvent.click(next());
  expect(screen.getByRole('heading', { name: 'Ability scores' })).toBeInTheDocument();
}

const row = (ability: string) => screen.getByRole('row', { name: new RegExp(ability) });

describe('AbilitiesStep', () => {
  it('offers every method outside a campaign', async () => {
    await toAbilities();
    expect(screen.getByRole('radio', { name: 'Point buy' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Standard array' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Roll 4d6' })).toBeInTheDocument();
  });

  it('offers only the campaign methods', async () => {
    await toAbilities(campaignWith(['STANDARD_ARRAY']));
    expect(screen.queryByRole('radio', { name: 'Point buy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Roll 4d6' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Standard array' })).toBeChecked();
    expect(next()).toBeEnabled();
  });

  it('standard array swaps values between abilities', async () => {
    await toAbilities(campaignWith(['STANDARD_ARRAY']));
    const str = within(row('Strength')).getByRole('combobox');
    const dex = within(row('Dexterity')).getByRole('combobox');
    expect(str).toHaveValue('15');
    expect(dex).toHaveValue('14');
    fireEvent.change(dex, { target: { value: '15' } });
    expect(str).toHaveValue('14');
    expect(dex).toHaveValue('15');
    expect(next()).toBeEnabled();
  });

  it('point buy shows the points left and holds Next above 27', async () => {
    await toAbilities(campaignWith(['POINT_BUY']));
    expect(screen.getByText('Points left: 27')).toBeInTheDocument();
    fireEvent.change(within(row('Strength')).getByRole('combobox'), { target: { value: '15' } });
    expect(screen.getByText('Points left: 18')).toBeInTheDocument();
    expect(next()).toBeEnabled();
    for (const ability of ['Dexterity', 'Constitution', 'Intelligence']) {
      fireEvent.change(within(row(ability)).getByRole('combobox'), { target: { value: '15' } });
    }
    expect(screen.getByText('Points left: -9')).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  it('rolls once on the server, shows the six totals and offers no re-roll', async () => {
    await toAbilities(campaignWith(['ROLL']));
    expect(next()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    const list = await screen.findByRole('list', { name: 'Rolled scores' });
    expect(rollAbilities).toHaveBeenCalledTimes(1);
    expect(rollAbilities).toHaveBeenCalledWith('camp-1');
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['16', '15', '13', '12', '11', '7']);
    expect(screen.queryByRole('button', { name: /roll/i })).not.toBeInTheDocument();
    expect(within(row('Strength')).getByRole('combobox')).toHaveValue('16');
    expect(next()).toBeEnabled();
  });

  it('shows a saved roll on reopening without rolling again, even when the campaign dropped Roll', async () => {
    getAbilityRoll.mockResolvedValue(ROLL);
    await toAbilities(campaignWith(['POINT_BUY']));
    expect(getAbilityRoll).toHaveBeenCalledWith('camp-1');
    expect(screen.getByRole('radio', { name: 'Roll 4d6' })).toBeChecked();
    const list = screen.getByRole('list', { name: 'Rolled scores' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    expect(rollAbilities).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /roll/i })).not.toBeInTheDocument();
    // A saved roll locks the method.
    expect(screen.queryByRole('radio', { name: 'Point buy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Standard array' })).not.toBeInTheDocument();
  });

  it('locks the method to the roll once the player has rolled', async () => {
    await toAbilities();
    fireEvent.click(screen.getByRole('radio', { name: 'Roll 4d6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    await screen.findByRole('list', { name: 'Rolled scores' });
    expect(screen.queryByRole('radio', { name: 'Point buy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Standard array' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Roll 4d6' })).toBeChecked();
    expect(next()).toBeEnabled();
  });

  it('holds the step when the saved roll cannot be looked up, until a retry succeeds', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAbilityRoll.mockRejectedValueOnce(new Error('down'));
    await toAbilities();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not check for a saved roll/);
    expect(screen.queryByRole('radio', { name: 'Point buy' })).not.toBeInTheDocument();
    expect(next()).toBeDisabled();

    getAbilityRoll.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByRole('radio', { name: 'Point buy' })).toBeChecked();
    expect(next()).toBeEnabled();
    expect(getAbilityRoll).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });

  it('shows racial bonuses apart from the base score', async () => {
    await toAbilities(campaignWith(['STANDARD_ARRAY']));
    expect(within(row('Strength')).getByText('+2')).toBeInTheDocument();
    expect(within(row('Constitution')).getByText('+1')).toBeInTheDocument();
    // 15 base + 2 racial
    expect(within(row('Strength')).getByText('17')).toBeInTheDocument();
  });

  it('asks the half-elf for two +1 picks other than Charisma before Next', async () => {
    await toAbilities(campaignWith(['STANDARD_ARRAY']), 'Meio-Elfo');
    expect(next()).toBeDisabled();
    const picks = screen.getAllByRole('combobox', { name: /Racial \+1/ });
    expect(picks).toHaveLength(2);
    expect(within(picks[0]).queryByRole('option', { name: 'Charisma' })).not.toBeInTheDocument();
    fireEvent.change(picks[0], { target: { value: 'str' } });
    expect(next()).toBeDisabled();
    fireEvent.change(picks[1], { target: { value: 'dex' } });
    expect(next()).toBeEnabled();
    expect(within(row('Strength')).getByText('+1')).toBeInTheDocument();
  });
});
