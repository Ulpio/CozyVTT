// ============================================
// The compendium entries the guided creation picks from: every type it
// needs, whole (text and data), from the campaign's books (every book of the
// system outside a campaign), page by page until each type's total.
// ============================================

import { useEffect, useState } from 'react';
import api from '@/services/api';
import type { CompendiumEntry } from '@/types';
import type { CreationData } from '@/utils/guidedCreation/buildSheet';
import { errorSummary } from '@/utils/errors';
import { cleanCompendiumEntry } from '@/utils/guidedCreation/compendiumText';

const PAGE_SIZE = 200;

/** Compendium type → the `CreationData` list it fills. */
const LISTS = {
  race: 'races',
  subrace: 'subraces',
  class: 'classes',
  subclass: 'subclasses',
  background: 'backgrounds',
  feat: 'feats',
  spell: 'spells',
  weapon: 'weapons',
  armor: 'armor',
  gear: 'gear',
  pack: 'packs',
  tool: 'tools',
} as const satisfies Record<string, keyof CreationData>;

async function loadType(type: string, campaignId: string | undefined): Promise<CompendiumEntry[]> {
  const items: CompendiumEntry[] = [];
  for (let page = 1; ; page++) {
    const result = await api.searchCompendium({ type, campaignId, full: true, pageSize: PAGE_SIZE, page });
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) return items;
  }
}

/**
 * The entries as the rules read them; `data` is trusted to match its type (the
 * server checks it). The PDFs' private-use glyphs are cleaned out here, so the
 * wizard never shows them and the sheet it saves never holds them.
 */
const asCreationEntry = (e: CompendiumEntry) =>
  cleanCompendiumEntry({ bookId: e.bookId, slug: e.slug, name: e.name, text: e.text, data: e.data });

async function loadAll(campaignId: string | undefined): Promise<CreationData> {
  const types = Object.keys(LISTS) as Array<keyof typeof LISTS>;
  const lists = await Promise.all(types.map((type) => loadType(type, campaignId)));
  const data: Record<string, unknown> = {};
  types.forEach((type, i) => {
    data[LISTS[type]] = lists[i].map(asCreationEntry);
  });
  return data as unknown as CreationData;
}

export interface CreationDataState {
  data: CreationData | null;
  loading: boolean;
  error: string | null;
}

export function useCreationData(campaignId?: string): CreationDataState {
  const [state, setState] = useState<CreationDataState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let live = true;
    setState({ data: null, loading: true, error: null });
    loadAll(campaignId).then(
      (data) => live && setState({ data, loading: false, error: null }),
      (err) => {
        console.error('Failed to load the compendium for guided creation:', errorSummary(err));
        if (live) setState({ data: null, loading: false, error: errorSummary(err) });
      },
    );
    return () => {
      live = false;
    };
  }, [campaignId]);

  return state;
}
