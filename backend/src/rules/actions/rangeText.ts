import type { ParsedRange } from './types';

/** Metres to feet at 1.5 m per 5 ft, rounded to the nearest 5. */
export function metresToFeet(m: number): number {
  return Math.round(((m / 1.5) * 5) / 5) * 5;
}

/**
 * Reads a Portuguese range line ("Pessoal", "Toque", "36 metros", "24/96 m",
 * "alcance 3 m") into feet. Text it does not understand gives null.
 */
export function parseRangeText(text: string): ParsedRange | null {
  const t = text.trim().toLowerCase();
  if (t === 'pessoal') return { kind: 'self' };
  if (t === 'toque') return { kind: 'touch' };
  const m = t.match(/^(?:alcance|dist[âa]ncia)?\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?\s*(?:m|metros?)$/);
  if (!m) return null;
  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const normal = metresToFeet(num(m[1]));
  return m[2] ? { kind: 'feet', normal, long: metresToFeet(num(m[2])) } : { kind: 'feet', normal };
}
