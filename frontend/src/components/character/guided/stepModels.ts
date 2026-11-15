// ============================================
// What steps 6 to 9 read from the choices: which choices each step shows and
// where a pick is written, the equipment the class and background offer, and
// the spells a caster picks. Pure functions, shared by the steps and by their
// completeness checks.
// ============================================

import { abilityModifier } from '@/utils/rules/fifthEdition';
import { finalScores } from '@/utils/guidedCreation/abilities';
import type { CreationData, CreationEntry } from '@/utils/guidedCreation/buildSheet';
import { abilityPicksOf, collectEffects, type ChoiceState } from '@/utils/guidedCreation/collectEffects';
import type { EquipmentChoiceData, SpellData } from '@/utils/guidedCreation/compendiumData';
import {
  anyOfKey,
  anyOfOptions,
  equipmentChoicesOf,
  normalizeName,
  offeredOptions,
  proficienciesFor,
  type Proficiencies,
} from '@/utils/guidedCreation/equipmentRules';
import {
  alwaysPreparedFor,
  availableSpells,
  castingAbilityAt3,
  expandedSpellsFor,
  spellcastingAt3,
  type SpellcastingAt3,
} from '@/utils/guidedCreation/spellRules';
import { SKILL_KEYS, type AbilityKey, type CreationChoices, type Effect } from '@/utils/guidedCreation/types';

// --- Choices ------------------------------------------------------------------

const SKILLS_STEP_KINDS = new Set<Effect['type']>(['skillChoice', 'languageChoice', 'toolChoice']);
const TOP_SCOPES = new Set(['race', 'subrace', 'background', 'class', 'subclass']);

/** Where a choice comes from: 'race', 'class', ..., 'feat', or '<option id>.<pick>' for a nested one. */
export const scopeOf = (id: string) => id.split(':')[0];

/**
 * Step 6 holds the skills, languages and tools the race, subrace, background,
 * class and subclass owe; step 7 everything else (options, expertise, the feat,
 * cantrips, spells, weapons) and the choices that appear under a picked option
 * or the feat, so a choice is always made after what gives it.
 */
export const inSkillsStep = (s: Pick<ChoiceState, 'id' | 'kind'>) => SKILLS_STEP_KINDS.has(s.kind) && TOP_SCOPES.has(scopeOf(s.id));

const isSkillKey = (s: string) => (SKILL_KEYS as readonly string[]).includes(s);

/** Languages the character speaks without picking: the race's (not its "of your choice" lines) and fixed ones. */
export function knownLanguages(data: CreationData, choices: CreationChoices, effects: Effect[]): string[] {
  const race = data.races.find((r) => r.slug === choices.raceSlug);
  const subrace = data.subraces.find((s) => s.slug === choices.subraceSlug && s.data.parent === race?.slug);
  const lines = [...(race?.data.languages ?? []), ...(subrace?.data.languages ?? [])].filter(
    (l) => !normalizeName(l).includes('escolha'),
  );
  return [...new Set([...lines, ...effects.flatMap((e) => (e.type === 'language' ? [e.language] : []))])];
}

/**
 * The patch that makes `next` the picks of `state`, written where its kind
 * stores them (see PendingChoice): skills in `skillPicks` and expertise in
 * `expertisePicks` (shared by every choice of the kind, so only this choice's
 * picks are swapped), background languages and tools in `languagePicks` and
 * `toolPicks` (in background order), the rest in `optionPicks[id]`.
 */
export function picksPatch(
  choices: CreationChoices,
  states: ChoiceState[],
  state: ChoiceState,
  next: string[],
): Partial<CreationChoices> {
  const swap = (list: string[], old: string[], added: string[]) => [...list.filter((x) => !old.includes(x)), ...added];
  if (state.kind === 'skillChoice') {
    const skills = next.filter(isSkillKey);
    const tools = next.filter((p) => !isSkillKey(p));
    const patch: Partial<CreationChoices> = {
      skillPicks: swap(choices.skillPicks, state.picks.filter(isSkillKey), skills) as CreationChoices['skillPicks'],
    };
    if (state.effect.type === 'skillChoice' && state.effect.orTool) {
      patch.optionPicks = { ...choices.optionPicks, [state.id]: tools };
    }
    return patch;
  }
  if (state.kind === 'expertiseChoice') {
    return { expertisePicks: swap(choices.expertisePicks, state.picks, next) };
  }
  if ((state.kind === 'languageChoice' || state.kind === 'toolChoice') && scopeOf(state.id) === 'background') {
    const pool = states
      .filter((s) => s.kind === state.kind && scopeOf(s.id) === 'background')
      .flatMap((s) => (s.id === state.id ? next : s.picks));
    return state.kind === 'languageChoice' ? { languagePicks: pool } : { toolPicks: pool };
  }
  return { optionPicks: { ...choices.optionPicks, [state.id]: next } };
}

