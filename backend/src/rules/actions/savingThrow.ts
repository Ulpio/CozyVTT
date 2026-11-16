import type { FifthEditionCharacterData } from '../../validators/game-systems/fifthEdition.schema';
import type { Ability } from './monsterActions';
import type { Rng, RollMode } from './types';

export interface SaveRoll {
  d20s: number[];
  natural: number;
  total: number;
}

const defaultRng: Rng = (sides) => Math.floor(Math.random() * sides) + 1;

/** d20 + bonus; advantage and disadvantage roll two d20 and keep the higher or lower. No natural 20 or 1 is special. */
export function rollSave(bonus: number, mode: RollMode, rng: Rng = defaultRng): SaveRoll {
  const d20s = [rng(20)];
  if (mode !== 'normal') d20s.push(rng(20));
  const natural = mode === 'disadvantage' ? Math.min(...d20s) : Math.max(...d20s);
  return { d20s, natural, total: natural + bonus };
}

export function saveSucceeds(total: number, dc: number): boolean {
  return total >= dc;
}

const LONG_NAME: Record<Ability, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

/** A character's saving throw bonus: the sheet's total, else the ability modifier, else 0. */
export function characterSaveBonus(sheet: FifthEditionCharacterData, ability: Ability): number {
  const name = LONG_NAME[ability];
  const save = (sheet?.savingThrows as Record<string, { bonus?: unknown } | undefined> | undefined)?.[name]?.bonus;
  if (typeof save === 'number') return save;
  const mod = (sheet?.stats as Record<string, { modifier?: unknown } | undefined> | undefined)?.[name]?.modifier;
  return typeof mod === 'number' ? mod : 0;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A monster's saving throw bonus: its listed save, else its modifier, else the one its score gives, else 0. */
export function monsterSaveBonus(statBlock: Record<string, unknown> | null | undefined, ability: Ability): number {
  const saves = statBlock?.savingThrows as Record<string, unknown> | undefined;
  if (isNum(saves?.[ability])) return saves[ability] as number;
  const mods = statBlock?.attributeModifiers as Record<string, unknown> | undefined;
  if (isNum(mods?.[ability])) return mods[ability] as number;
  const score = (statBlock?.abilities as Record<string, unknown> | undefined)?.[ability];
  if (isNum(score)) return Math.floor((score - 10) / 2);
  return 0;
}

const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Whether the stat block has the trait "Resistência à Magia" (accents and case ignored). */
export function hasMagicResistance(statBlock: Record<string, unknown> | null | undefined): boolean {
  const traits = statBlock?.traits;
  if (!Array.isArray(traits)) return false;
  return traits.some((t) => {
    const name = (t as { name?: unknown } | null)?.name;
    return typeof name === 'string' && (plain(name) === 'resistencia a magia' || plain(name) === 'magic resistance');
  });
}

/** Damage a target takes once its save is known: all on a failure, half rounded down (or none) on a success. */
export function damageAfterSave(total: number, saved: boolean, halfOnSave: boolean): number {
  if (!saved) return total;
  return halfOnSave ? Math.floor(total / 2) : 0;
}
