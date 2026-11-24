/**
 * A character save refused because the browser is no longer signed in.
 *
 * While an editor holds unsaved changes the page stays put on a 401 (see
 * services/unsavedWork), so the editor says what happened. Signing in again
 * in another tab shares the session with this one, and Save then works.
 */

import i18n from '@/i18n';
import { apiErrorStatus } from './errors';

export function isSignedOutSave(err: unknown): boolean {
  return apiErrorStatus(err) === 401;
}

export function signedOutNotSaved(): string {
  return i18n.t('common.signedOutNotSaved');
}
