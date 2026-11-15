import type { ClassData, SpellData, SpellsBySpellLevel, SubclassData } from './compendiumData';
import type { RulesEntry } from './collectEffects';
import type { AbilityKey } from './types';

/** A spell compendium entry as the rules read it. */
export type SpellEntry = RulesEntry<SpellData>;

/** What a 3rd-level character casts. Counts exclude always-prepared and fixed spells. */
export interface SpellcastingAt3 {
  ability: AbilityKey;
  /** The class spell list the picks come from. */
  list: string;
  /** Cantrips known, `fixedCantrips` included. */
  cantrips: number;
  /** Spells known (bard, sorcerer, warlock, ranger, Eldritch Knight, Arcane Trickster). */
  known?: number;
  /** Spells prepared each day (cleric, druid, paladin, wizard). */
  prepared?: number;
  /** Spells in the wizard's spellbook. */
  spellbook?: number;
  /** The highest spell level with a slot. */
  maxLevel: number;
  /** Slots by spell level 1..9 (the warlock's pact slots included). */
  slots: number[];
  pact?: { slots: 2; level: 2 };
  /** Leveled known spells must be of these schools, except `freeSchoolPicks` of them. */
  schools?: string[];
  freeSchoolPicks?: number;
  /** Cantrips the character knows without picking them. */
  fixedCantrips?: string[];
}

const LEVEL = 3;

/** Third casters at 3rd level (PHB tables): numbers only. */
const THIRD_CASTERS: Record<string, { classSlug: string; cantrips: number; schools: string[]; fixedCantrips?: string[] }> = {
  'cavaleiro-arcano': { classSlug: 'guerreiro', cantrips: 2, schools: ['abjuração', 'evocação'] },
  'trapaceiro-arcano': {
    classSlug: 'ladino',
    cantrips: 3,
    schools: ['encantamento', 'ilusão'],
    fixedCantrips: ['maos-magicas'],
  },
};
const THIRD_CASTER_SLOTS = [2, 0, 0, 0, 0, 0, 0, 0, 0];

/** Classes that prepare spells and the share of the class level they add. */
const PREPARED_LEVEL: Record<string, number> = { clerigo: LEVEL, druida: LEVEL, mago: LEVEL, paladino: Math.floor(LEVEL / 2) };

/** Wizard's spellbook: 6 at 1st level plus 2 per level after. */
const SPELLBOOK_AT_3 = 6 + 2 * (LEVEL - 1);

function thirdCaster(classSlug: string, subclassSlug: string | undefined) {
  const t = subclassSlug ? THIRD_CASTERS[subclassSlug] : undefined;
  return t && t.classSlug === classSlug ? t : undefined;
}

/** The ability a 3rd-level character casts with, or null for non-casters. */
export function castingAbilityAt3(classSlug: string, subclassSlug: string | undefined, classData: ClassData): AbilityKey | null {
  if (classData.spellcasting) return classData.spellcasting.ability;
  return thirdCaster(classSlug, subclassSlug) ? 'int' : null;
}

const maxLevelOf = (slots: number[]) => slots.reduce((max, n, i) => (n > 0 ? i + 1 : max), 0);

/**
 * Cantrips, known/prepared/spellbook counts and slots at 3rd level; null for a
 * non-caster. `abilityMod` is the modifier of `castingAbilityAt3`.
 */
export function spellcastingAt3(
  classSlug: string,
  subclassSlug: string | undefined,
  classData: ClassData,
  abilityMod: number,
): SpellcastingAt3 | null {
  const casting = classData.spellcasting;
  if (!casting) {
    const t = thirdCaster(classSlug, subclassSlug);
    if (!t) return null;
    const slots = [...THIRD_CASTER_SLOTS];
    return {
      ability: 'int',
      list: 'mago',
      cantrips: t.cantrips,
      known: 3,
      maxLevel: maxLevelOf(slots),
      slots,
      schools: t.schools,
      freeSchoolPicks: 1,
      ...(t.fixedCantrips ? { fixedCantrips: t.fixedCantrips } : {}),
    };
  }
  const row = casting.slots?.[LEVEL - 1] ?? [];
  const slots = Array.from({ length: 9 }, (_, i) => row[i] ?? 0);
  const out: SpellcastingAt3 = {
    ability: casting.ability,
    list: classSlug,
    cantrips: casting.cantripsKnown?.[LEVEL - 1] ?? 0,
    maxLevel: maxLevelOf(slots),
    slots,
  };
  const known = casting.spellsKnown?.[LEVEL - 1];
  if (known !== undefined) out.known = known;
  if (classSlug in PREPARED_LEVEL) out.prepared = Math.max(1, abilityMod + PREPARED_LEVEL[classSlug]);
  if (classSlug === 'mago') out.spellbook = SPELLBOOK_AT_3;
  if (classSlug === 'bruxo') out.pact = { slots: 2, level: 2 };
  return out;
}

/**
 * Spells of `list` ('any': every class list) or in `extra`, cantrips included,
 * up to `maxLevel`, by level then name. `schools` limits leveled spells only.
 */
export function availableSpells(
  spells: SpellEntry[],
  list: string,
  maxLevel: number,
  schools?: string[],
  extra: string[] = [],
): SpellEntry[] {
  return spells
    .filter(({ slug, data }) => {
      if (data.level > maxLevel) return false;
      if (!(list === 'any' ? data.classes.length > 0 : data.classes.includes(list)) && !extra.includes(slug)) return false;
      return data.level === 0 || !schools || schools.includes(data.school);
    })
    .sort((a, b) => a.data.level - b.data.level || a.name.localeCompare(b.name));
}

/** Slugs of a by-spell-level list up to `maxLevel`, in level order. */
function upTo(bySpellLevel: SpellsBySpellLevel | undefined, maxLevel: number): string[] {
  const out: string[] = [];
  for (let level = 1; level <= Math.min(maxLevel, 5); level++) {
    out.push(...(bySpellLevel?.[String(level) as keyof SpellsBySpellLevel] ?? []));
  }
  return out;
}

/** Subclass spell lists from features up to 3rd level; the terrain one for Circle of the Land. */
function subclassLists(subclass: SubclassData, optionPicks: Record<string, string[]>): SpellsBySpellLevel[] {
  const terrain = optionPicks.landTerrain?.[0];
  return subclass.features
    .filter((f) => f.level <= LEVEL)
    .flatMap((f) => [
      f.mechanics?.spellsBySpellLevel,
      terrain ? f.mechanics?.spellsByTerrain?.[terrain] : undefined,
    ])
    .filter((l): l is SpellsBySpellLevel => !!l);
}

/**
 * Domain, oath and Circle of the Land spells the character always has prepared,
 * up to `maxLevel`. A warlock patron's list is not prepared (see `expandedSpellsFor`).
 */
export function alwaysPreparedFor(
  subclass: SubclassData,
  optionPicks: Record<string, string[]>,
  maxLevel: number,
): string[] {
  if (subclass.parent === 'bruxo') return [];
  return [...new Set(subclassLists(subclass, optionPicks).flatMap((l) => upTo(l, maxLevel)))];
}

/** A warlock patron's expanded spell list up to `maxLevel`: extra choices, not prepared. */
export function expandedSpellsFor(subclass: SubclassData, maxLevel: number): string[] {
  if (subclass.parent !== 'bruxo') return [];
  return [...new Set(subclassLists(subclass, {}).flatMap((l) => upTo(l, maxLevel)))];
}
