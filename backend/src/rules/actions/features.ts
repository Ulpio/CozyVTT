/**
 * Class features as data: the features a character has at its level (from its
 * compendium class and subclass entries), the pools their uses come from, and
 * how they show on the action bar. A feature reaches the bar only through its
 * `mechanics.action` (compendium/schemas.ts, FeatureActionSchema); one without
 * it stays text on the sheet.
 *
 * Resolving a feature option (spending its use, starting a state) is not done
 * here (services/actionResolver/features.ts); this only lists what an actor has.
 */

import { FeatureActionSchema, type FeatureAction } from '../../compendium/schemas';
import { sheetAbilityModifier } from '../../utils/rules/fifthEdition';
import type { FifthEditionCharacterData } from '../../validators/game-systems/fifthEdition.schema';
import { characterLevel, commonBonusActions, type ActionOption, type FeatureRider, type ResolvedActionSpec } from './catalogue';

/** A value by class level: the entry with the highest key at or below the level applies. */
export type ByLevel<T> = Record<string, T>;

export type { FeatureAction };

/** One feature of a compendium class or subclass entry. */
interface CompendiumFeature {
  name: string;
  description: string;
  level: number;
  mechanics?: unknown;
}

/** The parts of a compendium class entry the features read. */
export interface CompendiumClass {
  bookId: string;
  slug: string;
  name: string;
  data: { features?: CompendiumFeature[] };
}

/** The parts of a compendium subclass entry the features read. */
export interface CompendiumSubclass {
  bookId: string;
  slug: string;
  name: string;
  data: { parent?: string; features?: CompendiumFeature[] };
}

/** A feature the actor has, with what it does on the bar. */
export interface ActorFeature {
  /** `feature:<bookId>/<classOrSubclassSlug>/<action.key>`. */
  id: string;
  name: string;
  level: number;
  action: FeatureAction;
}

export interface ResourcePool {
  max: number;
  spent: number;
  recovers: 'short' | 'long';
}

const ABILITY_NAMES = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' } as const;

/** The value for `level` of a by-level table, or undefined below its first key. */
export function atLevel<T>(table: ByLevel<T>, level: number): T | undefined {
  let best: number | undefined;
  for (const key of Object.keys(table)) {
    const at = Number(key);
    if (Number.isFinite(at) && at <= level && (best === undefined || at > best)) best = at;
  }
  return best === undefined ? undefined : table[String(best)];
}

/** Lowercase, accents off, spaces trimmed: how a sheet's class name meets an entry's. */
const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/**
 * The compendium class a sheet is of: the one its origin points at, else (a
 * sheet made before guided creation) the one whose name is the sheet's
 * class. None for a homebrew class.
 */
export function classEntryFor<C extends CompendiumClass>(sheet: FifthEditionCharacterData, classes: C[]): C | null {
  const ref = sheet?.origin?.class;
  if (ref) return classes.find((c) => c.bookId === ref.bookId && c.slug === ref.slug) ?? null;
  const name = typeof sheet?.class === 'string' ? plain(sheet.class) : '';
  if (!name) return null;
  return classes.find((c) => plain(c.name) === name) ?? null;
}

/** The features of the class and subclass up to the sheet's level that have an action the schema accepts. */
export function actorFeatures(
  sheet: FifthEditionCharacterData,
  classEntry: CompendiumClass | null,
  subclassEntry: CompendiumSubclass | null,
): ActorFeature[] {
  const level = characterLevel(sheet);
  const out: ActorFeature[] = [];
  for (const entry of [classEntry, subclassEntry]) {
    if (!entry) continue;
    for (const feature of entry.data?.features ?? []) {
      if (typeof feature?.level !== 'number' || feature.level > level) continue;
      const raw = (feature.mechanics as { action?: unknown } | undefined)?.action;
      if (raw === undefined) continue;
      const parsed = FeatureActionSchema.safeParse(raw);
      if (!parsed.success) continue;
      out.push({ id: `feature:${entry.bookId}/${entry.slug}/${parsed.data.key}`, name: feature.name, level: feature.level, action: parsed.data });
    }
  }
  return out;
}

type ResourceDecl = NonNullable<FeatureAction['resources']>[number];

function poolMax(max: ResourceDecl['max'], sheet: FifthEditionCharacterData, level: number): number {
  if (typeof max === 'number') return max;
  if (max === 'classLevel') return level;
  if (max === 'proficiency') return typeof sheet?.proficiencyBonus === 'number' ? sheet.proficiencyBonus : 2;
  if ('ability' in max && typeof max.ability === 'string') return Math.max(max.min ?? 0, sheetAbilityModifier(sheet, ABILITY_NAMES[max.ability]));
  if ('perLevel' in max && typeof max.perLevel === 'number') return max.perLevel * level;
  return atLevel(max as ByLevel<number>, level) ?? 0;
}

/**
 * The pools of uses the actor's features declare, by resource key, with what
 * the sheet has spent of each. A key declared twice takes the later
 * (higher-level) declaration.
 */
