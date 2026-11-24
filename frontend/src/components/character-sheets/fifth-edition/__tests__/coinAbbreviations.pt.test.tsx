import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryPanel } from '../components/InventoryPanel';
import { InventoryList } from '../components/InventoryList';
import { inPortuguese } from '@/test/inPortuguese';

vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({ socket: null }),
}));

const currency = { cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 };

describe('coin abbreviations on the sheet', () => {
  it('are the editor ones in Portuguese: platinum PL, silver PP', async () => {
    await inPortuguese(() => {
      render(<InventoryPanel characterId="c" inventory={[]} currency={currency} />);
      expect(screen.getByText('PL')).toBeInTheDocument();
      expect(screen.getByText('PP')).toBeInTheDocument();
      expect(screen.getByText('PO')).toBeInTheDocument();
      expect(screen.getByText('PE')).toBeInTheDocument();
      expect(screen.getByText('PC')).toBeInTheDocument();
    });
  });

  it('are the editor ones in the other list too', async () => {
    await inPortuguese(() => {
      render(<InventoryList inventory={[]} currency={currency} />);
      expect(screen.getByText('PL')).toBeInTheDocument();
      expect(screen.getByText('PO')).toBeInTheDocument();
    });
  });

  it('stay PP/GP/EP/SP/CP in English', () => {
    render(<InventoryPanel characterId="c" inventory={[]} currency={currency} />);
    for (const c of ['PP', 'GP', 'EP', 'SP', 'CP']) expect(screen.getByText(c)).toBeInTheDocument();
  });
});
