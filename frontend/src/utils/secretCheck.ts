// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * What the GM's secret check panel asks of a sheet: the checks the table's
 * characters can make (the union, grouped), the roll one character makes for
 * one of them, and 5E's passive Perception. The rolls are the ones
 * `getCharacterRolls` already builds, so a sheet's bonus is worked out in one
 * place.
 */

import type { CharacterData } from '@/types';
import { getCharacterRolls, type RollOption } from './characterRolls';
import { fifthEditionSkillBonus, passiveScore } from './rules/fifthEdition';

export type CheckGroup = 'skills' | 'abilities' | 'savingThrows';
export type CheckKey = { group: CheckGroup; label: string };

const GROUPS: CheckGroup[] = ['skills', 'abilities', 'savingThrows'];

/**
 * A roll's name without its bonus or target: its purpose less the check's
 * "Check" / "Saving Throw" / "Save" ending (and a Horror d100 target).
 */
function nameOf(option: RollOption): string {
  return option.purpose
    .replace(/ — target: .*$/, '')
    .replace(/ (Check|Saving Throw|Save)$/, '');
}

/** The checks any of these sheets can make, grouped (skills, abilities, saves), each once, in the order the sheets list them. */
export function checkChoices(sheets: Array<{ gameSystem: string | null; data: unknown }>): CheckKey[] {
  const seen = new Set<string>();
  const found: Record<CheckGroup, CheckKey[]> = { skills: [], abilities: [], savingThrows: [] };
  for (const { gameSystem, data } of sheets) {
    const rolls = getCharacterRolls(gameSystem, data as CharacterData | null | undefined);
    for (const group of GROUPS) {
      for (const option of rolls[group]) {
        const label = nameOf(option);
        const id = `${group}|${label}`;
        if (seen.has(id)) continue;
        seen.add(id);
        found[group].push({ group, label });
      }
    }
  }
  return GROUPS.flatMap((group) => found[group]);
}

/** The roll this sheet makes for the check, or null when it has no such check. */
export function checkFor(gameSystem: string | null, data: unknown, key: CheckKey): RollOption | null {
  const rolls = getCharacterRolls(gameSystem, data as CharacterData | null | undefined);
  return rolls[key.group].find((option) => nameOf(option) === key.label) ?? null;
}

/**
 * 5E's passive Perception: the sheet's own figure when it has one, else 10 plus
 * the Perception bonus plus the sheet's other passive bonus. Other systems have none.
 */
export function passivePerception(gameSystem: string | null, data: unknown): number | null {
  if (gameSystem !== 'FIFTH_EDITION' || !data || typeof data !== 'object') return null;
  const sheet = data as { passivePerception?: unknown; passivePerceptionBonus?: unknown; skills?: { perception?: unknown } };
  if (typeof sheet.passivePerception === 'number' && Number.isFinite(sheet.passivePerception)) return sheet.passivePerception;
  if (!sheet.skills?.perception) return null;
  const extra = typeof sheet.passivePerceptionBonus === 'number' && Number.isFinite(sheet.passivePerceptionBonus) ? sheet.passivePerceptionBonus : 0;
  return passiveScore(fifthEditionSkillBonus(data, 'perception') + extra);
}
