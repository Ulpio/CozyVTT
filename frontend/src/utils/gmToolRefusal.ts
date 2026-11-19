/**
 * The English texts the socket layer and the server give for a GM tool that
 * did not go through (no answer, no connection, a flood ceiling, a failure),
 * mapped to the app's own translations. A refusal the server already wrote in
 * Portuguese is not in this list and shows as it came.
 */
import type { TFunction } from 'i18next';

const KEYS: Record<string, string> = {
  'Not connected to server': 'gmToolRefusal.noConnection',
  'No answer from the server': 'gmToolRefusal.noAnswer',
  "The check didn't come back. Check your connection and try again.": 'gmToolRefusal.noAnswer',
  'Too many items given at once. Wait a moment, then try again.': 'gmToolRefusal.tooManyItems',
  'Too many notices at once. Wait a moment, then try again.': 'gmToolRefusal.tooManyNotices',
  'Too many secret checks at once. Wait a moment, then try again.': 'gmToolRefusal.tooManyChecks',
  'Failed to give the item': 'gmToolRefusal.giveFailed',
  'Failed to send the notice': 'gmToolRefusal.noticeFailed',
  'Failed to roll the secret check': 'gmToolRefusal.checkFailed',
};

export function gmToolRefusal(t: TFunction, text: string): string {
  const key = KEYS[text];
  return key ? t(key as never) : text;
}
