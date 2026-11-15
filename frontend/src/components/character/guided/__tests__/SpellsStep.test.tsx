/**
 * Step 9: counters from spellcastingAt3, the wizard's spellbook and prepared
 * spells, always-prepared domain spells locked, no spell above the levels the
 * character can cast, filters and the text panel; and no step for a fighter
 * without Eldritch Knight.
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { CREATION_DATA } from '@/utils/guidedCreation/__tests__/fixtures/creationData';
import { emptyChoices } from '../useCreationState';
import { stepsFor } from '../steps';
import { nextButton, renderStep } from './stepHarness';

const DWARF = { raceSlug: 'anao', subraceSlug: 'anao-da-colina', backgroundSlug: 'sabio' };
const group = (name: RegExp) => screen.getByRole('group', { name });
const LEVEL_1 = Array.from({ length: 12 }, (_, i) => `S magia-1-${String(i + 1).padStart(2, '0')}`);

describe('SpellsStep', () => {
  it('the wizard fills a spellbook of 10 and 3 cantrips, then prepares from it', () => {
    const harness = renderStep('spells', { ...DWARF, classSlug: 'mago', subclassSlug: 'escola-de-evocacao' });
    const book = group(/Spellbook/);
    expect(within(book).getByText('0/10')).toBeInTheDocument();
    expect(within(group(/Cantrips/)).getByText('0/3')).toBeInTheDocument();
    expect(screen.queryByText('S magia-3-01')).not.toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    for (const name of LEVEL_1.slice(0, 9)) fireEvent.click(within(book).getByRole('checkbox', { name }));
    fireEvent.click(within(book).getByRole('checkbox', { name: 'S magia-2-01' }));
    expect(within(book).getByText('10/10')).toBeInTheDocument();
    expect(within(book).getByRole('checkbox', { name: 'S magia-1-10' })).toBeDisabled();
    expect(nextButton()).toBeDisabled();

    const cantrips = group(/Cantrips/);
    for (const name of ['S luz', 'S maos-magicas', 'S raio-de-fogo']) fireEvent.click(within(cantrips).getByRole('checkbox', { name }));
    // INT 12: +1 and 3rd level, four prepared.
    const prepared = group(/Prepared from the spellbook/);
    expect(within(prepared).getByText('0/4')).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    for (const name of ['S magia-2-01', 'S magia-1-03', 'S magia-1-01', 'S magia-1-02']) {
      fireEvent.click(within(prepared).getByRole('checkbox', { name }));
    }
    expect(nextButton()).toBeEnabled();
    expect(harness.choices().spellSlugs).toHaveLength(10);
    expect(harness.choices().preparedSlugs).toEqual(['magia-2-01', 'magia-1-03', 'magia-1-01', 'magia-1-02']);

    // Taking a prepared spell out of the spellbook unprepares it.
    fireEvent.click(within(book).getByRole('checkbox', { name: 'S magia-1-03' }));
    expect(harness.choices().preparedSlugs).toEqual(['magia-2-01', 'magia-1-01', 'magia-1-02']);
    expect(nextButton()).toBeDisabled();
  });

  it('a Life cleric has its domain spells locked and never a 3rd-level spell', () => {
    renderStep('spells', { ...DWARF, classSlug: 'clerigo', subclassSlug: 'dominio-da-vida' });
    const list = group(/Prepared spells/);
    for (const name of [/S magia-1-11/, /S magia-2-01/]) {
      const box = within(list).getByRole('checkbox', { name });
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
    // WIS 10 at 3rd level: three prepared, besides the domain's.
    expect(within(list).getByText('0/3')).toBeInTheDocument();
    expect(screen.queryByText('S magia-3-01')).not.toBeInTheDocument();
  });

  it('filters by level and name, and shows the spell text beside the list', () => {
    renderStep('spells', { ...DWARF, classSlug: 'mago', subclassSlug: 'escola-de-evocacao' });
    const book = group(/Spellbook/);
    fireEvent.change(within(book).getByRole('combobox', { name: 'Spell level' }), { target: { value: '2' } });
    expect(within(book).getAllByRole('checkbox').map((c) => c.closest('li')?.querySelector('span')?.textContent)).toEqual([
      'S magia-2-01',
      'S magia-2-02',
    ]);
    fireEvent.change(within(book).getByRole('combobox', { name: 'Spell level' }), { target: { value: 'all' } });
    fireEvent.change(within(book).getByRole('searchbox', { name: 'Search spells' }), { target: { value: 'familiar' } });
    expect(within(book).getAllByRole('checkbox')).toHaveLength(1);

    fireEvent.click(within(book).getByRole('button', { name: 'Read S convocar-familiar' }));
    expect(within(book).getByRole('heading', { name: 'S convocar-familiar' })).toBeInTheDocument();
    expect(within(book).getByText(/inventado para os testes/)).toBeInTheDocument();
  });
});

describe('the spells step in the step list', () => {
  const check = (classSlug: string, subclassSlug: string) => ({
    data: CREATION_DATA,
    choices: { ...emptyChoices(), ...DWARF, classSlug, subclassSlug },
    roll: null,
    rollKnown: true,
  });
  const ids = (classSlug: string, subclassSlug: string) => stepsFor(check(classSlug, subclassSlug)).map((s) => s.id);

  it('is skipped for a fighter without Eldritch Knight', () => {
    expect(ids('guerreiro', 'campeao')).not.toContain('spells');
    expect(ids('guerreiro', 'campeao')).toContain('equipment');
    expect(ids('guerreiro', 'cavaleiro-arcano')).toContain('spells');
    expect(ids('mago', 'escola-de-evocacao')).toContain('spells');
  });

  it("limits an Eldritch Knight's spells to two schools, with one free pick", () => {
    renderStep('spells', { ...DWARF, classSlug: 'guerreiro', subclassSlug: 'cavaleiro-arcano' });
    const known = group(/Spells known/);
    expect(within(known).getByText(/Spells of abjuração, evocação only, except free picks: 1 left/)).toBeInTheDocument();
    // magia-1-01 is enchantment: the free pick; then the next off-school spell is held.
    fireEvent.click(within(known).getByRole('checkbox', { name: 'S magia-1-01' }));
    expect(within(known).getByRole('checkbox', { name: 'S magia-1-02' })).toBeDisabled();
    expect(within(known).getByRole('checkbox', { name: 'S magia-1-03' })).toBeEnabled();
  });
});
