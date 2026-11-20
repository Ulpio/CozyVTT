import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TokenLightDialog from '../TokenLightDialog';

function open(onApply = vi.fn()) {
  render(<TokenLightDialog name="Goblin" initial={null} onApply={onApply} onClose={vi.fn()} />);
  return onApply;
}

describe('TokenLightDialog', () => {
  it('applies a valid bright, dim and colour as a hand-set light', () => {
    const onApply = open();
    fireEvent.change(screen.getByLabelText('Bright radius (squares)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Dim radius (squares)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: '#33aaff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ brightRadius: 2, dimRadius: 5, color: '#33aaff', source: 'manual' });
  });

  it('refuses bright above dim, and radii past 120', () => {
    const onApply = open();
    fireEvent.change(screen.getByLabelText('Bright radius (squares)'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Dim radius (squares)'), { target: { value: '5' } });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Bright radius (squares)'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Dim radius (squares)'), { target: { value: '121' } });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
