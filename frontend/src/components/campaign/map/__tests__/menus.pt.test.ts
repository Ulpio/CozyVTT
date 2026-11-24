/**
 * The map's menus in Portuguese: the token menu and the door menu drawn as
 * the map draws them, the preview picker's entries, and a token's conditions.
 */

import { createElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import { CampaignRole, TokenLayer, TokenType, type Token } from '@/types';
import type { WallSegment, WallType } from '@/types/walls';
import MapMenuRows from '../../MapMenuRows';
import TokenDetailsCard from '../../TokenDetailsCard';
import { tokenMenuItems, type TokenMenuActions } from '../tokenMenuItems';
import { doorMenuItems } from '../doorMenuItems';
import { previewOptions } from '../previewSelection';
import { gridColorLabel, mapControlsTitle, mapControlItems, type MapControlsActions } from '../mapControlItems';
import { conditionLabel } from '@/utils/conditions';

function token(extra: Partial<Token> = {}): Token {
  return {
    id: 'tok-1', name: 'Goblin', imageUrl: '', characterId: null, position: { x: 2, y: 3 }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null,
    metadata: {}, disposition: null, hp: null, showHpBar: false, initiative: null, ...extra,
  } as unknown as Token;
}

const noop = () => undefined;
const actions = new Proxy({}, { get: () => noop }) as unknown as TokenMenuActions;
const door = (type: WallType): WallSegment => ({ id: 'd1', x1: 0, y1: 0, x2: 50, y2: 0, type });

describe('the token menu in Portuguese', () => {
  it("shows a GM's items in Portuguese, the light submenu included", async () => {
    await inPortuguese(() => {
      const items = tokenMenuItems(token(), {
        role: CampaignRole.GM, mayViewSheet: false, mayRoll: false, mayGrantTemporaryHp: false, mayRotate: true, mayLight: true,
        mapId: 'map-a', maps: [{ id: 'map-a', name: 'A' }, { id: 'map-b', name: 'B' }], busy: { crossing: false, moving: false }, actions,
      });
      render(createElement(MapMenuRows, { items, onClose: noop }));
      expect(screen.getByText('Luz')).toBeInTheDocument();
      for (const name of ['Editar token', 'Duplicar token', 'Remover do mapa', 'Girar à esquerda', 'Enviar ao plano espiritual']) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
      expect(screen.getByText('Mover para o mapa…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Girar à esquerda' })).toHaveAttribute('title', 'Girar 45 graus no sentido anti-horário');
      expect(screen.queryByText('Edit Token')).toBeNull();
      expect(screen.queryByText('Remove from Map')).toBeNull();
    });
  });
});

describe('the door menu in Portuguese', () => {
  it('names the door and what can be done to it', async () => {
    await inPortuguese(() => {
      const items = doorMenuItems(door('door-closed'), { role: CampaignRole.GM, actions: { setType: vi.fn() } });
      render(createElement(MapMenuRows, { items, onClose: noop }));
      expect(screen.getByText('🚪 Porta fechada')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Abrir porta' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Trancar porta' })).toBeInTheDocument();
      expect(screen.queryByText('Open Door')).toBeNull();
    });
  });

  it('tells a player at a locked door that it is locked', async () => {
    await inPortuguese(() => {
      const items = doorMenuItems(door('door-locked'), { role: CampaignRole.PLAYER, actions: { setType: vi.fn() } });
      render(createElement(MapMenuRows, { items, onClose: noop }));
      expect(screen.getByText('🔒 Porta trancada')).toBeInTheDocument();
      expect(screen.getByText('Esta porta está trancada.')).toBeInTheDocument();
    });
  });
});

describe('the rest of the map in Portuguese', () => {
  it('names the preview picker entries', async () => {
    await inPortuguese(() => {
      const labels = previewOptions([], [
        token({ id: 'a', name: 'Hero', type: TokenType.PLAYER }),
        token({ id: 'b', name: 'Ghost', layer: TokenLayer.SPIRIT }),
      ]).map((o) => o.label);
      expect(labels).toEqual(['Todos os tokens de jogadores', 'Hero', 'Ghost (espiritual)']);
    });
  });

  it('names the map controls', async () => {
    await inPortuguese(() => {
      expect(gridColorLabel('white')).toBe('Cor da grade: Branca');
      const noActions = new Proxy({}, { get: () => noop }) as unknown as MapControlsActions;
      const rows = mapControlItems({
        isGM: true, hasMap: true, showGrid: false, gridColor: 'black', showRuler: false, rulerColor: 'amber', showAoE: false,
        spiritTokensShown: false, toolsShown: false, paint: 'offered',
      }, noActions);
      expect(mapControlsTitle(rows)).toBe('Controles do mapa: ajuste, grade, régua, área de efeito, Cartógrafo, ferramentas e tokens espirituais');
    });
  });

  it('shows the conditions on a token in Portuguese, and homebrew as typed', async () => {
    await inPortuguese(() => {
      expect(conditionLabel('Blinded')).toBe('Cego');
      expect(conditionLabel("Hunter\u2019s Mark")).toBe('Marca do Caçador');
      expect(conditionLabel('Major Wound')).toBe('Ferimento grave');
      expect(conditionLabel('Frenzied')).toBe('Frenzied');
      const hurt = token({ conditions: ['Blinded', 'Hasted'] });
      render(createElement(TokenDetailsCard, { token: hurt, square: hurt.position, hp: null, mayMove: false }));
      expect(screen.getByText('Condições')).toBeInTheDocument();
      expect(screen.getByText('Cego')).toBeInTheDocument();
      expect(screen.getByText('Acelerado')).toBeInTheDocument();
      expect(screen.getByText('Você não pode mover este token')).toBeInTheDocument();
    });
  });
});
