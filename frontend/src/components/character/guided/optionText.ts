// ============================================
// The book's text for each option of a choice (a fighting style, an
// invocation, a metamagic...), cut at render time from the compendium feature
// that lists them: each option's paragraph starts on a line with its name
// ("DEFESA - ...", "Magia acelerada. ...", or the name alone on its line).
// ============================================

import { normalizeName } from '@/utils/guidedCreation/equipmentRules';

/** A line that is a heading on its own: all capitals ("CORRENTES DE CÁRCERI"). */
const isHeading = (line: string) => /\p{Lu}{3}/u.test(line) && !/\p{Ll}/u.test(line);

function excerpts(text: string, names: string[]): Map<string, string> {
  const lines = text.split('\n').map((l) => l.trim());
  const keys = names.map((name) => ({ name, key: normalizeName(name) })).sort((a, b) => b.key.length - a.key.length);
  const starts: Array<{ line: number; name: string; rest: string }> = [];
  lines.forEach((line, i) => {
    const norm = normalizeName(line);
    const hit = keys.find(({ key }) => norm.startsWith(key) && !/[a-z0-9]/.test(norm.charAt(key.length)));
    if (hit) starts.push({ line: i, name: hit.name, rest: line.slice(hit.key.length) });
  });
  const out = new Map<string, string>();
  starts.forEach((start, k) => {
    const end = starts[k + 1]?.line ?? lines.length;
    const body = [start.rest];
    for (let i = start.line + 1; i < end && !isHeading(lines[i]); i++) body.push(lines[i]);
    const paragraph = body.join('\n').replace(/^[\s.:\-–—]+/, '').trim();
    if (paragraph && !out.has(start.name)) out.set(start.name, paragraph);
  });
  return out;
}

/**
 * Option name → its paragraph, from whichever of `sources` (feature texts)
 * describes the most of `names`. Options the texts do not describe are left out.
 */
export function optionTexts(sources: string[], names: string[]): Map<string, string> {
  let best = new Map<string, string>();
  for (const source of sources) {
    const found = excerpts(source, names);
    if (found.size > best.size) best = found;
  }
  return best;
}
