/**
 * The compendium search the guided-creation tests answer from the invented
 * `CREATION_DATA` fixture, five entries a page so the wizard has to page.
 */
import type { CompendiumEntry, CompendiumSearch } from '@/types';
import { CREATION_DATA } from '@/utils/guidedCreation/__tests__/fixtures/creationData';
import type { CreationData } from '@/utils/guidedCreation/buildSheet';

export const MOCK_PAGE_SIZE = 5;

const KEY_BY_TYPE: Record<string, keyof CreationData> = {
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
};

export function entriesOf(type: string, data: CreationData = CREATION_DATA): CompendiumEntry[] {
  const list = (data[KEY_BY_TYPE[type]] ?? []) as Array<{ bookId: string; slug: string; name: string; text?: string; data: unknown }>;
  return list.map((e) => ({
    id: `${type}:${e.slug}`,
    bookId: e.bookId,
    type,
    slug: e.slug,
    name: e.name,
    nameEn: null,
    text: e.text ?? '',
    data: e.data,
    editedAt: null,
    editedById: null,
  }));
}

/** A `searchCompendium` answer: one page of the fixture entries of `type`. */
export function compendiumPage(params: CompendiumSearch, data: CreationData = CREATION_DATA) {
  const all = entriesOf(params.type ?? '', data);
  const page = params.page ?? 1;
  return Promise.resolve({ items: all.slice((page - 1) * MOCK_PAGE_SIZE, page * MOCK_PAGE_SIZE), total: all.length });
}

export const EMPTY_DATA: CreationData = {
  races: [],
  subraces: [],
  classes: [],
  subclasses: [],
  backgrounds: [],
  feats: [],
  spells: [],
  weapons: [],
  armor: [],
  gear: [],
  tools: [],
  packs: [],
};
