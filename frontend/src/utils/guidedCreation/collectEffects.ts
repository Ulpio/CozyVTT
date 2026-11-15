import type { BackgroundData, ClassData, FeatData, RaceData, SubclassData, SubraceData } from './compendiumData';
import { CLASS_EFFECTS } from './classRules';
import { FEAT_EFFECTS } from './featRules';
import { abilityIncreaseEffects, RACE_EFFECTS } from './raceRules';
import { SUBCLASS_EFFECTS } from './subclassRules';
import { SKILL_KEYS, type CreationChoices, type Effect, type OptionEffect, type SkillKey } from './types';

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
}

/**
 * Something the player still has to pick. Where the picks go, by `kind`:
 * `option` → `optionPicks[id]` (option ids); `featChoice` → `optionPicks.feat`
 * (one feat slug); `cantripChoice`/`spellChoice` → `optionPicks[id]` (spell
 * slugs); `skillChoice` → `skillPicks`; `expertiseChoice` → `expertisePicks`;
 * `languageChoice` → `languagePicks`; `toolChoice` → `toolPicks`.
 * `abilityChoice` is not listed: the abilities step checks it with
 * `validateAbilityPicks`.
 */
export interface PendingChoice {
  id: string;
  kind: Effect['type'];
  count: number;
  options?: { id: string; name: string }[];
}

/** The `optionPicks` key of the variant human's feat. */
export const FEAT_PICK = 'feat';

const SKILLS = new Set<string>(SKILL_KEYS);
const isSkill = (s: string): s is SkillKey => SKILLS.has(s);
const skillEffects = (list: string[] | undefined): Effect[] =>
  (list ?? []).filter(isSkill).map((skill) => ({ type: 'skill', skill }));

/** An effect and the id its picks are stored under. */
interface Tagged {
  effect: Effect;
  id: string;
}

const bySlug = <T>(list: RulesEntry<T>[] | undefined, slug: string | undefined) =>
  slug ? list?.find((e) => e.slug === slug) : undefined;

function pickedOptions(e: Extract<Effect, { type: 'option' }>, picks: string[] | undefined): OptionEffect[] {
  const ids = [...new Set(picks ?? [])];
  return ids
    .map((id) => e.options.find((o) => o.id === id))
    .filter((o): o is OptionEffect => o !== undefined)
    .slice(0, e.choose);
}

function pickedFeat(choices: CreationChoices, data: RulesData): string | undefined {
  const slug = choices.optionPicks[FEAT_PICK]?.[0];
  if (!slug) return undefined;
  return !data.feats || data.feats.some((f) => f.slug === slug) ? slug : undefined;
}

