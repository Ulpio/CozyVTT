import { finalScores, validateAbilityPicks } from './abilities';
import type {
  BackgroundData,
  ClassData,
  FeatData,
  RaceData,
  SpellData,
  SubclassData,
  SubraceData,
  WeaponData,
} from './compendiumData';
import { CLASS_EFFECTS } from './classRules';
import { FEAT_EFFECTS, FEAT_REQUIRES } from './featRules';
import { abilityIncreaseEffects, RACE_EFFECTS, REPLACES_RACE_INCREASES } from './raceRules';
import { SUBCLASS_EFFECTS } from './subclassRules';
import { availableSpells } from './spellRules';
import { backgroundToolCategory, isClassToolPick, toolsOf } from './toolRules';
import {
  SKILL_KEYS,
  type AbilityKey,
  type ArmorKind,
  type CreationChoices,
  type Effect,
  type OptionEffect,
  type Requirement,
  type SkillKey,
} from './types';

/** A compendium entry as the rules read it. */
export interface RulesEntry<T> {
  slug: string;
  name: string;
  data: T;
}

/** The compendium entries the wizard can pick from. */
export interface RulesData {
  races?: RulesEntry<RaceData>[];
  subraces?: RulesEntry<SubraceData>[];
  classes: RulesEntry<ClassData>[];
  subclasses: RulesEntry<SubclassData>[];
  backgrounds?: RulesEntry<BackgroundData>[];
  feats?: RulesEntry<FeatData>[];
  weapons?: RulesEntry<WeaponData>[];
  tools?: RulesEntry<unknown>[];
  /** When given, a cantrip or spell choice asks for no more than the list holds. */
  spells?: RulesEntry<SpellData>[];
}

/**
 * Something the player still has to pick. Where the picks go, by `kind`:
 * `option` → `optionPicks[id]` (option ids); `featChoice` → `optionPicks.feat`
 * (one feat slug); `cantripChoice`/`spellChoice` → `optionPicks[id]` (spell
 * slugs); `weaponChoice` → `optionPicks[id]` (weapon slugs); `languageChoice` and
 * `toolChoice` → `languagePicks`/`toolPicks` when the background owes them (ids
 * start with `background:`), else `optionPicks[id]`; `skillChoice` →
 * `skillPicks` (a Skilled pick that is a tool → `optionPicks[id]`); `expertiseChoice`
 * → `expertisePicks`.
 * `abilityChoice` is not listed: its picks are checked with `abilityPickErrors`
 * (the race's in the abilities step, a half-feat's with the feat).
 */
export interface PendingChoice {
  id: string;
  kind: Effect['type'];
  count: number;
  options?: { id: string; name: string }[];
}

/** The `optionPicks` key of the variant human's feat. */
export const FEAT_PICK = 'feat';

/**
 * A choice that has picks: option ids for `option`, the feat slug for
 * `featChoice`, spell, weapon, tool or language slugs for the other kinds.
 */
export interface ChoicePicks {
  id: string;
  effect: Effect;
  picks: string[];
}

/** Subclasses that cast from 3rd level in a class without spellcasting. */
const CASTING_SUBCLASSES = ['cavaleiro-arcano', 'trapaceiro-arcano'];

const SKILLS = new Set<string>(SKILL_KEYS);
const isSkill = (s: string): s is SkillKey => SKILLS.has(s);
const skillEffects = (list: string[] | undefined): Effect[] =>
  (list ?? []).filter(isSkill).map((skill) => ({ type: 'skill', skill }));
/** Lowercase without accents, to match a prose line to a tool name. */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** The tool a prose line names ("Ferramentas de ladrão"), if it names one. */
const toolSlugOf = (line: string, data: RulesData): string[] =>
  (data.tools ?? []).filter((t) => plain(t.name) === plain(line)).map((t) => t.slug);

const ABILITIES = new Set<string>(['str', 'dex', 'con', 'int', 'wis', 'cha']);

/**
 * The abilityChoice picks, in effect order: `racialChoices.abilityPicks`. A pick
 * not made yet is undefined, so the picks after it keep their place.
 */
export function abilityPicksOf(choices: CreationChoices): Array<AbilityKey | undefined> {
  const picks = choices.racialChoices.abilityPicks;
  return Array.isArray(picks) ? picks.map((p) => (ABILITIES.has(p as string) ? (p as AbilityKey) : undefined)) : [];
}

