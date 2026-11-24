/**
 * Words a 5E sheet stores as typed English text (a damage type, a condition,
 * a weapon property, an ability) shown in the app's language. A word the
 * tables below do not know is shown as it was stored, so homebrew stays as
 * the player wrote it.
 */
import type { i18n as I18n } from 'i18next';

type Group = 'damageTypes' | 'conditionNames' | 'weaponProperties' | 'abilities' | 'saveNames';

/** `raw` in the app's language when the group names it, else `raw` itself. */
export function sheetWord(i18n: I18n, group: Group, raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!/^[a-z-]+$/.test(key)) return raw;
  const path = `sheet5e.${group}.${key}`;
  return i18n.exists(path) ? i18n.t(path as never) : raw;
}
