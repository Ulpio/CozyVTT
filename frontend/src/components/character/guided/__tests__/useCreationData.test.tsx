/**
 * The compendium entries reach the wizard with the PDFs' private-use glyphs
 * cleaned out (utils/guidedCreation/compendiumText), text and data alike.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { CompendiumSearch } from '@/types';
import { useCreationData } from '../useCreationData';

const searchCompendium = vi.fn((p: CompendiumSearch) => {
  const items =
    p.type === 'race'
      ? [{ id: 'r', bookId: 'b', type: 'race', slug: 'anao', name: 'Anão', nameEn: null, text: ' Visão', data: { traits: [{ description: ' Robusto' }] }, editedAt: null, editedById: null }]
      : [];
  return Promise.resolve({ items, total: items.length });
});
vi.mock('@/services/api', () => {
  const client = { searchCompendium: (p: CompendiumSearch) => searchCompendium(p) };
  return { api: client, default: client };
});

describe('useCreationData', () => {
  it('cleans the private-use glyphs out of each entry', async () => {
    const { result } = renderHook(() => useCreationData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.races[0]).toMatchObject({ text: '• Visão', data: { traits: [{ description: '• Robusto' }] } });
  });
});
