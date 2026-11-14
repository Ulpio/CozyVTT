import 'i18next';
import type en from './locales/en';

// Types every t('…') key against the English text, so a typo or a key that
// does not exist fails the typecheck.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
    returnNull: false;
  }
}
