/**
 * The Walls panel's title, which folds and unfolds the panel.
 *
 * It was a clickable box, out of reach of Tab and silent about whether the
 * panel was open.
 */

import { describe, it, expect, vi } from 'vitest';
import type { WallType } from '@/types/walls';
import { wallStrokeColor } from '../map/layers/drawWalls';
import { render, screen, fireEvent } from '@testing-library/react';
import GmWallControls from '../GmWallControls';

it('is a button that says whether the panel is open, and folds it', () => {
  const onCollapse = vi.fn();
  render(
    <GmWallControls
      wallMode={null}
      onWallModeChange={vi.fn()}
      onCollapse={onCollapse}
      wallType="wall"
      onWallTypeChange={vi.fn()}
      snapToGrid
      onSnapToGridChange={vi.fn()}
      snapToEndpoint
      onSnapToEndpointChange={vi.fn()}
      wallCount={3}
      onClearAll={vi.fn()}
      wallColor="#f97316"
      onWallColorChange={vi.fn()}
    />
  );
  // A space between the word and the count, which read as "Walls(3)".
  const title = screen.getByRole('button', { name: 'Walls (3)' });
  expect(title).toHaveAttribute('aria-expanded', 'false');

  fireEvent.click(title);
  expect(title).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById(title.getAttribute('aria-controls') ?? '')).not.toBeNull();

  fireEvent.click(title);
  expect(title).toHaveAttribute('aria-expanded', 'false');
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

describe('wall type chips', () => {
  const baseProps = {
    wallMode: 'wall-draw' as const,
    onWallModeChange: vi.fn(),
    onCollapse: vi.fn(),
    onWallTypeChange: vi.fn(),
    snapToGrid: true,
    onSnapToGridChange: vi.fn(),
    snapToEndpoint: true,
    onSnapToEndpointChange: vi.fn(),
    wallCount: 3,
    onClearAll: vi.fn(),
    wallColor: '#f97316',
    onWallColorChange: vi.fn(),
  };
  const labels: Record<WallType, string> = {
    wall: 'Wall', 'door-closed': 'Door', 'door-open': 'Open Door', 'door-locked': 'Locked', window: 'Window',
  };
  // jsdom normalises colours, so compare through an element.
  const norm = (c: string) => {
    const el = document.createElement('div');
    el.style.backgroundColor = c;
    return el.style.backgroundColor;
  };

  it.each(Object.keys(labels) as WallType[])('shows the colour the map draws a %s in', (type) => {
    render(<GmWallControls {...baseProps} wallType={type} />);
    fireEvent.click(screen.getByRole('button', { name: /^Walls/ }));
    const chip = screen.getByRole('button', { name: `Wall type: ${labels[type]}` });
    const swatch = chip.querySelector('[data-wall-swatch]') as HTMLElement;
    expect(swatch).not.toBeNull();
    expect(swatch.style.backgroundColor).toBe(norm(wallStrokeColor(type, '#f97316')));
  });
});
