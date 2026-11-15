/**
 * Step 8: the "(a)/(b)" choices as radios, only the options the character can
 * use, an "any martial weapon" select, and weights shown only in a Faithful
 * campaign (or outside a campaign).
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { Campaign } from '@/types';
import { nextButton, renderStep } from './stepHarness';

const FIGHTER = {
  raceSlug: 'anao',
  subraceSlug: 'anao-da-colina',
  classSlug: 'guerreiro',
  subclassSlug: 'campeao',
  backgroundSlug: 'soldado',
};
const campaign = (detailLevel: 'FAITHFUL' | 'FLEXIBLE') =>
  ({ id: 'c1', abilityScoreMethods: ['STANDARD_ARRAY'], detailLevel }) as unknown as Campaign;
const groups = () => screen.getAllByRole('group', { name: /Class: choose one/ });

describe('EquipmentStep', () => {
  it("shows the fighter's (a)/(b) groups as radios and a martial weapon select", () => {
    const harness = renderStep('equipment', FIGHTER);
    const [armor, weapons] = groups();
    expect(within(armor).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual([
      '(a) A cota-de-malha',
      '(b) A couro, Arco longo, 20 × G flechas',
    ]);
    expect(within(weapons).getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    fireEvent.click(within(armor).getByRole('radio', { name: /\(a\)/ }));
    fireEvent.click(within(weapons).getByRole('radio', { name: /\(a\)/ }));
    const select = screen.getByRole('combobox', { name: 'Any martial weapon' });
    const listed = within(select).getAllByRole('option').map((o) => o.getAttribute('value')).filter(Boolean);
    expect(listed).toEqual(['espada-longa', 'machado-grande', 'arco-longo', 'rapieira', 'espada-curta']);
    expect(nextButton()).toBeDisabled();

    fireEvent.change(select, { target: { value: 'espada-longa' } });
    expect(harness.choices().anyOfPicks).toEqual({ '1.0.0': 'espada-longa' });
    expect(harness.choices().equipmentPicks.slice(0, 2)).toEqual([0, 0]);
    expect(nextButton()).toBeEnabled();
    expect(screen.getByRole('cell', { name: 'Espada longa' })).toBeInTheDocument();

    // Two martial weapons: two selects, both needed.
    fireEvent.click(within(weapons).getByRole('radio', { name: /\(b\)/ }));
    expect(screen.getByRole('combobox', { name: 'Any martial weapon 1' })).toHaveValue('espada-longa');
    expect(nextButton()).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Any martial weapon 2' }), { target: { value: 'rapieira' } });
    expect(nextButton()).toBeEnabled();
  });

  it('offers no armor the character cannot wear', () => {
    renderStep('equipment', { ...FIGHTER, classSlug: 'clerigo', subclassSlug: 'campeao', backgroundSlug: 'acolito' });
    const [armor] = groups();
    expect(within(armor).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['(a) A brunea', '(b) A couro']);
  });

  it('a Life domain cleric is offered the chain mail', () => {
    renderStep('equipment', { ...FIGHTER, classSlug: 'clerigo', subclassSlug: 'dominio-da-vida', backgroundSlug: 'acolito' });
    expect(within(groups()[0]).getByRole('radio', { name: '(c) A cota-de-malha' })).toBeInTheDocument();
  });

  it('shows weights and the carrying capacity only in a Faithful campaign', () => {
    renderStep('equipment', { ...FIGHTER, equipmentPicks: [0] }, campaign('FAITHFUL'));
    expect(screen.getByRole('columnheader', { name: 'Weight (kg)' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '27.5' })).toBeInTheDocument();
    // STR 15: 225 lb, 112.5 kg.
    expect(screen.getByText(/Total weight: 27.5 kg of a 112.5 kg carrying capacity/)).toBeInTheDocument();
  });

  it('hides weights in a Flexible campaign', () => {
    renderStep('equipment', { ...FIGHTER, equipmentPicks: [0] }, campaign('FLEXIBLE'));
    expect(screen.getByRole('columnheader', { name: 'Item' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Weight (kg)' })).not.toBeInTheDocument();
    expect(screen.queryByText(/carrying capacity/)).not.toBeInTheDocument();
  });

  it('shows weights outside a campaign', () => {
    renderStep('equipment', { ...FIGHTER, equipmentPicks: [0] });
    expect(screen.getByRole('columnheader', { name: 'Weight (kg)' })).toBeInTheDocument();
  });
});
