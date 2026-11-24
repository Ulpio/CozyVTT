/**
 * The GM's walls, light and fog panels, in Portuguese.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import GmWallControls from '../GmWallControls';
import GmLightControls from '../GmLightControls';
import GmFogControls from '../GmFogControls';

describe('walls panel in Portuguese', () => {
  it('names the modes and the wall types', async () => {
    await inPortuguese(async () => {
      render(
        <GmWallControls
          wallMode="wall-draw"
          onWallModeChange={vi.fn()}
          wallType="wall"
          onWallTypeChange={vi.fn()}
          snapToGrid={false}
          onSnapToGridChange={vi.fn()}
          snapToEndpoint
          onSnapToEndpointChange={vi.fn()}
          wallCount={2}
          onClearAll={vi.fn()}
          wallColor="#f97316"
          onWallColorChange={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Paredes (2)' }));
      expect(screen.getByRole('button', { name: 'Desenhar paredes' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Selecionar parede' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dividir parede' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tipo de parede: Porta aberta' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tipo de parede: Janela' })).toBeInTheDocument();
      expect(screen.getByText('Ajustar à grade')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cor da parede: Laranja (padrão)' })).toBeInTheDocument();
      expect(screen.getByText('Apagar tudo (2)')).toBeInTheDocument();
    });
  });
});

describe('light panel in Portuguese', () => {
  it('names the presets, the radii and the colour', async () => {
    await inPortuguese(async () => {
      render(
        <GmLightControls lightMode="light-place" onLightModeChange={vi.fn()} lightCount={0} onClearAll={vi.fn()} lightingEnabled globalIllumination />,
      );
      fireEvent.click(screen.getByText(/^Luzes/));
      expect(screen.getByText('Predefinições')).toBeInTheDocument();
      expect(screen.getByText('Forte')).toBeInTheDocument();
      expect(screen.getByText('Penumbra')).toBeInTheDocument();
      expect(screen.getByText('Cor')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tocha' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fogueira' })).toBeInTheDocument();
      expect(screen.getByTitle('Âmbar quente')).toBeInTheDocument();
    });
  });
});

describe('fog panel in Portuguese', () => {
  it('shows Névoa and the reveal and hide boxes', async () => {
    await inPortuguese(async () => {
      render(
        <GmFogControls fogMode={null} onFogModeChange={vi.fn()} onRevealAll={vi.fn()} onHideAll={vi.fn()} fogEnabled onFogEnabledChange={vi.fn()} />,
      );
      fireEvent.click(screen.getByText('Névoa'));
      expect(screen.getByRole('button', { name: 'Revelar área' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Esconder área' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Revelar mapa inteiro' })).toBeInTheDocument();
    });
  });
});
