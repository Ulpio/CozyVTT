/**
 * Translations.
 *
 * The app speaks Brazilian Portuguese unless the browser has kept another
 * choice; English is the fallback for any text not translated yet, so a
 * screen can move to translated text one string at a time. Text lives in
 * locales/<language>.ts, grouped by screen. English is the reference: its
 * shape types every key, and pt-BR must have the same keys (a missing one
 * fails the typecheck).
 *
 * The tests run in English (test/setup.ts), so they keep reading the text
 * they were written against.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ptBR from './locales/pt-BR';

export const LANGUAGES = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en', label: 'English' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: LanguageCode = 'pt-BR';

const STORAGE_KEY = 'cozyvtt.language';

function isLanguage(value: unknown): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

/** The language this browser chose before, or the default. Storage may be unavailable. */
function storedLanguage(): LanguageCode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(value)) return value;
  } catch {
    // Private mode or blocked storage: use the default.
  }
  return DEFAULT_LANGUAGE;
}

/** Switch language, remember it in this browser, and mark the page's language. */
export async function setLanguage(code: LanguageCode): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Not remembered; still switches for this visit.
  }
  await i18n.changeLanguage(code);
}

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'pt-BR': { translation: ptBR },
  },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: {
    // React already escapes what it renders.
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
