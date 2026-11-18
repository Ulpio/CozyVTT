import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FifthEditionCharacterView } from '../FifthEditionCharacterView';
import { fifthEditionCharacter } from './fifthEditionFixture';
import { useGameStore } from '@/stores/gameStore';

vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({ socket: { takeRest: vi.fn(), emitHitDiceSpend: vi.fn(), rollDice: vi.fn() } }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

describe('the 5E sheet and rests', () => {
  it('offers both rests to a viewer who may spend its hit dice', () => {
    render(<FifthEditionCharacterView character={fifthEditionCharacter()} onSpendHitDie={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
    expect(screen.getByRole('button', { name: 'Short rest' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Long rest' })).toBeEnabled();
  });

  it('turns them off, with the refusal, while a fight is on', () => {
    useGameStore.getState().setCombatState({ active: true, round: 1, currentTokenId: null, combatants: [], spend: {} });
    render(<FifthEditionCharacterView character={fifthEditionCharacter()} onSpendHitDie={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
    expect(screen.getByRole('button', { name: 'Long rest' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Long rest' })).toHaveAttribute('title', 'You cannot rest during a fight.');
    useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [], spend: {} });
  });

  it('offers none where there is no table to rest at', () => {
    render(<FifthEditionCharacterView character={fifthEditionCharacter()} />);
    expect(screen.queryByRole('button', { name: 'Long rest' })).toBeNull();
  });
});
