/**
 * Spells from the Player's Handbook's extracted text (pdftotext, no layout).
 *
 * The text lays a spell out as: its title in capitals on a line of its own;
 * a line starting "N° nível de <escola>" or "Truque de <escola>", with
 * "(ritual)" after the school when it is one; the header fields (Tempo de
 * Conjuração, Alcance, Componentes, Duração), which can run on over several
 * lines; and its paragraphs, one per line, the last sometimes starting
 * "Em Níveis Superiores.". A page break leaves the page number alone on a
 * line and a blank line, in the middle of a header or a paragraph.
 *
 * The class lists come first: "MAGIAS DE <CLASSE>", then "TRUQUES (NÍVEL 0)"
 * and "N° NÍVEL" headings, each followed by "Nome (escola[, ritual])" runs.
 */

import { slugify } from '../searchKey';
import type { RawEntry } from '../types';
import { isTitle, lines, nextFilled, paragraphs, titleCase } from './text';

export const CLASS_SLUGS = [
  'barbaro',
  'bardo',
  'bruxo',
  'clerigo',
  'druida',
  'feiticeiro',
  'guerreiro',
  'ladino',
  'mago',
  'monge',
  'paladino',
  'patrulheiro',
] as const;

const LEVEL_LINE = /^(?:(\d)° nível de ([\p{L}]+)|Truque de ([\p{L}]+))(\s*\(ritual\))?\s*(.*)$/u;
const LIST_HEADING = /^(TRUQUES \(NÍVEL 0\)|\d° NÍVEL)$/;
const CLASS_HEADING = /^MAGIAS DE ([\p{Lu} ]+)$/u;
const END_OF_SPELLS = /^APÊNDICE\b/;
const HIGHER_LEVELS = 'Em Níveis Superiores.';

/** Each spell's classes, by spell slug, in the order the lists name them; and the names as the lists write them. */
function readClassLists(text: string): { classes: Map<string, string[]>; names: Map<string, string> } {
  const classes = new Map<string, string[]>();
  const names = new Map<string, string>();
  let current: string | null = null;

  for (const line of lines(text)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const heading = CLASS_HEADING.exec(trimmed);
    if (heading) {
      current = slugify(heading[1]);
      continue;
    }
    if (!current) continue;
    if (LIST_HEADING.test(trimmed)) continue;
    if (isTitle(trimmed)) {
      current = null;
      continue;
    }
    for (const match of trimmed.matchAll(/([^()]+?)\s*\(([^)]+)\)/g)) {
      const name = match[1].trim();
      const slug = slugify(name);
      if (!slug) continue;
      if (!names.has(slug)) names.set(slug, name);
      const list = classes.get(slug) ?? [];
      if (!list.includes(current)) list.push(current);
      classes.set(slug, list);
    }
  }
  return { classes, names };
}

/** The class lists: for each spell's slug, the slugs of the classes that have it. */
export function parseClassSpellLists(text: string): Map<string, string[]> {
  return readClassLists(text).classes;
}

/** Parse "V, S, M (material)". */
function components(field: string): { v: boolean; s: boolean; m: boolean; material?: string } {
  const material = /M\s*\((.*)\)\s*$/.exec(field);
  const letters = field.replace(/\(.*\)/, '');
  return {
    v: /\bV\b/.test(letters),
    s: /\bS\b/.test(letters),
    m: /\bM\b/.test(letters),
    ...(material ? { material: material[1].trim() } : {}),
  };
}

export function parseSpells(text: string): { entries: RawEntry[]; unrecognized: string[] } {
  const { classes, names } = readClassLists(text);
  const all = lines(text);
  const entries: RawEntry[] = [];
  const unrecognized: string[] = [];

  // Where each spell starts: a title whose next filled line is a level line.
  const starts: number[] = [];
  for (let i = 0; i < all.length; i++) {
    if (!isTitle(all[i])) continue;
    const next = nextFilled(all, i + 1);
    if (next < all.length && LEVEL_LINE.test(all[next].trim())) starts.push(i);
  }
  if (starts.length === 0) return { entries, unrecognized };

  // The spells end at the appendix, or the text's end.
  let end = all.findIndex((line, i) => i > starts[0] && END_OF_SPELLS.test(line.trim()));
  if (end === -1) end = all.length;

  for (let s = 0; s < starts.length; s++) {
    const titleAt = starts[s];
    if (titleAt >= end) break;
    const stopAt = Math.min(starts[s + 1] ?? end, end);

    const title = all[titleAt].trim();
    const levelAt = nextFilled(all, titleAt + 1);
    const level = LEVEL_LINE.exec(all[levelAt].trim())!;

    // The header runs until the line holding "Duração:".
    let header = level[5] ?? '';
    let i = levelAt + 1;
    while (!/Duração:/.test(header) && i < stopAt) {
      header += ` ${all[i].trim()}`;
      i++;
    }
    const fields = /Tempo de Conjuração:\s*(.*?)\s*Alcance:\s*(.*?)\s*Componentes:\s*(.*?)\s*Duração:\s*(.*)$/.exec(
      header.replace(/\s+/g, ' ').trim()
    );

    // A heading inside the spell (a table's title, say) stays in its text,
    // and is reported so a curator looks at it.
    const body: string[] = [];
    for (; i < stopAt; i++) {
      if (isTitle(all[i])) unrecognized.push(all[i].trim());
      body.push(all[i]);
    }

    if (!fields) {
      unrecognized.push(title);
      continue;
    }

    const paras = paragraphs(body);
    const higherAt = paras.findIndex((p) => p.startsWith(HIGHER_LEVELS));
    const higherLevels = higherAt === -1 ? undefined : paras[higherAt].slice(HIGHER_LEVELS.length).trim();
    const textParas = higherAt === -1 ? paras : paras.filter((_, k) => k !== higherAt);

    const slug = slugify(title);
    const duration = fields[4].trim();
    entries.push({
      type: 'spell',
      slug,
      name: names.get(slug) ?? titleCase(title),
      text: textParas.join('\n\n'),
      data: {
        level: level[1] ? Number(level[1]) : 0,
        school: (level[2] ?? level[3]).toLowerCase(),
        castingTime: fields[1].trim(),
        range: fields[2].trim(),
        components: components(fields[3].trim()),
        duration,
        concentration: duration.startsWith('Concentração'),
        ritual: Boolean(level[4]),
        classes: classes.get(slug) ?? [],
        ...(higherLevels ? { higherLevels } : {}),
      },
    });
  }
  return { entries, unrecognized };
}