export function resourcePools(features: ActorFeature[], sheet: FifthEditionCharacterData): Record<string, ResourcePool> {
  const level = characterLevel(sheet);
  const pools: Record<string, ResourcePool> = {};
  const ordered = [...features].sort((a, b) => a.level - b.level);
  for (const feature of ordered) {
    for (const decl of feature.action.resources ?? []) {
      const max = poolMax(decl.max, sheet, level);
      const recovers = typeof decl.recovers === 'string' ? decl.recovers : (atLevel(decl.recovers, level) ?? 'long');
      const used = sheet?.featureUses?.[decl.key];
      const spent = typeof used === 'number' && used > 0 ? Math.min(used, max) : 0;
      pools[decl.key] = { max, spent, recovers };
    }
  }
  return pools;
}

/** Weapon attacks one Attack action allows: one, plus each passive extra attack. */
export function attacksPerAction(features: ActorFeature[]): number {
  return 1 + features.reduce((n, f) => n + (f.action.kind === 'passive' ? (f.action.passive?.extraAttacks ?? 0) : 0), 0);
}

/** The lowest d20 roll that is a critical hit: 20, unless a passive lowers it. */
export function critMin(features: ActorFeature[]): number {
  return features.reduce((min, f) => (f.action.kind === 'passive' && f.action.passive?.critMin ? Math.min(min, f.action.passive.critMin) : min), 20);
}

/** Uses left of the pool a feature spends, when it spends one the actor has. */
function usesOf(action: FeatureAction, pools: Record<string, ResourcePool>): { left: number; max: number } | undefined {
  const pool = action.spends ? pools[action.spends.key] : undefined;
  return pool ? { left: pool.max - pool.spent, max: pool.max } : undefined;
}

/** Whether an addDamage feature's filter lets it ride on this weapon attack. */
function riderFits(filter: FeatureAction['filter'], spec: ResolvedActionSpec, sheet: FifthEditionCharacterData): boolean {
  if (!filter) return true;
  const melee = spec.option.meleeWeapon === true;
  const finesse = spec.finesse === true;
  if (filter.melee && !melee) return false;
  if (filter.ranged && melee) return false;
  if (filter.finesseOrRanged && !(finesse || !melee)) return false;
  if (filter.strength) {
    // A ranged attack uses DEX; a finesse one the better of the two; any other STR.
    if (!melee) return false;
    if (finesse && sheetAbilityModifier(sheet, 'strength') < sheetAbilityModifier(sheet, 'dexterity')) return false;
  }
  return true;
}

/**
 * Kinds that are a button of their own; passive and none are not, addDamage
 * rides on weapon attacks, and makeBonus adds bonus-action copies of common actions.
 */
const BUTTON_KINDS = new Set<FeatureAction['kind']>(['state', 'heal', 'extraAction', 'attacks', 'use']);

/**
 * The catalogue with the actor's features added: an option for each feature
 * that is a button of its own (named by its label, else by the feature), each
 * addDamage feature as a rider on the weapon attacks its filter lets through,
 * and the common actions makeBonus features let be taken as a bonus action.
 */
export function withFeatures(specs: ResolvedActionSpec[], features: ActorFeature[], sheet: FifthEditionCharacterData): ResolvedActionSpec[] {
  if (features.length === 0) return specs;
  const pools = resourcePools(features, sheet);
  const active = new Set(sheet?.activeStates ?? []);
  const riders = features.filter((f) => f.action.kind === 'addDamage');

  const withRiders = specs.map((spec) => {
    if (spec.source !== 'weapon' || spec.option.group !== 'attack' || riders.length === 0) return spec;
    const fitting: FeatureRider[] = riders
      .filter((f) => riderFits(f.action.filter, spec, sheet))
      .map((f) => {
        const rider: FeatureRider = { featureId: f.id, name: f.name };
        const uses = usesOf(f.action, pools);
        if (uses) rider.uses = uses;
        if (f.action.slot) rider.slot = true;
        return rider;
      });
    return fitting.length > 0 ? { ...spec, option: { ...spec.option, riders: fitting } } : spec;
  });

  const options: ResolvedActionSpec[] = features
    .filter((f) => BUTTON_KINDS.has(f.action.kind))
    .map((f) => {
      const option: ActionOption = { id: f.id, name: f.action.label ?? f.name, group: 'feature', resolution: 'feature', cost: f.action.cost ?? 'none' };
      const uses = usesOf(f.action, pools);
      if (uses) option.uses = uses;
      if (active.has(f.id)) option.active = true;
      const spec: ResolvedActionSpec = { option, damage: [], source: 'feature', feature: f };
      return spec;
    });

  const bonusKinds = [...new Set(features.flatMap((f) => (f.action.kind === 'makeBonus' ? f.action.makeBonus ?? [] : [])))];
  const bonusCommons = bonusKinds.length > 0 ? commonBonusActions(bonusKinds) : [];

  return [...withRiders, ...options, ...bonusCommons];
}
