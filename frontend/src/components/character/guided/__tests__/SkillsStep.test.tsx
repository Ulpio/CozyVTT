/**
 * Step 6: background skills fixed, class skills from its list (one already
 * owned is not offered), the class limit held, and the languages and tools
 * the background and class owe.
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { nextButton, renderStep } from './stepHarness';

const DWARF = { raceSlug: 'anao', subraceSlug: 'anao-da-colina' };
const group = (name: RegExp) => screen.getByRole('group', { name });
const check = (scope: HTMLElement, name: string) => fireEvent.click(within(scope).getByRole('checkbox', { name }));

describe('SkillsStep', () => {
  it("an acolyte cleric is not offered Religion among the class's picks", () => {
    renderStep('skills', { ...DWARF, classSlug: 'clerigo', subclassSlug: 'dominio-da-vida', backgroundSlug: 'acolito' });
    expect(screen.getByText('Insight, Religion')).toBeInTheDocument();
    expect(screen.getByText(/Already yours, so not offered again: Insight, Religion/)).toBeInTheDocument();

    const classSkills = group(/Skills · Class/);
    const offered = within(classSkills).getAllByRole('checkbox').map((c) => c.getAttribute('value'));
    expect(offered).toEqual(['history', 'medicine', 'persuasion']);
    expect(within(classSkills).queryByRole('checkbox', { name: 'Religion' })).not.toBeInTheDocument();
    expect(within(classSkills).getByText('0/2')).toBeInTheDocument();
  });

  it('holds the class at two skills, and Next until skills and languages are picked', () => {
    const harness = renderStep('skills', { ...DWARF, classSlug: 'clerigo', subclassSlug: 'dominio-da-vida', backgroundSlug: 'acolito' });
    const classSkills = group(/Skills · Class/);
    check(classSkills, 'History');
    check(classSkills, 'Medicine');
    expect(within(classSkills).getByRole('checkbox', { name: 'Persuasion' })).toBeDisabled();
    fireEvent.click(within(classSkills).getByRole('checkbox', { name: 'Persuasion' }));
    expect(harness.choices().skillPicks).toEqual(['history', 'medicine']);
    expect(nextButton()).toBeDisabled();

    // The acolyte's two languages; the dwarf's own are not offered.
    const languages = group(/Languages · Background/);
    expect(within(languages).queryByRole('checkbox', { name: 'Anão' })).not.toBeInTheDocument();
    check(languages, 'Gigante');
    check(languages, 'Orc');
    expect(harness.choices().languagePicks).toEqual(['Gigante', 'Orc']);
    expect(nextButton()).toBeEnabled();

    // Taking one back frees a place.
    check(classSkills, 'Medicine');
    expect(within(classSkills).getByRole('checkbox', { name: 'Persuasion' })).toBeEnabled();
    expect(nextButton()).toBeDisabled();
  });

  it('the bard picks three musical instruments; the background its own', () => {
    const harness = renderStep('skills', { ...DWARF, classSlug: 'bardo', subclassSlug: 'colegio-do-conhecimento', backgroundSlug: 'artista' });
    const classTools = group(/Tools · Class/);
    expect(within(classTools).getAllByRole('checkbox').map((c) => c.getAttribute('value'))).toEqual(['alaude', 'flauta', 'lira']);
    check(classTools, 'Flauta');
    check(classTools, 'Lira');
    check(classTools, 'Alaúde');
    expect(harness.choices().optionPicks['class:toolChoice:0']).toEqual(['flauta', 'lira', 'alaude']);

    // The background owes one instrument: a single pick is a radio.
    fireEvent.click(within(group(/Tools · Background/)).getByRole('radio', { name: 'Flauta' }));
    expect(harness.choices().toolPicks).toEqual(['flauta']);
  });

  it("the monk picks one artisan's tool or one musical instrument", () => {
    const harness = renderStep('skills', { ...DWARF, classSlug: 'monge', subclassSlug: 'caminho-dos-quatro-elementos', backgroundSlug: 'acolito' });
    const classTools = group(/Tools · Class/);
    expect(within(classTools).getAllByRole('radio').map((c) => c.getAttribute('value'))).toEqual([
      'alaude',
      'flauta',
      'lira',
      'ferramentas-de-ferreiro',
    ]);
    fireEvent.click(within(classTools).getByRole('radio', { name: 'Ferramentas de ferreiro' }));
    expect(harness.choices().optionPicks['class:toolChoice:0']).toEqual(['ferramentas-de-ferreiro']);
  });
});
