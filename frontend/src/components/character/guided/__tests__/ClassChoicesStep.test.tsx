/**
 * Step 7: class, subclass and feat choices with the compendium text beside
 * each option; Skilled picks that may be tools; and, through the whole wizard,
 * a fighting style cleared when the class changes, with the notice.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CompendiumSearch } from '@/types';
import GuidedCreationModal from '../GuidedCreationModal';
import { compendiumPage } from './creationApiMock';
import { nextButton, renderStep } from './stepHarness';

const searchCompendium = vi.fn();
const getAbilityRoll = vi.fn();
vi.mock('@/services/api', () => {
  const client = {
    searchCompendium: (...a: unknown[]) => searchCompendium(...a),
    getAbilityRoll: (...a: unknown[]) => getAbilityRoll(...a),
    rollAbilities: vi.fn(),
  };
  return { api: client, default: client };
});

beforeEach(() => {
  vi.clearAllMocks();
  searchCompendium.mockImplementation((p: CompendiumSearch) => compendiumPage(p));
  getAbilityRoll.mockResolvedValue(null);
});

const group = (name: RegExp) => screen.getByRole('group', { name });

describe('ClassChoicesStep', () => {
  it("shows each fighting style with its paragraph of the class's feature text", () => {
    const harness = renderStep('classChoices', { raceSlug: 'anao', subraceSlug: 'anao-da-colina', classSlug: 'guerreiro', subclassSlug: 'campeao', backgroundSlug: 'soldado' });
    const styles = group(/Fighting style · Class/);
    const defense = within(styles).getByRole('radio', { name: 'Defesa' });
    expect(defense).toHaveAccessibleDescription('Defesa, texto inventado.');
    // A style the feature text does not describe has no text.
    expect(within(styles).getByRole('radio', { name: 'Proteção' })).not.toHaveAccessibleDescription();
    expect(nextButton()).toBeDisabled();
    fireEvent.click(defense);
    expect(harness.choices().optionPicks.fightingStyle).toEqual(['defesa']);
    expect(nextButton()).toBeEnabled();
  });

  it('Skilled (perito) picks may be skills or tools', () => {
    const harness = renderStep('classChoices', {
      raceSlug: 'humano',
      subraceSlug: 'humano-variante',
      classSlug: 'guerreiro',
      subclassSlug: 'campeao',
      backgroundSlug: 'soldado',
      optionPicks: { fightingStyle: ['defesa'] },
      skillPicks: ['perception', 'survival'],
    });
    fireEvent.click(within(group(/Feat · Subrace/)).getByRole('radio', { name: 'Perito' }));
    expect(screen.getByRole('radio', { name: 'Perito' })).toHaveAccessibleDescription(/inventado/);

    const skilled = group(/Skills or tools · Feat/);
    fireEvent.click(within(skilled).getByRole('checkbox', { name: 'Alaúde' }));
    fireEvent.click(within(skilled).getByRole('checkbox', { name: 'Arcana' }));
    fireEvent.click(within(skilled).getByRole('checkbox', { name: 'Ferramentas de ladrão' }));
    expect(within(skilled).getByRole('checkbox', { name: 'History' })).toBeDisabled();
    expect(harness.choices().optionPicks['feat:skillChoice:0']).toEqual(['alaude', 'ferramentas-de-ladrao']);
    expect(harness.choices().skillPicks).toContain('arcana');
  });

  it('a half-feat asks for its +1 here, and holds Next until it is picked', () => {
    const harness = renderStep('classChoices', {
      raceSlug: 'humano',
      subraceSlug: 'humano-variante',
      racialChoices: { abilityPicks: ['str', 'dex'] },
      classSlug: 'guerreiro',
      subclassSlug: 'campeao',
      backgroundSlug: 'soldado',
      optionPicks: { fightingStyle: ['defesa'], 'race:languageChoice:0': ['Orc'] },
      skillPicks: ['perception', 'survival', 'history'],
    });
    expect(nextButton()).toBeDisabled();
    fireEvent.click(within(group(/Feat · Subrace/)).getByRole('radio', { name: 'Atleta' }));
    const increase = within(group(/Ability increase · Feat/)).getByRole('combobox', { name: 'Ability +1 (1)' });
    // Athlete: Strength or Dexterity, even one the race raised.
    expect(within(increase).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['', 'str', 'dex']);
    expect(nextButton()).toBeDisabled();
    fireEvent.change(increase, { target: { value: 'str' } });
    expect(harness.choices().racialChoices.abilityPicks).toEqual(['str', 'dex', 'str']);
    expect(nextButton()).toBeEnabled();
  });

  it("cuts each invocation's text at the next invocation, offered or not", () => {
    renderStep('classChoices', { raceSlug: 'anao', subraceSlug: 'anao-da-colina', classSlug: 'bruxo', subclassSlug: 'o-corruptor', backgroundSlug: 'soldado' });
    const invocations = group(/Eldritch invocations · Class/);
    // Agonizing Blast needs Eldritch Blast, which this warlock does not know yet.
    expect(within(invocations).queryByRole('checkbox', { name: 'Explosão Agonizante' })).not.toBeInTheDocument();
    expect(within(invocations).getByRole('checkbox', { name: 'Armadura de Sombras' })).toHaveAccessibleDescription('Texto inventado A.');
    expect(within(invocations).getByRole('checkbox', { name: 'Idioma Bestial' })).toHaveAccessibleDescription('Texto inventado C.');
  });
});

describe('the wizard, steps 6 and 7', () => {
  const pick = (name: string | RegExp) => fireEvent.click(screen.getByRole('radio', { name }));
  const goTo = (name: string) => fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name }));

  it('a fighting style picked in step 7 is cleared when the class changes to wizard, with the notice', async () => {
    render(<GuidedCreationModal isOpen onClose={() => {}} onCreated={() => {}} />);
    await screen.findByRole('radio', { name: 'Anão' });
    pick('Anão');
    pick('Anão da Colina');
    fireEvent.click(nextButton());
    pick('Guerreiro');
    // A fighter without Eldritch Knight has no spells step; a wizard has.
    expect(within(screen.getByRole('navigation')).queryByRole('button', { name: 'Spells' })).not.toBeInTheDocument();
    fireEvent.click(nextButton());
    pick('Sub campeao');
    fireEvent.click(nextButton());
    pick('Soldado');
    fireEvent.click(nextButton());
    fireEvent.click(nextButton()); // Point buy at 8 is complete.

    // Skills both classes share, and the soldier's gaming set.
    fireEvent.click(screen.getByRole('checkbox', { name: 'History' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Insight' }));
    pick('Kit de jogo: conjunto de dados');
    fireEvent.click(nextButton());

    expect(screen.getByRole('heading', { name: 'Class choices' })).toBeInTheDocument();
    pick('Defesa');
    expect(screen.queryByText(/Some choices were cleared/)).not.toBeInTheDocument();

    goTo('Class');
    pick('Mago');
    expect(screen.getByText(/Some choices were cleared/)).toBeInTheDocument();
    expect(within(screen.getByRole('navigation')).getByRole('button', { name: 'Spells' })).toBeInTheDocument();

    // Back to fighter: the style is not picked any more.
    pick('Guerreiro');
    goTo('Subclass');
    pick('Sub campeao');
    goTo('Class choices');
    expect(screen.getByRole('heading', { name: 'Class choices' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Defesa' })).not.toBeChecked();
  });
});
