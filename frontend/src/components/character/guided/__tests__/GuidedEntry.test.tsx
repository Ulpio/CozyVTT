/**
 * The way in: New Character offers "Guided creation" for 5e, and choosing it
 * opens the wizard for the chosen campaign instead of creating a blank sheet.
 * The character the wizard makes is handed on as New Character's own.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Campaign, Character } from '@/types';
import i18n from '@/i18n';
import NewCharacterModal from '../../NewCharacterModal';
import type { GuidedCreationModalProps } from '../GuidedCreationModal';

const listCampaigns = vi.fn();
const createCharacter = vi.fn();
const getStarterSheet = vi.fn();
vi.mock('@/services/api', () => {
  const client = {
    listCampaigns: () => listCampaigns(),
    createCharacter: (...a: unknown[]) => createCharacter(...a),
    getStarterSheet: (...a: unknown[]) => getStarterSheet(...a),
  };
  return { api: client, default: client };
});

// The wizard itself is tested on its own: here it only shows what it was given.
let wizard: GuidedCreationModalProps | undefined;
vi.mock('../GuidedCreationModal', () => ({
  default: (props: GuidedCreationModalProps) => {
    wizard = props;
    return props.isOpen ? <div role="dialog" aria-label="Wizard">{props.campaign?.name ?? 'no campaign'}</div> : null;
  },
}));

const LANTERN = {
  id: 'camp-lantern',
  name: 'Lantern Road',
  gameSystem: 'FIFTH_EDITION',
  abilityScoreMethods: ['STANDARD_ARRAY', 'ROLL'],
  detailLevel: 'FAITHFUL',
} as Campaign;

beforeEach(() => {
  wizard = undefined;
  listCampaigns.mockReset().mockResolvedValue({ campaigns: [LANTERN] });
  createCharacter.mockReset();
  getStarterSheet.mockReset();
});

describe('Guided creation in New Character', () => {
  it('is offered for 5e only, and opens the wizard for the chosen campaign', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<NewCharacterModal isOpen onClose={onClose} onSuccess={onSuccess} />);
    await screen.findByRole('option', { name: /Lantern Road/ });
    expect(screen.queryByRole('radio', { name: /Guided creation/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Campaign/), { target: { value: 'camp-lantern' } });
    fireEvent.click(await screen.findByRole('radio', { name: /Guided creation/ }));
    // The wizard asks for the name itself.
    expect(screen.queryByLabelText(/Character Name/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start guided creation/i }));

    expect(screen.getByRole('dialog', { name: 'Wizard' })).toHaveTextContent('Lantern Road');
    expect(wizard?.campaign).toEqual(LANTERN);
    expect(createCharacter).not.toHaveBeenCalled();
    expect(getStarterSheet).not.toHaveBeenCalled();

    const made = { id: 'char-1', name: 'Brom' } as Character;
    act(() => wizard!.onCreated(made));
    expect(onSuccess).toHaveBeenCalledWith(made);
    expect(onClose).toHaveBeenCalled();
  });

  it('opens without a campaign for an unassigned 5e character, and closing it goes back', async () => {
    render(<NewCharacterModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole('option', { name: /Lantern Road/ });
    fireEvent.change(screen.getByLabelText(/^Game System/), { target: { value: 'FIFTH_EDITION' } });
    fireEvent.click(screen.getByRole('radio', { name: /Guided creation/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start guided creation/i }));
    expect(screen.getByRole('dialog', { name: 'Wizard' })).toHaveTextContent('no campaign');

    act(() => wizard!.onClose());
    expect(await screen.findByRole('radio', { name: /Guided creation/ })).toBeChecked();
  });
});

describe('Guided creation in New Character, in Portuguese', () => {
  afterEach(() => act(() => void i18n.changeLanguage('en')));

  it('names the option and its button in the chosen language', async () => {
    await act(() => i18n.changeLanguage('pt-BR'));
    render(<NewCharacterModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole('option', { name: /Lantern Road/ });
    fireEvent.change(screen.getByLabelText(/^Game System/), { target: { value: 'FIFTH_EDITION' } });
    fireEvent.click(screen.getByRole('radio', { name: /Criação guiada/ }));
    expect(screen.getByRole('button', { name: /Iniciar criação guiada/ })).toBeInTheDocument();
  });
});
