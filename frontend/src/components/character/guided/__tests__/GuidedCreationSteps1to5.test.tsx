/**
 * The guided creation wizard, steps 1 to 5: loading the compendium page by
 * page, picking race and subrace, class, subclass and background, Next held
 * until a step's picks are made, choices that a change made invalid cleared
 * with a notice, and the empty state when the campaign's books are off.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import type { Campaign, CompendiumSearch } from '@/types';
import { CREATION_DATA } from '@/utils/guidedCreation/__tests__/fixtures/creationData';
import GuidedCreationModal from '../GuidedCreationModal';
import { useCreationState } from '../useCreationState';
import { compendiumPage, EMPTY_DATA, entriesOf, MOCK_PAGE_SIZE } from './creationApiMock';

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

beforeEach(() => {
  vi.clearAllMocks();
  searchCompendium.mockImplementation((p: CompendiumSearch) => compendiumPage(p));
  getAbilityRoll.mockResolvedValue(null);
});

const open = () => render(<GuidedCreationModal isOpen onClose={() => {}} onCreated={() => {}} />);
const next = () => screen.getByRole('button', { name: 'Next' });
const pick = (name: string | RegExp) => fireEvent.click(screen.getByRole('radio', { name }));

describe('GuidedCreationModal, steps 1 to 5', () => {
  it('loads every type with full entries, page by page', async () => {
    open();
    await screen.findByRole('radio', { name: /Anão/ });
    const spellPages = Math.ceil(entriesOf('spell').length / MOCK_PAGE_SIZE);
    const spellCalls = searchCompendium.mock.calls.filter(([p]) => p.type === 'spell');
    expect(spellCalls).toHaveLength(spellPages);
    expect(spellCalls.map(([p]) => p.page)).toEqual(Array.from({ length: spellPages }, (_, i) => i + 1));
    for (const [params] of searchCompendium.mock.calls) expect(params).toMatchObject({ full: true, pageSize: 200 });
    const types = new Set(searchCompendium.mock.calls.map(([p]) => p.type));
    expect([...types].sort()).toEqual(
      ['armor', 'background', 'class', 'feat', 'gear', 'pack', 'race', 'spell', 'subclass', 'subrace', 'tool', 'weapon'],
    );
  });

  it('lists the races and, after Anão is picked, its subraces; Next waits for both', async () => {
    open();
    await screen.findByRole('radio', { name: /Anão/ });
    for (const race of CREATION_DATA.races) expect(screen.getByRole('radio', { name: race.name })).toBeInTheDocument();
    expect(next()).toBeDisabled();

    pick('Anão');
    expect(screen.getByRole('radio', { name: 'Anão da Colina' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Alto Elfo' })).not.toBeInTheDocument();
    // The trait text comes from the compendium entry.
    expect(screen.getAllByText(/Anão traço/).length).toBeGreaterThan(0);
    // Speed in feet, as the summary and the saved sheet give it (7,5 m).
    expect(screen.getByText('25 ft')).toBeInTheDocument();
    expect(next()).toBeDisabled();

    pick('Anão da Colina');
    expect(next()).toBeEnabled();
  });

  it('a human needs no subrace, but may take the variant', async () => {
    open();
    await screen.findByRole('radio', { name: 'Humano' });
    pick('Humano');
    expect(screen.getByRole('radio', { name: 'Humano Variante' })).toBeInTheDocument();
    expect(next()).toBeEnabled();
  });

  it('holds Next on class, subclass and background until each is picked', async () => {
    open();
    await screen.findByRole('radio', { name: 'Humano' });
    pick('Humano');
    fireEvent.click(next());

    expect(screen.getByRole('heading', { name: 'Class' })).toBeInTheDocument();
    expect(next()).toBeDisabled();
    pick('Guerreiro');
    expect(next()).toBeEnabled();
    fireEvent.click(next());

    expect(screen.getByRole('heading', { name: 'Subclass' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Sub caminho-do-guerreiro-totemico' })).not.toBeInTheDocument();
    expect(next()).toBeDisabled();
    pick('Sub campeao');
    fireEvent.click(next());

    expect(screen.getByRole('heading', { name: 'Background' })).toBeInTheDocument();
    expect(next()).toBeDisabled();
    pick('Soldado');
    fireEvent.click(next());

    expect(screen.getByRole('heading', { name: 'Ability scores' })).toBeInTheDocument();
  });

  it('going back to Class and changing it clears the subclass and says so', async () => {
    open();
    await screen.findByRole('radio', { name: 'Humano' });
    pick('Humano');
    fireEvent.click(next());
    pick('Guerreiro');
    fireEvent.click(next());
    pick('Sub campeao');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.queryByText(/Some choices were cleared/)).not.toBeInTheDocument();
    pick('Bárbaro');
    expect(screen.getByText(/Some choices were cleared/)).toBeInTheDocument();

    fireEvent.click(next());
    expect(screen.queryByRole('radio', { name: 'Sub campeao' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sub caminho-do-guerreiro-totemico' })).not.toBeChecked();
    expect(next()).toBeDisabled();
  });

  it('moves focus to the heading of the step it opens', async () => {
    open();
    await screen.findByRole('radio', { name: 'Humano' });
    pick('Humano');
    fireEvent.click(next());
    expect(screen.getByRole('heading', { name: 'Class' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Race' })).toHaveFocus();
  });

  it('says when the books have no background', async () => {
    searchCompendium.mockImplementation((p: CompendiumSearch) => compendiumPage(p, { ...CREATION_DATA, backgrounds: [] }));
    open();
    await screen.findByRole('radio', { name: 'Humano' });
    pick('Humano');
    fireEvent.click(next());
    pick('Guerreiro');
    fireEvent.click(next());
    pick('Sub campeao');
    fireEvent.click(next());
    expect(screen.getByText('No background is in the books.')).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  it('shows a message instead of the steps when the compendium is empty', async () => {
    searchCompendium.mockImplementation((p: CompendiumSearch) => compendiumPage(p, EMPTY_DATA));
    open();
    expect(await screen.findByText('No books with character options are available.')).toBeInTheDocument();
    expect(screen.queryByText(/campaign|GM/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('inside a campaign, the empty compendium points to the GM', async () => {
    searchCompendium.mockImplementation((p: CompendiumSearch) => compendiumPage(p, EMPTY_DATA));
    const campaign = { id: 'c1', abilityScoreMethods: ['POINT_BUY'], detailLevel: 'FLEXIBLE' } as unknown as Campaign;
    render(<GuidedCreationModal isOpen onClose={() => {}} onCreated={() => {}} campaign={campaign} />);
    expect(await screen.findByText(/The GM can turn them on/)).toBeInTheDocument();
  });

  it('shows the error when the compendium does not load', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    searchCompendium.mockRejectedValue(new Error('boom'));
    open();
    expect(await screen.findByText(/Could not load the compendium/)).toBeInTheDocument();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('useCreationState', () => {
  it('changing fighter clears the fighting style and reports it', () => {
    const { result } = renderHook(() => useCreationState(CREATION_DATA));
    act(() => result.current.dispatch({ type: 'update', patch: { raceSlug: 'humano', classSlug: 'guerreiro' } }));
    act(() => result.current.dispatch({ type: 'update', patch: { optionPicks: { fightingStyle: ['defesa'] } } }));
    expect(result.current.choices.optionPicks.fightingStyle).toEqual(['defesa']);
    expect(result.current.cleared).toEqual([]);

    act(() => result.current.dispatch({ type: 'update', patch: { classSlug: 'barbaro' } }));
    expect(result.current.choices.optionPicks.fightingStyle).toBeUndefined();
    expect(result.current.cleared).toContain('optionPicks.fightingStyle');

    act(() => result.current.dispatch({ type: 'dismissCleared' }));
    expect(result.current.cleared).toEqual([]);
  });

  it('a new race drops racial ability picks it does not offer', () => {
    const { result } = renderHook(() => useCreationState(CREATION_DATA));
    act(() =>
      result.current.dispatch({ type: 'update', patch: { raceSlug: 'meio-elfo', racialChoices: { abilityPicks: ['str', 'dex'] } } }),
    );
    expect(result.current.cleared).toEqual([]);
    act(() => result.current.dispatch({ type: 'update', patch: { raceSlug: 'anao' } }));
    expect(result.current.choices.racialChoices.abilityPicks).toBeUndefined();
    expect(result.current.cleared).toContain('racialChoices.abilityPicks');
  });

  it('does not prune before the compendium has loaded', () => {
    const { result } = renderHook(() => useCreationState(null));
    act(() => result.current.dispatch({ type: 'update', patch: { classSlug: 'guerreiro', subclassSlug: 'campeao' } }));
    expect(result.current.choices.subclassSlug).toBe('campeao');
  });
});
