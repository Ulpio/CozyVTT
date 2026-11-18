import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TurnStrip from '../TurnStrip';
import { combatTurn } from './barHarness';

describe('TurnStrip', () => {
  it('shows what is left of the movement, in metres', () => {
    render(<TurnStrip combat={combatTurn({ spend: { movedFeet: 15 } }) as never} />);
    expect(screen.getByText('Movement: 4,5 of 9 m')).toBeInTheDocument();
  });

  it('shows whose turn it is', () => {
    const { rerender } = render(<TurnStrip combat={combatTurn() as never} />);
    expect(screen.getByText('Your turn')).toBeInTheDocument();
    rerender(<TurnStrip combat={combatTurn({ yourTurn: false }) as never} />);
    expect(screen.getByText('Not your turn')).toBeInTheDocument();
  });

  it('fills a pip for what is still free', () => {
    render(<TurnStrip combat={combatTurn({ spend: { action: true } }) as never} />);
    expect(screen.getByLabelText('Action: used')).toBeInTheDocument();
    expect(screen.getByLabelText('Bonus: free')).toBeInTheDocument();
    expect(screen.getByLabelText('Reaction: free')).toBeInTheDocument();
  });

  it('counts the attacks of the Attack action while some are left', () => {
    const { rerender } = render(<TurnStrip combat={combatTurn({ attacksPerAction: 2, spend: { action: true, attackActionTaken: true, attacksLeft: 1 } }) as never} />);
    expect(screen.getByText('Attack 2 of 2')).toBeInTheDocument();
    rerender(<TurnStrip combat={combatTurn({ attacksPerAction: 2, spend: { action: true, attackActionTaken: true, attacksLeft: 0 } }) as never} />);
    expect(screen.queryByText(/^Attack \d/)).toBeNull();
    rerender(<TurnStrip combat={combatTurn({ attacksPerAction: 2 }) as never} />);
    expect(screen.queryByText(/^Attack \d/)).toBeNull();
  });
});

describe('TurnStrip for a monster', () => {
  it('says Multiattack instead of counting to a hundred', () => {
    render(<TurnStrip combat={combatTurn({ attacksPerAction: 100, spend: { action: true, attackActionTaken: true, attacksLeft: 99 } }) as never} />);
    expect(screen.getByText('Multiattack')).toBeInTheDocument();
    expect(screen.queryByText(/^Attack \d/)).toBeNull();
  });
});