// --- Equipment ----------------------------------------------------------------

export interface EquipmentModel {
  choices: EquipmentChoiceData[];
  /** Per choice, the option indexes the character can use. */
  offered: number[][];
  /** Per choice, the option in use: the only one offered, or the player's pick when offered. */
  selected: Array<number | undefined>;
  proficiencies: Proficiencies;
}

/** The class's and background's equipment choices; null without a class. */
export function equipmentModel(data: CreationData, choices: CreationChoices): EquipmentModel | null {
  const cls = data.classes.find((c) => c.slug === choices.classSlug);
  if (!cls) return null;
  const background = data.backgrounds.find((b) => b.slug === choices.backgroundSlug)?.data;
  const race = data.races.find((r) => r.slug === choices.raceSlug);
  const subrace = data.subraces.find((s) => s.slug === choices.subraceSlug && s.data.parent === race?.slug);
  const { effects } = collectEffects(choices, data);
  const raceLines = [...(race?.data.proficiencies ?? []), ...(subrace?.data.proficiencies ?? [])];
  const proficiencies = proficienciesFor(cls.slug, cls.data, effects, raceLines, data.weapons);
  const offered = offeredOptions(cls.data, background, proficiencies, data);
  const list = equipmentChoicesOf(cls.data, background);
  const selected = offered.map((ok, c) => (ok.length === 1 ? ok[0] : ok.includes(choices.equipmentPicks[c]) ? choices.equipmentPicks[c] : undefined));
  return { choices: list, offered, selected, proficiencies };
}

/** Every choice has an option in use, and each "any ..." unit of it a valid item. */
export function equipmentComplete(model: EquipmentModel, choices: CreationChoices, data: CreationData): boolean {
  return model.choices.every((choice, c) => {
    const index = model.selected[c];
    if (index === undefined) return false;
    return choice.options[index].items.every((item, i) => {
      if (!item.anyOf) return true;
      const options = anyOfOptions(item.anyOf, data, model.proficiencies);
      return Array.from({ length: item.quantity }, (_, unit) => choices.anyOfPicks[anyOfKey(c, i, unit)]).every(
        (slug) => !!slug && options.some((o) => o.slug === slug),
      );
    });
  });
}

// --- Spells -------------------------------------------------------------------

type SpellEntry = CreationEntry<SpellData>;

export interface SpellModel {
  casting: SpellcastingAt3;
  /** Cantrips known without picking (Arcane Trickster's Mage Hand). */
  fixedCantrips: SpellEntry[];
  cantripPool: SpellEntry[];
  cantripsNeeded: number;
  /** The cantrip picks that count. */
  cantrips: string[];
  /** 'known' (bard, sorcerer, warlock, ranger, third casters), 'prepared' (cleric, druid, paladin) or 'spellbook' (wizard). */
  mode: 'known' | 'prepared' | 'spellbook';
  /** Leveled spells the player may pick from (always-prepared ones excluded). */
  pool: SpellEntry[];
  /** Subclass spells always prepared. */
  always: SpellEntry[];
  limit: number;
  /** What completes the step: the limit, or fewer when the books offer fewer. */
  needed: number;
  /** The leveled picks that count, in order. */
  spells: string[];
  /** Off-school picks left (Eldritch Knight, Arcane Trickster). */
  freeSchoolLeft: number;
  /** The wizard's prepared spells: how many, how many the step needs and the picks that count. */
  preparedLimit: number;
  preparedNeeded: number;
  prepared: string[];
}