/** Fixed race, background, class and subclass effects by scope; the subrace/subclass only when it belongs. */
function sources(choices: CreationChoices, data: RulesData): Array<[string, Effect[]]> {
  const race = bySlug(data.races, choices.raceSlug);
  const subrace = bySlug(data.subraces, choices.subraceSlug);
  const cls = bySlug(data.classes, choices.classSlug);
  const subclass = bySlug(data.subclasses, choices.subclassSlug);
  const background = bySlug(data.backgrounds, choices.backgroundSlug);
  const out: Array<[string, Effect[]]> = [];
  if (race) {
    out.push([
      'race',
      [
        ...abilityIncreaseEffects(race.data.abilityIncreases),
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
  if (background) out.push(['background', skillEffects(background.data.proficiencies.skills)]);
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
  if (cls && subclass?.data.parent === cls.slug) {
    out.push(['subclass', SUBCLASS_EFFECTS[subclass.slug] ?? []]);
  }
  return out;
}

/** Every effect with its pick id, picked options' and the picked feat's effects included. */
function tagAll(choices: CreationChoices, data: RulesData): Tagged[] {
  const out: Tagged[] = [];
  const walk = (effects: Effect[], scope: string) => {
    const seen: Partial<Record<Effect['type'], number>> = {};
    for (const effect of effects) {
      const n = (seen[effect.type] = (seen[effect.type] ?? -1) + 1);
      const id =
        effect.type === 'option' ? effect.id : effect.type === 'featChoice' ? FEAT_PICK : `${scope}:${effect.type}:${n}`;
      out.push({ effect, id });
      if (effect.type === 'option') {
        for (const o of pickedOptions(effect, choices.optionPicks[effect.id])) walk(o.effects, `${effect.id}.${o.id}`);
      } else if (effect.type === 'featChoice') {
        const feat = pickedFeat(choices, data);
        if (feat) walk(FEAT_EFFECTS[feat] ?? [], 'feat');
      }
    }
  };
  for (const [scope, effects] of sources(choices, data)) walk(effects, scope);
  return out;
}

interface Slot {
  id: string;
  count: number;
  allowed: (s: SkillKey) => boolean;
  /** Restricted slots take picks first, so an open slot does not steal them. */
  width: number;
}

/** Hands each pick to the first slot that accepts it; picks no slot accepts are left out. */
function allocate(picks: SkillKey[], slots: Slot[], blocked: Set<SkillKey>) {
  const taken = new Map<string, SkillKey[]>(slots.map((s) => [s.id, []]));
  const used = new Set<SkillKey>();
  const order = [...slots].sort((a, b) => a.width - b.width);
  for (const pick of picks) {
    if (used.has(pick) || blocked.has(pick)) continue;
    const slot = order.find((s) => s.allowed(pick) && (taken.get(s.id)?.length ?? 0) < s.count);
    if (!slot) continue;
    taken.get(slot.id)?.push(pick);
    used.add(pick);
  }
  return { taken, used };
}

function resolve(choices: CreationChoices, data: RulesData) {
  const tagged = tagAll(choices, data);
  const effects = tagged.map((t) => t.effect);
  const of = <K extends Effect['type']>(type: K) =>
    tagged.filter((t): t is { effect: Extract<Effect, { type: K }>; id: string } => t.effect.type === type);

  const fixed = new Set(of('skill').map((t) => t.effect.skill));
  const skillSlots: Slot[] = of('skillChoice').map(({ effect, id }) => ({
    id,
    count: effect.count,
    allowed: (s) => !effect.from || effect.from.includes(s),
    width: effect.from?.length ?? SKILL_KEYS.length,
  }));
  const skills = allocate(choices.skillPicks, skillSlots, fixed);
  const proficient = new Set([...fixed, ...skills.used]);

  const expertiseSlots: Slot[] = of('expertiseChoice').map(({ effect, id }) => ({
    id,
    count: effect.count,
    allowed: (s) => proficient.has(s) && (!effect.from || effect.from.includes(s)),
    width: effect.from?.length ?? SKILL_KEYS.length,
  }));
  const expertise = allocate(choices.expertisePicks, expertiseSlots, new Set());

  return { tagged, effects, of, skillSlots, skills, proficient, expertiseSlots, expertise };
}

const skillOptions = (keep: (s: SkillKey) => boolean) =>
  SKILL_KEYS.filter(keep).map((s) => ({ id: s, name: s }));

/**
 * Every effect of the race, subrace, background skills, class (1st–3rd level, with
 * its saves and skill choice), subclass and the variant human's feat, including
 * the effects of picked options; and what the player still has to pick.
 */
export function collectEffects(
  choices: CreationChoices,
  data: RulesData,
): { effects: Effect[]; pending: PendingChoice[] } {
  const { tagged, effects, skillSlots, skills, proficient, expertiseSlots, expertise } = resolve(choices, data);
  const pending: PendingChoice[] = [];
  const consumed = { languageChoice: 0, toolChoice: 0 };
  const pools = { languageChoice: choices.languagePicks.length, toolChoice: choices.toolPicks.length };

  for (const { effect, id } of tagged) {
    const add = (count: number, options?: PendingChoice['options']) => {
      if (count > 0) pending.push({ id, kind: effect.type, count, ...(options ? { options } : {}) });
    };
    switch (effect.type) {
      case 'option':
        add(
          effect.choose - pickedOptions(effect, choices.optionPicks[id]).length,
          effect.options.map((o) => ({ id: o.id, name: o.name })),
        );
        break;
      case 'featChoice':
        if (!pickedFeat(choices, data)) add(1, (data.feats ?? []).map((f) => ({ id: f.slug, name: f.name })));
        break;
      case 'cantripChoice':
      case 'spellChoice':
        add(effect.count - (choices.optionPicks[id]?.length ?? 0));
        break;
      case 'languageChoice':
      case 'toolChoice': {
        const got = Math.min(effect.count, pools[effect.type] - consumed[effect.type]);
        consumed[effect.type] += got;
        add(effect.count - got);
        break;
      }
      case 'skillChoice': {
        const slot = skillSlots.find((s) => s.id === id);
        add(
          effect.count - (skills.taken.get(id)?.length ?? 0),
          skillOptions((s) => !proficient.has(s) && !!slot?.allowed(s)),
        );
        break;
      }
      case 'expertiseChoice': {
        const slot = expertiseSlots.find((s) => s.id === id);
        add(
          effect.count - (expertise.taken.get(id)?.length ?? 0),
          skillOptions((s) => !expertise.used.has(s) && !!slot?.allowed(s)),
        );
        break;
      }
      default:
        break;
    }
  }
  return { effects, pending };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The picks that still count: valid option ids, the feat, and spell picks of choices that still exist. */
function prunedOptionPicks(choices: CreationChoices, data: RulesData): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { effect, id } of tagAll(choices, data)) {
    const picks = choices.optionPicks[id];
    if (!picks?.length) continue;
    if (effect.type === 'option') {
      const kept = pickedOptions(effect, picks).map((o) => o.id);
      if (kept.length) out[id] = kept;
    } else if (effect.type === 'featChoice') {
      const feat = pickedFeat(choices, data);
      if (feat) out[id] = [feat];
    } else if (effect.type === 'cantripChoice' || effect.type === 'spellChoice') {
      out[id] = picks;
    }
  }
  return out;
}

function sameOptionPicks(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => b[k] !== undefined && sameList(a[k], b[k]));
}

/**
 * Drops the picks a change made invalid: a subrace or subclass of another race or
 * class, option picks (and their nested picks) no longer offered, the feat without
 * the variant human, skill picks no choice accepts and expertise in skills no longer
 * proficient. Returns `choices` itself when nothing changed. Spell picks outside
 * `optionPicks`, languages and tools are left to their steps.
 */
export function pruneChoices(choices: CreationChoices, data: RulesData): CreationChoices {
  let out = choices;
  const subrace = bySlug(data.subraces, out.subraceSlug);
  if (data.subraces && out.subraceSlug && subrace?.data.parent !== out.raceSlug) out = { ...out, subraceSlug: undefined };
  const subclass = bySlug(data.subclasses, out.subclassSlug);
  if (out.subclassSlug && subclass?.data.parent !== out.classSlug) out = { ...out, subclassSlug: '' };

  // Dropping a pick can remove the nested choices under it: repeat until stable.
  for (let i = 0; i < 10; i++) {
    const optionPicks = prunedOptionPicks(out, data);
    if (sameOptionPicks(optionPicks, out.optionPicks)) break;
    out = { ...out, optionPicks };
  }

  const { skills, expertise } = resolve(out, data);
  const skillPicks = out.skillPicks.filter((s, i) => skills.used.has(s) && out.skillPicks.indexOf(s) === i);
  if (!sameList(skillPicks, out.skillPicks)) out = { ...out, skillPicks };
  const expertisePicks = out.expertisePicks.filter((s, i) => expertise.used.has(s) && out.expertisePicks.indexOf(s) === i);
  if (!sameList(expertisePicks, out.expertisePicks)) out = { ...out, expertisePicks };
  return out;
}
