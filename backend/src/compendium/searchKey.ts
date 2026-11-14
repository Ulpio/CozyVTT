/**
 * What a compendium search compares against, and an entry's slug. Both
 * ignore accents and case, so "misseis magicos" finds "Mísseis Mágicos".
 */

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** The names, without accents, in lower case, separated by one space. */
export function searchKey(...names: (string | undefined)[]): string {
  return names
    .filter((name): name is string => typeof name === 'string')
    .map((name) => plain(name).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

/** A stable slug: the plain name, with a hyphen between words and no punctuation. */
export function slugify(name: string): string {
  return plain(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
