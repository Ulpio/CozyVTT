/**
 * The 5E read-only sheet in Portuguese: headings, labels and the values the
 * sheet words itself (conditions, damage types), with nothing English left.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import { FifthEditionCharacterView } from '../FifthEditionCharacterView';
import { fifthEditionCharacter } from './fifthEditionFixture';

describe('the 5e sheet in Portuguese', () => {
  it('shows the sheet in Portuguese', async () => {
    await inPortuguese(() => {
      render(
        <FifthEditionCharacterView
          character={fifthEditionCharacter({ inspiration: true, experiencePoints: 300 })}
          onEdit={() => {}}
        />
      );
      for (const text of ['Atributos', 'Salvaguardas', 'Perícias', 'Bônus de proficiência', 'Inspiração', 'Experiência', 'Percepção passiva', 'Acrobacia']) {
        expect(screen.getByText(text)).toBeInTheDocument();
      }
      expect(screen.getByText('Nível 1 Human Fighter')).toBeInTheDocument();
      expect(screen.getByTitle('Editar personagem')).toBeInTheDocument();
      expect(screen.getByText('Sim')).toBeInTheDocument();
      expect(screen.getByText('FOR')).toBeInTheDocument();
      expect(screen.getByText('força')).toBeInTheDocument();
      for (const text of ['Ability Scores', 'Saving Throws', 'Armor Class', 'Skills', 'Strength']) {
        expect(screen.queryByText(text)).toBeNull();
      }

      fireEvent.click(screen.getByRole('tab', { name: /Combate/ }));
      for (const text of ['Classe de Armadura', 'Iniciativa', 'Deslocamento', 'Pontos de vida']) {
        expect(screen.getByText(text)).toBeInTheDocument();
      }
      expect(screen.queryByText('Armor Class')).toBeNull();
    });
  });

  it('shows spells, attacks, conditions and items in Portuguese', async () => {
    const character = fifthEditionCharacter({
      conditions: ['Blinded'],
      exhaustionLevel: 2,
      attacks: [
        { name: 'Longsword', attackBonus: 5, damageRoll: '1d8+3', damageType: 'slashing', range: 5, properties: ['versatile'], notes: '' },
      ],
      inventory: [{ name: 'Rope', quantity: 1, weight: 10, id: 'i1' }],
      spellcasting: {
        class: 'Wizard',
        ability: 'Intelligence',
        spellSaveDC: 13,
        spellAttackBonus: 5,
        cantrips: ['Fire Bolt'],
        slots: { '1': { total: 2, expended: 0 } },
        spells: [{ name: 'Shield', level: 1, prepared: true, ritual: false, concentration: false }],
      },
    });
    await inPortuguese(() => {
      render(<FifthEditionCharacterView character={character} />);

      fireEvent.click(screen.getByRole('tab', { name: /Combate/ }));
      expect(screen.getByText('Ataques e armas')).toBeInTheDocument();
      expect(screen.getByText('Cortante')).toBeInTheDocument();
      expect(screen.getByText('Versátil')).toBeInTheDocument();
      expect(screen.getByText('Cego')).toBeInTheDocument();
      expect(screen.getByText('Condições')).toBeInTheDocument();
      expect(screen.getByText('Exaustão')).toBeInTheDocument();
      expect(screen.getByText('Nível 2')).toBeInTheDocument();
      expect(screen.getByText('Deslocamento reduzido à metade')).toBeInTheDocument();
      expect(screen.queryByText('Attacks & Weapons')).toBeNull();
      expect(screen.queryByText('slashing')).toBeNull();
      expect(screen.queryByText('Blinded')).toBeNull();

      fireEvent.click(screen.getByRole('tab', { name: /Magias/ }));
      expect(screen.getByText('Conjuração de Wizard')).toBeInTheDocument();
      expect(screen.getByText('Habilidade de conjuração')).toBeInTheDocument();
      expect(screen.getByText('CD de salvaguarda')).toBeInTheDocument();
      expect(screen.getByText('Ataque com magia')).toBeInTheDocument();
      expect(screen.getByText('Espaços de magia')).toBeInTheDocument();
      expect(screen.getByText('Lista de magias')).toBeInTheDocument();
      expect(screen.getByText('Truques')).toBeInTheDocument();
      expect(screen.getByText('Magia preparada')).toBeInTheDocument();
      expect(screen.queryByText('Spell Slots')).toBeNull();

      fireEvent.click(screen.getByRole('tab', { name: /Inventário/ }));
      expect(screen.getByText('Mochila')).toBeInTheDocument();
    });
  });
});