/** An effect, the id its picks are stored under, its counted picks and where it comes from. */
interface Tagged {
  effect: Effect;
  id: string;
  picks: string[];
  /** 'race', 'subrace', 'background', 'class', 'subclass', 'feat', or '<option id>.<option>' under a picked option. */
  scope: string;
}

const bySlug = <T>(list: RulesEntry<T>[] | undefined, slug: string | undefined) =>
  slug ? list?.find((e) => e.slug === slug) : undefined;

const unique = (list: string[] | undefined) => [...new Set(list ?? [])];

/** Armor kinds a class's proficiency lines grant ("Todas as armaduras", "armaduras médias", ...). */
export function classArmor(lines: string[]): ArmorKind[] {
  const out: ArmorKind[] = [];
  for (const raw of lines) {
    const line = raw.toLowerCase();
    if (line.includes('todas as armaduras')) out.push('light', 'medium', 'heavy');
    if (line.includes('leves')) out.push('light');
    if (line.includes('médias')) out.push('medium');
    if (line.includes('pesadas')) out.push('heavy');
    if (line.includes('escudos')) out.push('shield');
  }
  return out;
}

/** What the rules read while walking the effects. */
class Context {
  readonly cls?: RulesEntry<ClassData>;
  readonly subclass?: RulesEntry<SubclassData>;
  readonly knownCantrips: Set<string>;
  private beforeFeatCache?: Effect[];

  constructor(
    readonly choices: CreationChoices,
    readonly data: RulesData,
  ) {
    this.cls = bySlug(data.classes, choices.classSlug);
    const subclass = bySlug(data.subclasses, choices.subclassSlug);
    this.subclass = this.cls && subclass?.data.parent === this.cls.slug ? subclass : undefined;
    this.knownCantrips = new Set([
      ...choices.cantripSlugs,
      ...Object.entries(choices.optionPicks)
        .filter(([key]) => key.includes(':cantripChoice:'))
        .flatMap(([, slugs]) => slugs),
    ]);
  }

  /** Every effect but the feat's: what a feat prerequisite is checked against. */
  beforeFeat(): Effect[] {
    this.beforeFeatCache ??= tagAll(this, false).map((t) => t.effect);
    return this.beforeFeatCache;
  }

  meets(requires: Requirement[] | undefined): boolean {
    return (requires ?? []).every((r) => this.meetsOne(r));
  }

