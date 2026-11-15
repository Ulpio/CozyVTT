/**
 * Closing the guided creation: at once while nothing is chosen, after a
 * question once something is (the X and Escape alike), and never from an
 * Escape pressed in a field.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CompendiumSearch } from '@/types';
import GuidedCreationModal from '../GuidedCreationModal';
import { compendiumPage } from './creationApiMock';

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

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const pick = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const closeButton = () => screen.getAllByRole('button', { name: 'Close dialog' })[0];
const escape = (on: Element = document.body) => fireEvent.keyDown(on, { key: 'Escape' });

async function open() {
  const onClose = vi.fn();
  render(<GuidedCreationModal isOpen onClose={onClose} onCreated={() => {}} />);
  await screen.findByRole('radio', { name: 'Humano' });
  await nextFrame();
  return onClose;
}

describe('closing the guided creation', () => {
  it('closes at once from the X or Escape while nothing is chosen', async () => {
    const onClose = await open();
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    escape();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Discard this character?')).not.toBeInTheDocument();
  });

  it('asks before closing once a choice is made, from the X and from Escape', async () => {
    const onClose = await open();
    pick('Humano');

    fireEvent.click(closeButton());
    expect(screen.getByText('Discard this character?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep creating' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Humano' })).toBeChecked();

    escape();
    expect(screen.getByText('Discard this character?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('an Escape pressed in a field neither closes nor asks', async () => {
    const onClose = await open();
    pick('Humano');
    next();
    pick('Guerreiro');
    next();
    pick('Sub campeao');
    next();
    pick('Soldado');
    next();
    const field = screen.getByRole('combobox', { name: 'Strength Base' });
    field.focus();

    escape(field);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard this character?')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ability scores' })).toBeInTheDocument();
  });
});
