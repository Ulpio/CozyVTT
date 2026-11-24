/**
 * Create New Character, in Portuguese.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import NewCharacterModal from '../NewCharacterModal';

vi.mock('@/services/api', () => {
  const api = { listCampaigns: () => Promise.resolve({ campaigns: [] }) };
  return { default: api, api };
});

describe('Create New Character in Portuguese', () => {
  it('shows the title, the fields and the buttons in Portuguese', async () => {
    await inPortuguese(() => {
      render(<NewCharacterModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
      expect(screen.getByRole('dialog', { name: 'Criar personagem' })).toBeInTheDocument();
      expect(screen.getByLabelText(/Nome do personagem/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Criar personagem' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Criar e publicar como modelo/ })).toBeInTheDocument();
      expect(screen.queryByText('Create New Character')).toBeNull();
      expect(screen.queryByText('Cancel')).toBeNull();
    });
  });
});
