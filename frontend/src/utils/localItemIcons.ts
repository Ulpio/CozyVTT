/**
 * Item icons a table keeps for itself, outside the repository.
 *
 * When `public/icons/local/map.json` exists (the folder is git-ignored), it
 * names a picture for a compendium slug ("espada-longa": "longsword.png") or
 * for a whole category ("category:ammo": "arrows.png"). The sheet and the bar
 * show that picture instead of the built-in game-icons.net one. Without the
 * folder nothing changes.
 */

import { itemCategory } from './itemIcons';
import type { CompendiumRef } from '../types/game-systems/fifthEdition';

const FOLDER = '/icons/local/';

type IconItem = { name: string; compendiumRef?: CompendiumRef };
type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

let files: Record<string, string> = {};
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** A plain file name inside the folder: no path, no scheme. */
const isPlainFile = (name: unknown): name is string =>
  typeof name === 'string' && /^[\w][\w .()-]*\.(png|webp|jpg|jpeg|svg)$/i.test(name);

/** Reads the map once; any failure leaves the built-in icons in place. */
export function loadLocalItemIcons(fetchFn: FetchLike = (url) => fetch(url)): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetchFn(`${FOLDER}map.json`);
      if (!res.ok) return;
      const body = await res.json();
      if (!body || typeof body !== 'object') return;
      files = Object.fromEntries(Object.entries(body as Record<string, unknown>).filter(([, f]) => isPlainFile(f))) as Record<string, string>;
      listeners.forEach((l) => l());
    } catch {
      // No local folder, or the dev server is down: keep the built-in icons.
    }
  })();
  return loading;
}

/** "Cota de Malha (20)" → "cota de malha": lower case, no accents, no bundle size. */
const plainName = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase();

/** The local picture for this item: by its slug, then by its name ("name:longsword"), then by its category. */
export function localItemIconUrl(item: IconItem, entryType?: string, entryData?: unknown): string | undefined {
  const slug = item.compendiumRef?.slug;
  const file = (slug && files[slug])
    || files[`name:${plainName(item.name)}`]
    || files[`category:${itemCategory(item, entryType, entryData)}`];
  return file ? `${FOLDER}${file}` : undefined;
}

/** For React: re-render when the map arrives. */
export function subscribeLocalItemIcons(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const localItemIconsVersion = (): Record<string, string> => files;

/** Tests only. */
export function resetLocalItemIcons(): void {
  files = {};
  loading = null;
}
