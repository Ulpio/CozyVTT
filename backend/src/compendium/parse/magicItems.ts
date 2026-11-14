/**
 * Magic items from the Dungeon Master's Guide's extracted text (pdftotext,
 * no layout). Each item is its name in capitals, a line
 * "Categoria (detalhe), raridade (requer sintonização com …)", and its text.
 * The items' mechanics (bonuses, healing) are added by curation, not here.
 */

import { slugify } from '../searchKey';
import type { RawEntry } from '../types';
import { isTitle, lines, nextFilled, paragraphs, titleCase } from './text';

const CATEGORY_LINE =
  /^((?:Arma|Armadura|Poção|Varinha|Anel|Item maravilhoso|Bastão|Cajado|Pergaminho|Munição|Escudo)(?: \([^)]*\))?), (.+?)(?: \(requer sintonização(?: com (.+))?\))?$/;

export function parseMagicItems(text: string): { entries: RawEntry[]; unrecognized: string[] } {
  const all = lines(text);
  const entries: RawEntry[] = [];

  const starts: number[] = [];
  for (let i = 0; i < all.length; i++) {
    if (!isTitle(all[i])) continue;
    const next = nextFilled(all, i + 1);
    if (next < all.length && CATEGORY_LINE.test(all[next].trim())) starts.push(i);
  }

  for (let s = 0; s < starts.length; s++) {
    const titleAt = starts[s];
    const categoryAt = nextFilled(all, titleAt + 1);
    const [, category, rarity, attunementBy] = CATEGORY_LINE.exec(all[categoryAt].trim())!;

    // The text runs to the next item, or to the next title after the last one.
    let end = starts[s + 1] ?? all.length;
    if (s === starts.length - 1) {
      const after = all.findIndex((line, i) => i > categoryAt && isTitle(line));
      if (after !== -1) end = after;
    }

    const title = all[titleAt].trim();
    entries.push({
      type: 'magicItem',
      slug: slugify(title),
      name: titleCase(title),
      text: paragraphs(all.slice(categoryAt + 1, end)).join('\n\n'),
      data: {
        category,
        rarity: rarity.trim(),
        attunement: / \(requer sintonização/.test(all[categoryAt]),
        ...(attunementBy ? { attunementBy: attunementBy.trim() } : {}),
      },
    });
  }
  return { entries, unrecognized: [] };
}
