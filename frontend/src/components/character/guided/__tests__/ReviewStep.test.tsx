/**
 * Steps 10 and 11: the details (a name before anything else, personality
 * drawn from the background's tables) and the review, which shows the built
 * sheet, holds Create while any step owes a pick, and creates the character
 * with the saved roll.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { GameSystem, type AbilityRollDto, type Campaign } from '@/types';
import { CREATION_DATA } from '@/utils/guidedCreation/__tests__/fixtures/creationData';
import { buildSheet } from '@/utils/guidedCreation/buildSheet';
import type { CreationChoices } from '@/utils/guidedCreation/types';
import { NO_ROLL, nextButton, renderStep } from './stepHarness';

const createCharacter = vi.fn();
vi.mock('@/services/api', () => {
  const client = { createCharacter: (...a: unknown[]) => createCharacter(...a) };
  return { api: client, default: client };
});

beforeEach(() => {
  createCharacter.mockReset().mockImplementation((body: { name: string; data: unknown }) =>
    Promise.resolve({ message: 'ok', character: { id: 'char-9', name: body.name, data: body.data } }),
  );
});
afterEach(() => vi.restoreAllMocks());

/** A human Champion fighter with every pick made (the buildSheet sample). */
const FIGHTER: Partial<CreationChoices> = {
  raceSlug: 'humano',
  classSlug: 'guerreiro',
  subclassSlug: 'campeao',
  backgroundSlug: 'soldado',
  method: 'STANDARD_ARRAY',
  baseScores: { str: 15, con: 14, dex: 13, wis: 12, cha: 10, int: 8 },
  skillPicks: ['perception', 'survival'],
  toolPicks: ['kit-de-jogo-conjunto-de-dados'],
  optionPicks: { fightingStyle: ['defesa'], 'race:languageChoice:0': ['Élfico'] },
  equipmentPicks: [0, 1],
  anyOfPicks: { '1.0.0': 'espada-longa', '1.0.1': 'machado-grande' },
  details: { name: 'Brom' },
};

const ROLL: AbilityRollDto = {
  id: 'roll-1',
  rolls: [15, 14, 13, 12, 10, 8].map((total) => ({ dice: [], kept: [], total })),
};
const ROLLED = { ...NO_ROLL, roll: ROLL };
const CAMPAIGN = { id: 'camp-1', abilityScoreMethods: ['ROLL'], detailLevel: 'FAITHFUL' } as Campaign;

const createButton = () => screen.getByRole('button', { name: 'Create character' });

describe('DetailsStep', () => {
  it('holds Next until the character has a name', () => {
    const harness = renderStep('details', { ...FIGHTER, details: { name: '' } });
    expect(nextButton()).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: 'Brom' } });
    expect(nextButton()).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Eyes' }), { target: { value: 'Grey' } });
    expect(harness.choices().details).toMatchObject({ name: 'Brom', appearance: { eyes: 'Grey' } });
  });

  it("draws the personality from the background's tables, and the text stays editable", () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const harness = renderStep('details', FIGHTER);
    fireEvent.click(screen.getByRole('button', { name: 'Draw ideals' }));
    expect(harness.choices().details.personality?.ideals).toBe('Soldado ideal 4');
    // Two traits, as the book has them.
    fireEvent.click(screen.getByRole('button', { name: 'Draw personality traits' }));
    expect(harness.choices().details.personality?.traits?.split('\n')).toHaveLength(2);

    const ideals = screen.getByRole('textbox', { name: 'Ideals' });
    expect(ideals).toHaveValue('Soldado ideal 4');
    fireEvent.change(ideals, { target: { value: 'Meu próprio ideal' } });
    expect(harness.choices().details.personality?.ideals).toBe('Meu próprio ideal');

    fireEvent.change(screen.getByRole('combobox', { name: 'Pick flaws from the table' }), { target: { value: 'Soldado defeito 2' } });
    expect(harness.choices().details.personality?.flaws).toBe('Soldado defeito 2');
  });
});

describe('ReviewStep', () => {
  it('holds Create while a step owes a pick, and lists those steps', () => {
    renderStep('review', { ...FIGHTER, equipmentPicks: [], details: { name: '' } });
    expect(createButton()).toBeDisabled();
    const pending = screen.getByRole('list', { name: 'Still to do' });
    expect(within(pending).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Equipment', 'Details']);
  });

  it('shows the built sheet and creates the character with the roll it used', async () => {
    const onCreated = vi.fn();
    const choices = { ...FIGHTER, method: 'ROLL' as const, abilityRollId: 'roll-1' };
    const harness = renderStep('review', choices, CAMPAIGN, { roll: ROLLED, onCreated });
    expect(screen.queryByRole('list', { name: 'Still to do' })).not.toBeInTheDocument();
    // The sheet, read-only: its header and no Edit button.
    expect(screen.getByRole('heading', { name: 'Brom' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();

    fireEvent.click(createButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'char-9' })));
    expect(createCharacter).toHaveBeenCalledWith({
      name: 'Brom',
      campaignId: 'camp-1',
      gameSystem: GameSystem.FIFTH_EDITION,
      data: buildSheet(harness.choices(), CREATION_DATA),
      abilityRollId: 'roll-1',
    });
  });

  it('keeps every choice and says why when the server refuses', async () => {
    createCharacter.mockRejectedValue({ response: { status: 409, data: { message: 'That roll was already used.' } } });
    const onCreated = vi.fn();
    const harness = renderStep('review', FIGHTER, undefined, { onCreated });
    const before = harness.choices();
    fireEvent.click(createButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('That roll was already used.');
    expect(onCreated).not.toHaveBeenCalled();
    expect(harness.choices()).toEqual(before);
    expect(createButton()).toBeEnabled();
    expect(createCharacter.mock.calls[0][0]).toMatchObject({ campaignId: undefined, abilityRollId: undefined });
  });
});

