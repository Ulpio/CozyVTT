/**
 * What every parser does to the books' extracted text (pdftotext, no layout):
 * drop the page numbers that stand alone on a line, tell a title in capitals
 * from a line of text, and join the lines a page break cut into paragraphs.
 */

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'com', 'para', 'por', 'no', 'na', 'contra']);

/** The text's lines, without the page numbers that stand alone on a line. */
export function lines(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !/^\d+$/.test(line.trim()));
}

/** A title: capitals only, with at least three letters. */
export function isTitle(line: string): boolean {
  const trimmed = line.trim();
  return /^[\p{Lu}0-9 '’/,-]+$/u.test(trimmed) && (trimmed.match(/\p{Lu}/gu) ?? []).length >= 3;
}

/** "GOLEM DE BARRO" → "Golem de Barro". */
export function titleCase(upper: string): string {
  return upper
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** The index of the next line that is not blank, from `from`. */
export function nextFilled(all: string[], from: number): number {
  let i = from;
  while (i < all.length && all[i].trim() === '') i++;
  return i;
}

/**
 * Join a text's lines into paragraphs: a line goes on the last one when that
 * one did not end a sentence, as a page break leaves it. A heading inside the
 * text (a table's title, say) stands as a paragraph of its own.
 */
export function paragraphs(body: string[]): string[] {
  const out: string[] = [];
  let lastWasHeading = false;
  for (const raw of body) {
    const line = raw.trim();
    if (!line) continue;
    const heading = isTitle(line);
    const last = out[out.length - 1];
    if (last !== undefined && !heading && !lastWasHeading && (!/[.!?:)”"]$/.test(last) || /^\p{Ll}/u.test(line))) {
      out[out.length - 1] = `${last} ${line}`;
    } else {
      out.push(line);
    }
    lastWasHeading = heading;
  }
  return out;
}
