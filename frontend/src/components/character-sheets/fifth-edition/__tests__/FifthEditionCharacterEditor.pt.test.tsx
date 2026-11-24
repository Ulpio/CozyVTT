/**
 * The 5E sheet editor in Portuguese: tab names, section headings, buttons,
 * a placeholder, an aria-label and what Save refuses, with the English gone.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import { FifthEditionCharacterEditor } from '../FifthEditionCharacterEditor';
import { fifthEditionCharacter } from './fifthEditionFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

function open() {
  render(
    <FifthEditionCharacterEditor
      character={fifthEditionCharacter()}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onCancel={vi.fn()}
    />
  );
}

describe('the 5e sheet editor in Portuguese', () => {
  it('shows the editor in Portuguese', async () => {
    await inPortuguese(() => {
      open();
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.getByRole('tablist', { name: 'Seções da ficha' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Nome do personagem')).toBeInTheDocument();
      expect(screen.getByLabelText('Nome do personagem')).toBeInTheDocument();
      for (const text of ['Atributos', 'Salvaguardas', 'Perícias']) {
        expect(screen.getByRole('heading', { name: text })).toBeInTheDocument();
      }

      fireEvent.click(screen.getByRole('tab', { name: /Combate/ }));
      for (const text of ['Pontos de vida', 'Dados de vida']) {
        expect(screen.getByRole('heading', { name: text })).toBeInTheDocument();
      }

      fireEvent.click(screen.getByRole('tab', { name: /Magias/ }));
      expect(screen.getByRole('heading', { name: 'Espaços de magia' })).toBeInTheDocument();
      expect(screen.getByText('Classe de conjuração')).toBeInTheDocument();

      for (const text of ['Saving Throws', 'Hit Points', 'Hit Dice', 'Spell Slots', 'Cancel', 'Save']) {
        expect(screen.queryByText(text)).toBeNull();
      }
    });
  });

  it('says what Save refuses in Portuguese', async () => {
    await inPortuguese(() => {
      open();
      fireEvent.change(screen.getByLabelText('Nome do personagem'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(screen.getByText('Esta ficha ainda não pode ser salva:')).toBeInTheDocument();
      expect(screen.getAllByText('O nome do personagem é obrigatório').length).toBeGreaterThan(0);
    });
  });
});
