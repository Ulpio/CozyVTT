// ============================================
// Text from the books' PDFs carries private-use characters: a symbol font's
// bullets (U+F020, U+F0B7...) and other glyphs that draw as boxes. The guided
// creation cleans each entry as it loads, so neither the wizard nor the sheet
// it saves (which copies feature and trait text) holds them.
// ============================================

/** Symbol and Wingdings bullets, with the spacing after them. */
const BULLETS = /[][ \t]*/g;
/** The Basic Multilingual Plane's private-use area. */
const PRIVATE_USE = /[-]/g;

export function cleanCompendiumText(text: string): string {
  return text.replace(BULLETS, '• ').replace(PRIVATE_USE, '');
}

function cleanValue(value: unknown): unknown {
  if (typeof value === 'string') return cleanCompendiumText(value);
  if (Array.isArray(value)) return value.map(cleanValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cleanValue(entry)]));
  }
  return value;
}

/** The entry with its name, text and every string in its data cleaned; its book and slug as they are. */
export function cleanCompendiumEntry<T extends { name: string; text: string; data: unknown }>(entry: T): T {
  return { ...entry, name: cleanCompendiumText(entry.name), text: cleanCompendiumText(entry.text), data: cleanValue(entry.data) };
}