/** The class's spellcasting at 3rd level as the spells step picks it; null for a non-caster. */
export function spellModel(data: CreationData, choices: CreationChoices): SpellModel | null {
  const cls = data.classes.find((c) => c.slug === choices.classSlug);
  if (!cls) return null;
  const subclass = data.subclasses.find((s) => s.slug === choices.subclassSlug && s.data.parent === cls.slug);
  const ability = castingAbilityAt3(cls.slug, subclass?.slug, cls.data);
  if (!ability) return null;
  const { effects } = collectEffects(choices, data);
  const scores = finalScores(choices.baseScores, effects, abilityPicksOf(choices));
  const casting = spellcastingAt3(cls.slug, subclass?.slug, cls.data, abilityModifier(scores[ability as AbilityKey]));
  if (!casting) return null;

  const bySlug = new Map(data.spells.map((s) => [s.slug, s]));
  const fixedCantrips = (casting.fixedCantrips ?? []).flatMap((s) => (bySlug.has(s) ? [bySlug.get(s)!] : []));
  const fixed = new Set(fixedCantrips.map((s) => s.slug));
  const cantripPool = availableSpells(data.spells, casting.list, 0).filter((s) => !fixed.has(s.slug)) as SpellEntry[];
  const cantripsNeeded = Math.min(Math.max(0, casting.cantrips - fixedCantrips.length), cantripPool.length);
  const cantripSlugs = new Set(cantripPool.map((s) => s.slug));
  const cantrips = [...new Set(choices.cantripSlugs)].filter((s) => cantripSlugs.has(s)).slice(0, cantripsNeeded);

  const alwaysSlugs = subclass ? alwaysPreparedFor(subclass.data, choices.optionPicks, casting.maxLevel) : [];
  const always = alwaysSlugs.flatMap((s) => (bySlug.has(s) ? [bySlug.get(s)!] : []));
  const extra = subclass ? expandedSpellsFor(subclass.data, casting.maxLevel) : [];
  const pool = (availableSpells(data.spells, casting.list, casting.maxLevel, undefined, extra) as SpellEntry[]).filter(
    (s) => s.data.level > 0 && !alwaysSlugs.includes(s.slug),
  );

  const mode = casting.spellbook !== undefined ? 'spellbook' : casting.known !== undefined ? 'known' : 'prepared';
  const limit = casting.spellbook ?? casting.known ?? casting.prepared ?? 0;
  const inSchool = (s: SpellEntry) => !casting.schools || casting.schools.includes(s.data.school);
  const offSchool = pool.filter((s) => !inSchool(s)).length;
  const eligible = pool.length - offSchool + Math.min(casting.freeSchoolPicks ?? 0, offSchool);
  const needed = Math.min(limit, casting.schools ? eligible : pool.length);

  // The picks in order until the limit; an off-school pick only while free picks remain (as buildSheet reads them).
  const inPool = new Map(pool.map((s) => [s.slug, s]));
  let freeSchoolLeft = casting.freeSchoolPicks ?? 0;
  const spells: string[] = [];
  for (const slug of new Set(choices.spellSlugs)) {
    const spell = inPool.get(slug);
    if (!spell || spells.length >= limit) continue;
    if (!inSchool(spell)) {
      if (freeSchoolLeft <= 0) continue;
      freeSchoolLeft -= 1;
    }
    spells.push(slug);
  }

  const preparedLimit = mode === 'spellbook' ? (casting.prepared ?? 0) : 0;
  const prepared = [...new Set(choices.preparedSlugs ?? [])].filter((s) => spells.includes(s)).slice(0, preparedLimit);
  const preparedNeeded = Math.min(preparedLimit, spells.length);

  return {
    casting,
    fixedCantrips,
    cantripPool,
    cantripsNeeded,
    cantrips,
    mode,
    pool,
    always,
    limit,
    needed,
    spells,
    freeSchoolLeft,
    preparedLimit,
    preparedNeeded,
    prepared,
  };
}

export const spellsComplete = (m: SpellModel) =>
  m.cantrips.length === m.cantripsNeeded && m.spells.length === m.needed && m.prepared.length === m.preparedNeeded;
