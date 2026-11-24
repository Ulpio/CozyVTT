/**
 * The compact layout's More, its bar and the toolbar, in Portuguese.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { inPortuguese } from '@/test/inPortuguese';
import SessionToolbar from '@/components/campaign/SessionToolbar';

vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ userRole: 'GM' }) }));

import MoreSheet from '../MoreSheet';
import BottomBar from '../BottomBar';

const onSheetEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

afterEach(async () => {
  cleanup();
  await waitFor(() => expect(onSheetEntry()).toBe(false));
});

const ENGLISH = [
  'More', 'At the table', 'GM tools', 'Notes', 'Session', 'Documents', 'Shortcuts',
  'Map Library', 'Token Manager', 'Creature Library', 'Token Templates', 'Spirit Layer',
  'Atmosphere', 'Secret check', 'Campaign Settings',
];

describe('More in Portuguese', () => {
  it('names every panel and tool in Portuguese for a GM', async () => {
    await inPortuguese(() => {
      render(
        <MoreSheet open isOwner={false} onClose={vi.fn()} onOpenTool={vi.fn()} onOpenDocuments={vi.fn()} onOpenShortcuts={vi.fn()} onOpenPanel={vi.fn()} />
      );
      const sheet = screen.getByRole('dialog', { name: 'Mais' });
      const rows = within(sheet).getAllByRole('button').map((b) => b.textContent ?? '');
      const headings = within(sheet).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
      expect(headings).toEqual(['Na mesa', 'Ferramentas do mestre']);
      expect(rows).toEqual(expect.arrayContaining([
        'Notas', 'Sessão', 'Documentos', 'Atalhos', 'Mapas', 'Tokens no mapa', 'Criaturas',
        'Modelos de token', 'Camada oculta', 'Clima e efeitos', 'Teste secreto', 'Configurações da campanha',
      ]));
      for (const text of [...rows, ...headings]) expect(ENGLISH).not.toContain(text);
    });
  });

  it('names the bar and its buttons in Portuguese', async () => {
    await inPortuguese(() => {
      render(<BottomBar active="map" onSelect={vi.fn()} />);
      const nav = screen.getByRole('navigation', { name: 'Mesa' });
      expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Mapa', 'Chat', 'Dados', 'Iniciativa', 'Grupo', 'Mais']);
    });
  });

  it('names the toolbar and its tools in Portuguese', async () => {
    await inPortuguese(() => {
      render(<SessionToolbar openPanels={{}} onOpen={() => undefined} />);
      const toolbar = screen.getByRole('toolbar', { name: 'Ferramentas do mestre' });
      const names = within(toolbar).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
      expect(names).toHaveLength(8);
      for (const name of names) expect(ENGLISH).not.toContain(name);
    });
  });
});
