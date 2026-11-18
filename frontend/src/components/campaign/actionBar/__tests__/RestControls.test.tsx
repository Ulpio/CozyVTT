import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RestControls from '../RestControls';
import ActorSummary from '../ActorSummary';
import { useGameStore } from '@/stores/gameStore';
import { token } from './barHarness';

const takeRest = vi.hoisted(() => vi.fn());
const emitHitDiceSpend = vi.hoisted(() => vi.fn());
const rollDice = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({ socket: { takeRest, emitHitDiceSpend, rollDice } }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const combat = (active: boolean) => useGameStore.getState().setCombatState({ active, round: 1, currentTokenId: null, combatants: [], spend: {} });

beforeEach(() => {
  takeRest.mockReset().mockResolvedValue({ ok: true });
  emitHitDiceSpend.mockReset();
  rollDice.mockReset().mockResolvedValue({ ok: true, id: 'r1' });
  showToast.mockReset();
  combat(false);
});

describe('RestControls', () => {
  it('takes a long rest with one click', async () => {
    render(<RestControls characterId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Long rest' }));
    await waitFor(() => expect(takeRest).toHaveBeenCalledWith({ characterIds: ['c1'], kind: 'long' }));
  });

  it('is off, with the refusal as its text, while a fight is on', () => {
    combat(true);
    render(<RestControls characterId="c1" />);
    for (const name of ['Short rest', 'Long rest']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'You cannot rest during a fight.');
    }
  });

  it('says why when the server refuses', async () => {
    takeRest.mockResolvedValue({ ok: false, error: 'Não dá para descansar durante o combate.' });
    render(<RestControls characterId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Long rest' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('You cannot rest during a fight.', 'error'));
  });

  it('lists the hit dice left in the short rest and spends one per click', async () => {
    const hitDice = [{ class: 'Fighter', die: 'd10', maximum: 3, remaining: 2 }, { class: 'Rogue', die: 'd8', maximum: 1, remaining: 0 }];
    render(<RestControls characterId="c1" hitDice={hitDice} con={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Short rest' }));
    const spend = screen.getAllByRole('button', { name: /^Spend/ });
    expect(spend).toHaveLength(1);
    fireEvent.click(spend[0]);
    await waitFor(() => expect(emitHitDiceSpend).toHaveBeenCalledWith({ characterId: 'c1', index: 0 }));
    expect(rollDice).toHaveBeenCalledWith(expect.objectContaining({ expression: 'd10+2' }));
    expect(takeRest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Take the short rest' }));
    await waitFor(() => expect(takeRest).toHaveBeenCalledWith({ characterIds: ['c1'], kind: 'short' }));
  });
});

describe('ActorSummary', () => {
  it('carries the rest buttons of the actor', () => {
    render(<ActorSummary token={token({ id: 't' })} hp={null} ac={null} restFor={{ characterId: 'c1' }} />);
    expect(screen.getByRole('button', { name: 'Short rest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Long rest' })).toBeInTheDocument();
  });

  it('has none for a creature', () => {
    render(<ActorSummary token={token({ id: 't' })} hp={null} ac={null} />);
    expect(screen.queryByRole('button', { name: 'Long rest' })).toBeNull();
  });
});
