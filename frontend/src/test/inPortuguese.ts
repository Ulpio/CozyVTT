import i18n from '@/i18n';

/**
 * Runs `fn` with the app in Portuguese and puts the test language (English)
 * back afterwards, even when `fn` throws or rejects.
 */
export async function inPortuguese<T>(fn: () => T | Promise<T>): Promise<T> {
  await i18n.changeLanguage('pt-BR');
  try {
    return await fn();
  } finally {
    await i18n.changeLanguage('en');
  }
}