  private meetsOne(req: Requirement): boolean {
    switch (req.kind) {
      case 'option':
        return this.choices.optionPicks[req.id]?.includes(req.pick) ?? false;
      case 'cantrip':
        return this.knownCantrips.has(req.slug);
      case 'armor':
        return (
          classArmor(this.cls?.data.proficiencies.armor ?? []).includes(req.armor) ||
          this.beforeFeat().some((e) => e.type === 'armorProficiency' && e.armor === req.armor)
        );
      case 'score': {
        const scores = finalScores(this.choices.baseScores, this.beforeFeat(), abilityPicksOf(this.choices));
        return req.abilities.some((a) => scores[a] >= req.min);
      }
      case 'spellcasting':
        return !!this.cls?.data.spellcasting || CASTING_SUBCLASSES.includes(this.subclass?.slug ?? '');
      default: {
        const unreachable: never = req;
        throw new Error(`Unknown requirement: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  availableOptions(e: Extract<Effect, { type: 'option' }>): OptionEffect[] {
    return e.options.filter((o) => this.meets(o.requires));
  }

  availableFeats(): RulesEntry<FeatData>[] {
    return (this.data.feats ?? []).filter((f) => this.meets(FEAT_REQUIRES[f.slug]));
  }

  pickedFeat(): string | undefined {
    const slug = this.choices.optionPicks[FEAT_PICK]?.[0];
    if (!slug || !this.meets(FEAT_REQUIRES[slug])) return undefined;
    return !this.data.feats || this.data.feats.some((f) => f.slug === slug) ? slug : undefined;
  }

  toolOptions(category: Extract<Effect, { type: 'toolChoice' }>['category']): { id: string; name: string }[] {
    const tools = (this.data.tools ?? []).map((t) => ({ id: t.slug, name: t.name }));
    if (!category) return tools;
    const allowed = toolsOf(category);
    return tools.filter((t) => allowed.includes(t.id));
  }

  validTool(slug: string, category: Extract<Effect, { type: 'toolChoice' }>['category']): boolean {
    if (category) return toolsOf(category).includes(slug);
    return !this.data.tools || this.data.tools.some((t) => t.slug === slug);
  }

  validWeapon(slug: string): boolean {
    return !this.data.weapons || this.data.weapons.some((w) => w.slug === slug);
  }
}

/** Fixed race, background, class and subclass effects by scope; the subrace/subclass only when it belongs. */
function sources(ctx: Context): Array<[string, Effect[]]> {
  const { choices, data, cls, subclass } = ctx;
  const race = bySlug(data.races, choices.raceSlug);
  const subrace = bySlug(data.subraces, choices.subraceSlug);
  const background = bySlug(data.backgrounds, choices.backgroundSlug);
  const out: Array<[string, Effect[]]> = [];
  if (race) {
    const ownSubrace = subrace?.data.parent === race.slug ? subrace.slug : undefined;
    out.push([
      'race',
      [
        ...(REPLACES_RACE_INCREASES.includes(ownSubrace ?? '') ? [] : abilityIncreaseEffects(race.data.abilityIncreases)),
        ...skillEffects(race.data.proficiencies),
        ...(RACE_EFFECTS[race.slug] ?? []),
      ],
    ]);
  }
  if (race && subrace?.data.parent === race.slug) {
    out.push([
      'subrace',
      [
        ...abilityIncreaseEffects(subrace.data.abilityIncreases),
        ...skillEffects(subrace.data.proficiencies),
        ...(RACE_EFFECTS[subrace.slug] ?? []),
      ],
    ]);
  }
  if (background) {
    const { languages, proficiencies } = background.data;
    const effects: Effect[] = skillEffects(proficiencies.skills);
    if (typeof languages === 'number' && languages > 0) effects.push({ type: 'languageChoice', count: languages });
    for (const line of proficiencies.tools) {
      const category = backgroundToolCategory(line);
      if (category) effects.push({ type: 'toolChoice', count: 1, category });
    }
    // A proficiency the background repeats is swapped for another of the same
    // kind (PHB): a skill the race gives, a tool the class or subclass gives.
    const raceSkills = new Set(
      out.flatMap(([, list]) => list.flatMap((e) => (e.type === 'skill' ? [e.skill as string] : []))),
    );
    const repeatedSkills = proficiencies.skills.filter((s) => raceSkills.has(s)).length;
    if (repeatedSkills) effects.push({ type: 'skillChoice', count: repeatedSkills });
    const classTools = new Set([
      ...(cls?.data.proficiencies.tools ?? []).filter((l) => !isClassToolPick(l)).flatMap((l) => toolSlugOf(l, data)),
      ...(subclass ? (SUBCLASS_EFFECTS[subclass.slug] ?? []) : []).flatMap((e) => (e.type === 'tool' ? [e.tool] : [])),
    ]);
    const repeatedTools = proficiencies.tools
      .filter((l) => !backgroundToolCategory(l))
      .flatMap((l) => toolSlugOf(l, data))
      .filter((slug) => classTools.has(slug));
    if (repeatedTools.length) effects.push({ type: 'toolChoice', count: repeatedTools.length });
    out.push(['background', effects]);
  }
  if (cls) {
    out.push([
      'class',
      [
        ...cls.data.savingThrows.map((ability): Effect => ({ type: 'save', ability })),
        { type: 'skillChoice', count: cls.data.skills.choose, from: cls.data.skills.from.filter(isSkill) },
        ...(CLASS_EFFECTS[cls.slug] ?? []),
      ],
    ]);
  }
  if (subclass) out.push(['subclass', SUBCLASS_EFFECTS[subclass.slug] ?? []]);
  return out;
}

/**
 * Every effect with its pick id and counted picks, picked options' and (with
 * `withFeat`) the picked feat's effects included. Picked weapons, tools and
 * languages are added as weaponProficiency, tool and language effects.
 */
function tagAll(ctx: Context, withFeat: boolean): Tagged[] {
  const { choices } = ctx;
  const out: Tagged[] = [];
  const background = { languageChoice: 0, toolChoice: 0 };
  const walk = (effects: Effect[], scope: string) => {
    const seen: Partial<Record<Effect['type'], number>> = {};
    for (const effect of effects) {
      const n = (seen[effect.type] = (seen[effect.type] ?? -1) + 1);
      const id =
        effect.type === 'option' ? effect.id : effect.type === 'featChoice' ? FEAT_PICK : `${scope}:${effect.type}:${n}`;
      const stored = choices.optionPicks[id];
      const tagged: Tagged = { effect, id, picks: [], scope };
      out.push(tagged);
      switch (effect.type) {
        case 'option': {
          const available = ctx.availableOptions(effect);
          const picked = unique(stored)
            .map((pick) => available.find((o) => o.id === pick))
            .filter((o): o is OptionEffect => o !== undefined)
            .slice(0, effect.choose);
          tagged.picks = picked.map((o) => o.id);
          for (const o of picked) walk(o.effects, `${effect.id}.${o.id}`);
          break;
        }
        case 'featChoice': {
          // Without the feat (what its prerequisites are checked against) the pick is not read.
          const feat = withFeat ? ctx.pickedFeat() : undefined;
          if (feat) {
            tagged.picks = [feat];
            walk(FEAT_EFFECTS[feat] ?? [], 'feat');
          }
          break;
        }
        case 'cantripChoice':
        case 'spellChoice':
          tagged.picks = unique(stored).slice(0, effect.count);
          break;
        case 'weaponChoice':
          tagged.picks = unique(stored).filter((w) => ctx.validWeapon(w)).slice(0, effect.count);
          for (const weapon of tagged.picks) out.push({ effect: { type: 'weaponProficiency', weapon }, id, picks: [], scope });
          break;
        case 'languageChoice':
        case 'toolChoice': {
          let source = stored;
          if (scope === 'background') {
            const pool = effect.type === 'languageChoice' ? choices.languagePicks : choices.toolPicks;
            source = pool.slice(background[effect.type], background[effect.type] + effect.count);
            background[effect.type] += effect.count;
          }
          const valid =
            effect.type === 'toolChoice' ? unique(source).filter((t) => ctx.validTool(t, effect.category)) : unique(source);
          tagged.picks = valid.slice(0, effect.count);
          for (const pick of tagged.picks) {
            const derived: Effect =
              effect.type === 'toolChoice' ? { type: 'tool', tool: pick } : { type: 'language', language: pick };
            out.push({ effect: derived, id, picks: [], scope });
          }
          break;
        }
        case 'skillChoice':
          // Skilled: the picks that are tools (the skills stay in skillPicks).
          if (effect.orTool) {
            tagged.picks = unique(stored).filter((t) => ctx.validTool(t, undefined)).slice(0, effect.count);
            for (const tool of tagged.picks) out.push({ effect: { type: 'tool', tool }, id, picks: [], scope });
          }
          break;
        default:
          break;
      }
    }
  };
  for (const [scope, effects] of sources(ctx)) walk(effects, scope);
  return out;
}

interface Slot {
  id: string;
  count: number;
  allowed: (pick: string) => boolean;
}

/**
 * The largest assignment of picks to slots (bipartite matching by augmenting
 * paths). Picks are tried in order and slots in effect order, so picks keep the
 * slot they first fit unless moving them makes room for another; picks no slot
 * can take, repeats and `blocked` ones are left out.
 */
function allocate(picks: string[], slots: Slot[], blocked: Set<string>) {
  const taken = new Map<string, string[]>(slots.map((s) => [s.id, []]));
  const place = (pick: string, visited: Set<string>): boolean => {
    for (const slot of slots) {
      if (visited.has(slot.id) || !slot.allowed(pick)) continue;
      visited.add(slot.id);
      const list = taken.get(slot.id) ?? [];
      if (list.length < slot.count) {
        list.push(pick);
        return true;
      }
      for (let i = 0; i < list.length; i++) {
        if (place(list[i], visited)) {
          list[i] = pick;
          return true;
        }
      }
    }
    return false;
  };
  const used = new Set<string>();
  for (const pick of picks) {
    if (used.has(pick) || blocked.has(pick)) continue;
    if (place(pick, new Set())) used.add(pick);
  }
  return { taken, used };
}

/** resolve() per choices and data: the wizard checks every step on each render. */
const resolved = new WeakMap<CreationChoices, WeakMap<RulesData, ReturnType<typeof resolveNow>>>();

function resolve(choices: CreationChoices, data: RulesData) {
  let byData = resolved.get(choices);
  if (!byData) resolved.set(choices, (byData = new WeakMap()));
  let out = byData.get(data);
  if (!out) byData.set(data, (out = resolveNow(choices, data)));
  return out;
}

function resolveNow(choices: CreationChoices, data: RulesData) {
  const ctx = new Context(choices, data);
  const tagged = tagAll(ctx, true);
  const of = <K extends Effect['type']>(type: K) =>
    tagged.filter((t): t is Tagged & { effect: Extract<Effect, { type: K }> } => t.effect.type === type);

  const fixed = new Set<string>(of('skill').map((t) => t.effect.skill));
  const skillChoices = of('skillChoice');
  // A Skilled pick that is a tool takes a place the skills cannot.
  const skillSlots: Slot[] = skillChoices.map(({ effect, id, picks }) => ({
    id,
    count: effect.count - picks.length,
    allowed: (s) => isSkill(s) && (!effect.from || effect.from.includes(s)),
  }));
  const skills = allocate(choices.skillPicks, skillSlots, fixed);
  const proficient = new Set([...fixed, ...skills.used]);

  // Skills a skillChoice with `expertise` ended up with also get expertise.
  const autoExpertise = new Set<string>(of('expertise').map((t) => t.effect.skill));
  const derived: Effect[] = [];
  for (const { effect, id } of skillChoices) {
    if (!effect.expertise) continue;
    for (const skill of skills.taken.get(id) ?? []) {
      if (isSkill(skill) && !autoExpertise.has(skill)) {
        autoExpertise.add(skill);
        derived.push({ type: 'expertise', skill });
      }
    }
  }

  const expertiseSlots: Slot[] = of('expertiseChoice').map(({ effect, id }) => ({
    id,
    count: effect.count,
    allowed: (s) => proficient.has(s) || s === effect.tool,
  }));
  const expertise = allocate(choices.expertisePicks, expertiseSlots, autoExpertise);

  const effects = [...tagged.map((t) => t.effect), ...derived];
  return { ctx, tagged, effects, skillSlots, skills, proficient, autoExpertise, expertiseSlots, expertise };
}

const skillOptions = (keep: (s: SkillKey) => boolean) => SKILL_KEYS.filter(keep).map((s) => ({ id: s, name: s }));

/**
 * A choice the player makes, picked or not: `count` picks in all, the `picks`
 * it holds now, and every option it may hold (its own picks included). Skill
 * and expertise options are skill keys (plus tool slugs where a tool is
 * allowed); cantrip, spell and language choices list no options (the spell
 * list, or any language). Where picks are stored: see `PendingChoice`.
 */
export interface ChoiceState {
  id: string;
  kind: Effect['type'];
  /** Where it comes from: 'race', 'class', ..., 'feat', or '<option id>.<option>' under a picked option. */
  scope: string;
  effect: Effect;
  count: number;
  picks: string[];
  options?: { id: string; name: string }[];
}

const CHOICE_KINDS = new Set<Effect['type']>([
  'option',
  'featChoice',
  'cantripChoice',
  'spellChoice',
  'languageChoice',
  'toolChoice',
  'weaponChoice',
  'skillChoice',
  'expertiseChoice',
]);

function statesOf(resolved: ReturnType<typeof resolve>, data: RulesData): ChoiceState[] {
  const { ctx, tagged, skillSlots, skills, proficient, autoExpertise, expertiseSlots, expertise } = resolved;
  const toolNames = (data.tools ?? []).map((t) => ({ id: t.slug, name: t.name }));
  const out: ChoiceState[] = [];
  for (const { effect, id, picks, scope } of tagged) {
    if (!CHOICE_KINDS.has(effect.type)) continue;
    const state = (count: number, held: string[], options?: ChoiceState['options']) =>
      out.push({ id, kind: effect.type, scope, effect, count, picks: held, ...(options ? { options } : {}) });
    switch (effect.type) {
      case 'option':
        state(effect.choose, picks, ctx.availableOptions(effect).map((o) => ({ id: o.id, name: o.name })));
        break;
      case 'featChoice':
        state(1, picks, ctx.availableFeats().map((f) => ({ id: f.slug, name: f.name })));
        break;
      case 'cantripChoice':
      case 'spellChoice': {
        // No more picks than the books have spells on that list.
        const level = effect.type === 'cantripChoice' ? 0 : effect.level;
        const listed = data.spells
          ? availableSpells(data.spells, effect.list, level).filter((s) => s.data.level === level).length
          : effect.count;
        state(Math.min(effect.count, listed), picks);
        break;
      }
      case 'languageChoice':
        state(effect.count, picks);
        break;
      case 'toolChoice':
        state(effect.count, picks, ctx.toolOptions(effect.category));
        break;
      case 'weaponChoice':
        state(effect.count, picks, (data.weapons ?? []).map((w) => ({ id: w.slug, name: w.name })));
        break;
      case 'skillChoice': {
        const slot = skillSlots.find((s) => s.id === id);
        const own = skills.taken.get(id) ?? [];
        const options = skillOptions((s) => own.includes(s) || (!proficient.has(s) && !!slot?.allowed(s)));
        state(effect.count, [...own, ...picks], effect.orTool ? [...options, ...toolNames] : options);
        break;
      }
      case 'expertiseChoice': {
        const slot = expertiseSlots.find((s) => s.id === id);
        const own = expertise.taken.get(id) ?? [];
        const free = (s: string) => own.includes(s) || (!expertise.used.has(s) && !autoExpertise.has(s));
        const tool =
          effect.tool && free(effect.tool)
            ? [{ id: effect.tool, name: data.tools?.find((t) => t.slug === effect.tool)?.name ?? effect.tool }]
            : [];
        state(effect.count, own, [...skillOptions((s) => free(s) && !!slot?.allowed(s)), ...tool]);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Every choice the player makes, picked or not, in effect order. */
export function choiceStates(choices: CreationChoices, data: RulesData): ChoiceState[] {
  return statesOf(resolve(choices, data), data);
}

/**
 * Every effect of the race, subrace, background (skills, language and tool
 * picks), class (1st–3rd level, with its saves and skill choice), subclass and
 * the variant human's feat, including the effects of picked options and the
 * proficiencies picked weapons, tools and languages give, plus expertise from
 * skill choices that grant it; what the player still has to pick; and the
 * picks each choice ended up with (`picks`).
 */
export function collectEffects(
  choices: CreationChoices,
  data: RulesData,
): { effects: Effect[]; pending: PendingChoice[]; picks: ChoicePicks[] } {
  const resolved = resolve(choices, data);
  const { tagged, effects } = resolved;
  const pending: PendingChoice[] = [];
  for (const s of statesOf(resolved, data)) {
    const left = s.count - s.picks.length;
    if (left <= 0) continue;
    // Skill and expertise options exclude what is already held; other kinds list them all.
    const own = s.kind === 'skillChoice' || s.kind === 'expertiseChoice' ? s.picks : [];
    const options = s.options?.filter((o) => !own.includes(o.id));
    pending.push({ id: s.id, kind: s.kind, count: left, ...(options ? { options } : {}) });
  }
  const picks = tagged.filter((t) => t.picks.length).map(({ effect, id, picks }) => ({ effect, id, picks }));
  return { effects, pending, picks };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Kinds whose picks live in `optionPicks` (background languages and tools do not). */
function storedInOptionPicks(t: Tagged): boolean {
  switch (t.effect.type) {
    case 'option':
    case 'featChoice':
    case 'cantripChoice':
    case 'spellChoice':
    case 'weaponChoice':
      return true;
    case 'languageChoice':
    case 'toolChoice':
      return !t.id.startsWith('background:');
    case 'skillChoice':
      return !!t.effect.orTool;
    default:
      return false;
  }
}

function sameOptionPicks(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => b[k] !== undefined && sameList(a[k], b[k]));
}

/** Background-owed picks of one kind, in order. */
function backgroundPicks(tagged: Tagged[], type: 'languageChoice' | 'toolChoice'): string[] {
  return tagged.filter((t) => t.effect.type === type && t.id.startsWith('background:')).flatMap((t) => t.picks);
}

/**
 * Drops the picks a change made invalid: a subrace or subclass of another race or
 * class; option picks (and their nested picks) no longer offered or whose
 * prerequisite went away; the feat without the variant human or its
 * prerequisite; spell, weapon, language and tool picks of choices that are gone
 * or beyond what is owed; skill picks no choice accepts and expertise no longer
 * valid. Returns `choices` itself when nothing changed. Class spell picks
 * (`cantripSlugs`/`spellSlugs`) are left to the spell rules.
 */
export function pruneChoices(choices: CreationChoices, data: RulesData): CreationChoices {
  let out = choices;
  const subrace = bySlug(data.subraces, out.subraceSlug);
  if (data.subraces && out.subraceSlug && subrace?.data.parent !== out.raceSlug) out = { ...out, subraceSlug: undefined };
  const subclass = bySlug(data.subclasses, out.subclassSlug);
  if (out.subclassSlug && subclass?.data.parent !== out.classSlug) out = { ...out, subclassSlug: '' };

  // Dropping a pick can remove the choices under it or a prerequisite: repeat until stable.
  for (let i = 0; i < 10; i++) {
    const optionPicks: Record<string, string[]> = {};
    for (const t of tagAll(new Context(out, data), true)) {
      if (t.picks.length && storedInOptionPicks(t)) optionPicks[t.id] = t.picks;
    }
    if (sameOptionPicks(optionPicks, out.optionPicks)) break;
    out = { ...out, optionPicks };
  }

  const { tagged, skills, expertise } = resolve(out, data);
  const languagePicks = backgroundPicks(tagged, 'languageChoice');
  if (!sameList(languagePicks, out.languagePicks)) out = { ...out, languagePicks };
  const toolPicks = backgroundPicks(tagged, 'toolChoice');
  if (!sameList(toolPicks, out.toolPicks)) out = { ...out, toolPicks };
  const skillPicks = out.skillPicks.filter((s, i) => skills.used.has(s) && out.skillPicks.indexOf(s) === i);
  if (!sameList(skillPicks, out.skillPicks)) out = { ...out, skillPicks };
  const expertisePicks = out.expertisePicks.filter(
    (s, i) => expertise.used.has(s) && out.expertisePicks.indexOf(s) === i,
  );
  if (!sameList(expertisePicks, out.expertisePicks)) out = { ...out, expertisePicks };
  return out;
}

/**
 * Each abilityChoice in effect order with where its picks start in
 * `racialChoices.abilityPicks` (`start`), and whether the feat gives it (a
 * half-feat, picked with the feat) rather than the race.
 */
export interface AbilityChoiceSlot {
  effect: Extract<Effect, { type: 'abilityChoice' }>;
  feat: boolean;
  start: number;
}

export function abilityChoiceSlots(choices: CreationChoices, data: RulesData): AbilityChoiceSlot[] {
  let start = 0;
  return resolve(choices, data).tagged.flatMap(({ effect, scope }) => {
    if (effect.type !== 'abilityChoice') return [];
    const slot = { effect, feat: scope === 'feat', start };
    start += effect.count;
    return [slot];
  });
}

/**
 * What is wrong with the stored ability picks: of the race's choices
 * (`feat` false), the feat's (true), or all of them plus picks beyond the last
 * choice (omitted). Each choice is checked on its own: a feat may raise an
 * ability the race raised.
 */
export function abilityPickErrors(choices: CreationChoices, data: RulesData, feat?: boolean): string[] {
  const stored = choices.racialChoices.abilityPicks;
  const raw: unknown[] = Array.isArray(stored) ? stored : [];
  const slots = abilityChoiceSlots(choices, data);
  const errors = slots
    .filter((s) => feat === undefined || s.feat === feat)
    .flatMap((s) => {
      const mine = raw.slice(s.start, s.start + s.effect.count).filter((p): p is AbilityKey => ABILITIES.has(p as string));
      return validateAbilityPicks([s.effect], mine);
    });
  const size = slots.reduce((n, s) => n + s.effect.count, 0);
  if (feat === undefined && raw.slice(size).some((p) => ABILITIES.has(p as string))) errors.push('tooManyPicks');
  return [...new Set(errors)];
}
