import { abilityModifier, ABILITY_KEYS, FIFTH_EDITION_SKILLS } from '@/utils/rules/fifthEdition';
import type {
  CompendiumRef,
  FifthEditionAttack,
  FifthEditionCharacterData,
  FifthEditionCustomSkill,
  FifthEditionInventoryItem,
  FifthEditionSavingThrows,
  FifthEditionSkills,
  FifthEditionSpell,
  FifthEditionSpellcasting,
  FifthEditionSpellSlots,
  FifthEditionStats,
} from '@/types/game-systems/fifthEdition';
import type { FeatureEntry } from '@/utils/featureEntries';
import { flattenProficiencyGroups } from '@/utils/proficiencies';
import { abilityPicksOf, collectEffects, pruneChoices, type ChoicePicks, type RulesData, type RulesEntry } from './collectEffects';
import type {
  ArmorData,
  BackgroundData,
  ClassData,
  FeatData,
  Named,
  RaceData,
  SpellData,
  SubclassData,
  SubraceData,
  WeaponData,
} from './compendiumData';
import { finalScores } from './abilities';
import { armorClass, maxHitPoints, proficiencyBonusFor, resolveSkills } from './derived';
import {
  attacksFor,
  cantripAttacks,
  normalizeName,
  proficienciesFor,
  resolveEquipment,
  type Attack,
  type InventoryItem,
  type Proficiencies,
} from './equipmentRules';
import {
  alwaysPreparedFor,
  availableSpells,
  castingAbilityAt3,
  expandedSpellsFor,
  spellcastingAt3,
} from './spellRules';
import { backgroundToolCategory } from './toolRules';
import { SKILL_KEYS, type AbilityKey, type CreationChoices, type Effect, type SkillKey } from './types';

/** A compendium entry as the creation reads it: a `CompendiumEntry` with typed `data`. */
export type CreationEntry<T> = RulesEntry<T> & { bookId: string; text?: string };

/** Every compendium entry the guided creation picks from, by type. */
export interface CreationData extends RulesData {
  races: CreationEntry<RaceData>[];
  subraces: CreationEntry<SubraceData>[];
  classes: CreationEntry<ClassData>[];
  subclasses: CreationEntry<SubclassData>[];
  backgrounds: CreationEntry<BackgroundData>[];
  feats: CreationEntry<FeatData>[];
  spells: CreationEntry<SpellData>[];
  weapons: CreationEntry<WeaponData>[];
  armor: CreationEntry<ArmorData>[];
  gear: CreationEntry<{ weight?: number }>[];
  tools: CreationEntry<{ weight?: number }>[];
  packs: CreationEntry<unknown>[];
}

const LEVEL = 3;
const PROFICIENCY = proficiencyBonusFor(LEVEL);
/** Experience points at the start of 3rd level. */
const XP_AT_3 = 900;
const THIEVES_TOOLS = 'ferramentas-de-ladrao';
/** Speed lost in armor whose Strength requirement the character does not meet. */
const HEAVY_ARMOR_PENALTY_METERS = 3;

const LONG: Record<AbilityKey, keyof FifthEditionStats> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

/**
 * The sheet labels speed and range in feet and weight in pounds; the books
 * give meters and kilograms (1,5 m per 5 ft, 0,5 kg per lb).
 */
const feet = (meters: number) => Math.round((meters / 1.5) * 5);
const pounds = (kg: number) => kg * 2;

/** What the proficiency boxes call armor kinds and weapon groups. */
const ARMOR_LABELS = { light: 'armaduras leves', medium: 'armaduras médias', heavy: 'armaduras pesadas', shield: 'escudos' };
const WEAPON_GROUP_LABELS: Record<string, string> = {
  simple: 'armas simples',
  martial: 'armas marciais',
  improvised: 'armas improvisadas',
  pactWeapon: 'arma do pacto',
};
const VERSATILE_LABEL = 'Duas mãos';

/** The feature a picked option belongs to, for its featuresAndTraits entry. */
const OPTION_LABELS: Record<string, string> = {
  ancestry: 'Ancestralidade Dracônica',
  fightingStyle: 'Estilo de Luta',
  invocations: 'Invocação Mística',
  pactBoon: 'Dádiva do Pacto',
  metamagic: 'Metamágica',
  favoredEnemy: 'Inimigo Favorito',
  totemSpirit: 'Espírito Totêmico',
  landTerrain: 'Círculo da Terra',
  maneuvers: 'Manobra',
  martialAdeptManeuvers: 'Manobra',
  elementalDiscipline: 'Disciplina Elemental',
  huntersPrey: 'Presa do Caçador',
  animalCompanion: 'Companheiro Animal',
  draconicAncestor: 'Ancestral Dracônico',
  resilientAbility: 'Resiliente',
  magicInitiateClass: 'Iniciado em Magia',
  spellSniperClass: 'Atirador de Magia',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const unique = <T>(list: T[]) => [...new Set(list)];
const box = (items: string[]) => capitalize(unique(items).join(', '));
const bySlug = <T>(list: T[], slug: string | undefined) =>
  slug ? list.find((e) => (e as { slug: string }).slug === slug) : undefined;
const refOf = (entry: { bookId: string; slug: string }): CompendiumRef => ({ bookId: entry.bookId, slug: entry.slug });
const of = <K extends Effect['type']>(effects: Effect[], type: K) =>
  effects.filter((e): e is Extract<Effect, { type: K }> => e.type === type);
const sumOf = (list: { amount: number }[]) => list.reduce((s, e) => s + e.amount, 0);
const isSkill = (s: string): s is SkillKey => (SKILL_KEYS as readonly string[]).includes(s);

/** Language lines that are the race's own pick ("Um idioma à sua escolha"): the picks replace them. */
const isLanguagePick = (line: string) => normalizeName(line).includes('escolha');

/**
 * The 3rd-level 5e sheet the creation choices give. Choices are pruned first,
 * so a stale pick is dropped rather than written. Throws when the class is not
 * in `data`.
 */
export function buildSheet(input: CreationChoices, data: CreationData): FifthEditionCharacterData {
  const choices = pruneChoices(input, data);
  const cls = bySlug(data.classes, choices.classSlug);
  if (!cls) throw new Error(`Unknown class: ${choices.classSlug}`);
  const race = bySlug(data.races, choices.raceSlug);
  const subraceEntry = bySlug(data.subraces, choices.subraceSlug);
  const subrace = race && subraceEntry?.data.parent === race.slug ? subraceEntry : undefined;
  const subclassEntry = bySlug(data.subclasses, choices.subclassSlug);
  const subclass = subclassEntry?.data.parent === cls.slug ? subclassEntry : undefined;
  const background = bySlug(data.backgrounds, choices.backgroundSlug);

  const { effects, picks } = collectEffects(choices, data);
  const scores = finalScores(choices.baseScores, effects, abilityPicksOf(choices));
  const mod = (k: AbilityKey) => abilityModifier(scores[k]);

  const stats = Object.fromEntries(
    ABILITY_KEYS.map((k) => [LONG[k], { score: scores[k], modifier: mod(k) }]),
  ) as unknown as FifthEditionStats;

  const saves = new Set(of(effects, 'save').map((e) => e.ability));
  const savingThrows = Object.fromEntries(
    ABILITY_KEYS.map((k) => [LONG[k], { proficient: saves.has(k), bonus: mod(k) + (saves.has(k) ? PROFICIENCY : 0) }]),
  ) as unknown as FifthEditionSavingThrows;

  // Jack of All Trades: half the proficiency bonus on checks without proficiency.
  const jack = of(effects, 'jackOfAllTrades').length ? Math.floor(PROFICIENCY / 2) : 0;
  const resolved = resolveSkills(
    of(effects, 'skill').map((e) => e.skill),
    choices.skillPicks,
    [],
    [...of(effects, 'expertise').map((e) => e.skill), ...choices.expertisePicks.filter(isSkill)],
  );
  const skills = Object.fromEntries(
    FIFTH_EDITION_SKILLS.map(({ key, ability }) => {
      const proficient = resolved.proficient.includes(key as SkillKey);
      const expertise = resolved.expertise.includes(key as SkillKey);
      const other = proficient ? 0 : jack;
      const bonus = mod(ability) + (proficient ? PROFICIENCY * (expertise ? 2 : 1) : 0) + other;
      return [key, { proficient, expertise, bonus, ...(other ? { otherBonus: other } : {}) }];
    }),
  ) as unknown as FifthEditionSkills;

  const raceLines = [...(race?.data.proficiencies ?? []), ...(subrace?.data.proficiencies ?? [])];
  const proficiencies = proficienciesFor(cls.slug, cls.data, effects, raceLines, data.weapons);
  const equipment = resolveEquipment(
    cls.data,
    background?.data,
    choices.equipmentPicks,
    choices.anyOfPicks,
    data,
    proficiencies,
  );
  // Body armor is worn only when it beats going without (Unarmored Defense, Armor of Shadows).
  const acWith = armorClass(equipment.armor?.data, equipment.shield, scores, effects);
  const acWithout = armorClass(undefined, equipment.shield, scores, effects);
  const worn = equipment.armor && acWith >= acWithout ? equipment.armor : undefined;
  const armored = !!worn || equipment.shield;

  // The race's speed plus the speed effects. Not a subrace's own speed: the wood
  // elf's already holds its bonus, which is also an effect. Worn armor whose
  // Strength requirement is above the character's STR costs 3 m, except to dwarves.
  const tooHeavy =
    !!worn?.data.strength && scores.str < worn.data.strength && !of(effects, 'ignoreArmorStrength').length;
  const speedMeters = of(effects, 'speed')
    .filter((e) => !(e.noArmor && armored))
    .reduce((m, e) => m + e.meters, (race?.data.speed ?? 9) - (tooHeavy ? HEAVY_ARMOR_PENALTY_METERS : 0));

  const hitDie = cls.data.hitDie;
  const maxHp = maxHitPoints(hitDie, LEVEL, mod('con'), sumOf(of(effects, 'hpPerLevel')));
  const initiativeBonus = sumOf(of(effects, 'initiative')) + jack;
  const passivePerceptionBonus = sumOf(of(effects, 'passivePerception'));

  const spells = spellcastingFor(choices, data, cls, subclass, scores, effects, picks);
  const attacks = [
    ...attacksFor(equipment.weapons, scores, proficiencies.weapons, effects),
    ...cantripAttacks(spells?.attackCantrips ?? [], scores, effects),
  ].map((a) => sheetAttack(a, data));

  const tools = toolProficiencies(cls.data, background?.data, raceLines, effects, data);
  const thieves = data.tools.find((t) => t.slug === THIEVES_TOOLS);
  const thievesExpertise = choices.expertisePicks.includes(THIEVES_TOOLS);
  const customSkills: FifthEditionCustomSkill[] =
    thieves && (tools.slugs.includes(THIEVES_TOOLS) || thievesExpertise)
      ? [{ name: thieves.name, ability: 'dexterity', proficient: true, expertise: thievesExpertise }]
      : [];

  const languages = unique([
    ...[...(race?.data.languages ?? []), ...(subrace?.data.languages ?? [])].filter((l) => !isLanguagePick(l)),
    ...of(effects, 'language').map((e) => e.language),
  ]);
  const boxes = {
    armor: box(proficiencies.armor.map((k) => ARMOR_LABELS[k])),
    weapons: box(weaponLabels(proficiencies, data)),
    tools: box(tools.names),
    languages: box(languages),
  };

  const { details } = choices;
  const sheet: FifthEditionCharacterData = {
    characterName: details.name,
    class: cls.name,
    level: LEVEL,
    race: raceName(race, subrace) ?? choices.raceSlug,
    background: background?.name ?? '',
    ...(details.alignment ? { alignment: details.alignment } : {}),
    experiencePoints: XP_AT_3,
    proficiencyBonus: PROFICIENCY,
    stats,
    savingThrows,
    skills,
    ...(customSkills.length ? { customSkills } : {}),
    passivePerception: 10 + skills.perception.bonus + passivePerceptionBonus,
    ...(passivePerceptionBonus ? { passivePerceptionBonus } : {}),
    armorClass: Math.max(acWith, acWithout),
    initiative: mod('dex') + initiativeBonus,
    initiativeBonus,
    speed: feet(speedMeters),
    hp: { maximum: maxHp, current: maxHp, temporary: 0 },
    hitDice: [{ class: cls.name, die: `d${hitDie}`, maximum: LEVEL, remaining: LEVEL }],
    deathSaves: { successes: 0, failures: 0 },
    attacks,
    currency: { cp: 0, sp: 0, ep: 0, gp: equipment.gp, pp: 0 },
    inventory: equipment.inventory.map((item) => sheetItem(item, worn?.slug, data)),
    proficiencies: boxes,
    proficienciesAndLanguages: flattenProficiencyGroups(boxes),
    featuresAndTraits: features(race, subrace, cls, subclass, background, picks, data),
    ...(spells ? { spellcasting: spells.sheet } : {}),
    origin: {
      ...(race ? { race: refOf(race) } : {}),
      ...(subrace ? { subrace: refOf(subrace) } : {}),
      class: refOf(cls),
      ...(subclass ? { subclass: refOf(subclass) } : {}),
      ...(background ? { background: refOf(background) } : {}),
    },
    ...appearanceOf(details.appearance),
    ...(details.personality ? { personality: details.personality } : {}),
    ...(details.backstory ? { backstory: details.backstory } : {}),
  };
  return sheet;
}

function weaponLabels(proficiencies: Proficiencies, data: CreationData): string[] {
  return proficiencies.weapons.map(
    (w) => WEAPON_GROUP_LABELS[w] ?? data.weapons.find((x) => x.slug === w)?.name ?? capitalize(w.replace(/-/g, ' ')),
  );
}

/** The subrace's name when it holds the race's ("Elfo da Floresta"), else "Halfling (Pés-Leves)". */
function raceName(race: CreationEntry<RaceData> | undefined, subrace: CreationEntry<SubraceData> | undefined) {
  if (!race || !subrace) return race?.name;
  return normalizeName(subrace.name).includes(normalizeName(race.name)) ? subrace.name : `${race.name} (${subrace.name})`;
}

/**
 * Tool proficiencies: fixed and picked ones as tool slugs, and the prose lines
 * of the class, background and race that name no single tool ("Três
 * instrumentos à escolha", "Veículos (terrestres)"), kept as written. A
 * background line that is a pick is left out: its pick is a tool effect.
 */
function toolProficiencies(
  classData: ClassData,
  backgroundData: BackgroundData | undefined,
  raceLines: string[],
  effects: Effect[],
  data: CreationData,
): { slugs: string[]; names: string[] } {
  const slugs: string[] = [];
  const prose: string[] = [];
  const read = (line: string) => {
    const tool = data.tools.find((t) => normalizeName(t.name) === normalizeName(line));
    if (tool) slugs.push(tool.slug);
    else prose.push(line);
  };
  classData.proficiencies.tools.forEach(read);
  (backgroundData?.proficiencies.tools ?? []).filter((l) => !backgroundToolCategory(l)).forEach(read);
  const weaponNames = new Set(data.weapons.map((w) => normalizeName(w.name)));
  raceLines
    .filter((l) => !isSkill(l) && !weaponNames.has(normalizeName(l)) && !normalizeName(l).includes('armadura'))
    .forEach(read);
  slugs.push(...of(effects, 'tool').map((e) => e.tool));
  const owned = unique(slugs);
  const names = owned.map((s) => data.tools.find((t) => t.slug === s)?.name ?? s);
  return { slugs: owned, names: [...names, ...prose] };
}

function sheetAttack(a: Attack, data: CreationData): FifthEditionAttack {
  const list: Array<{ bookId: string; slug: string }> = a.source === 'cantrip' ? data.spells : data.weapons;
  const entry = a.slug ? list.find((e) => e.slug === a.slug) : undefined;
  return {
    name: a.name,
    attackBonus: a.attackBonus,
    damageRoll: a.damageRoll,
    ...(a.damageType ? { damageType: a.damageType } : {}),
    ...(a.range !== undefined ? { range: feet(a.range) } : {}),
    ...(a.properties.length ? { properties: a.properties } : {}),
    ...(a.versatileDamageRoll
      ? {
          additionalDamage: [
            { label: VERSATILE_LABEL, damageRoll: a.versatileDamageRoll, ...(a.damageType ? { damageType: a.damageType } : {}) },
          ],
        }
      : {}),
    ...(entry ? { compendiumRef: refOf(entry) } : {}),
  };
}

function sheetItem(
  item: InventoryItem,
  wornArmor: string | undefined,
  data: CreationData,
): FifthEditionInventoryItem {
  const lists: Record<InventoryItem['type'], Array<{ bookId: string; slug: string }>> = {
    weapon: data.weapons,
    armor: data.armor,
    gear: data.gear,
    tool: data.tools,
    pack: data.packs,
  };
  const entry = lists[item.type].find((e) => e.slug === item.slug);
  const equipped =
    item.type === 'armor' &&
    (item.slug === wornArmor || data.armor.find((a) => a.slug === item.slug)?.data.category === 'shield');
  return {
    name: item.name,
    quantity: item.quantity,
    ...(item.weight !== undefined ? { weight: pounds(item.weight) } : {}),
    ...(item.type === 'armor' || item.type === 'weapon' ? { equippable: true, equipped } : {}),
    ...(entry ? { compendiumRef: refOf(entry) } : {}),
  };
}

/**
 * Race and subrace traits, class and subclass features up to 3rd level, the
 * background's feature, the picked feat and the picked options. Descriptions
 * come from the compendium entries; options have none of their own.
 */
function features(
  race: CreationEntry<RaceData> | undefined,
  subrace: CreationEntry<SubraceData> | undefined,
  cls: CreationEntry<ClassData>,
  subclass: CreationEntry<SubclassData> | undefined,
  background: CreationEntry<BackgroundData> | undefined,
  picks: ChoicePicks[],
  data: CreationData,
): FeatureEntry[] {
  const named = (n: Named): FeatureEntry => ({ name: n.name, description: n.description });
  const out: FeatureEntry[] = [
    ...(race?.data.traits ?? []).map(named),
    ...(subrace?.data.traits ?? []).map(named),
    ...cls.data.features.filter((f) => f.level <= LEVEL).map(named),
    ...(subclass?.data.features ?? []).filter((f) => f.level <= LEVEL).map(named),
    ...(background ? [named(background.data.feature)] : []),
  ];
  for (const { effect, picks: ids } of picks) {
    if (effect.type === 'featChoice') {
      const feat = data.feats.find((f) => f.slug === ids[0]);
      if (feat) out.push({ name: feat.name, description: feat.text ?? '' });
    }
    if (effect.type === 'option') {
      for (const id of ids) {
        const option = effect.options.find((o) => o.id === id);
        if (!option) continue;
        const label = OPTION_LABELS[effect.id];
        out.push({ name: label ? `${label}: ${option.name}` : option.name, description: '' });
      }
    }
  }
  return out;
}

function appearanceOf(appearance: Record<string, string> | undefined): Pick<FifthEditionCharacterData, 'appearance'> {
  const keys = ['age', 'height', 'weight', 'eyes', 'skin', 'hair'] as const;
  const out = Object.fromEntries(keys.filter((k) => appearance?.[k]).map((k) => [k, appearance![k]]));
  return Object.keys(out).length ? { appearance: out } : {};
}

/**
 * The spellcasting block: the class's cantrips and spells (the subclass's for
 * Eldritch Knight and Arcane Trickster) limited to what 3rd level allows, the
 * always-prepared ones, and those race, feat and option choices give. Known
 * spells and a cleric's, druid's or paladin's picks are prepared; a wizard's
 * spellbook has its first `prepared` picks prepared. Null when there is
 * nothing to cast.
 */
function spellcastingFor(
  choices: CreationChoices,
  data: CreationData,
  cls: CreationEntry<ClassData>,
  subclass: CreationEntry<SubclassData> | undefined,
  scores: Record<AbilityKey, number>,
  effects: Effect[],
  picks: ChoicePicks[],
): { sheet: FifthEditionSpellcasting; attackCantrips: { spell: RulesEntry<SpellData>; ability: AbilityKey }[] } | null {
  const spellOf = (slug: string) => data.spells.find((s) => s.slug === slug);
  const cantrips = new Map<string, AbilityKey>();
  const prepared = new Map<string, boolean>();
  const prepare = (slug: string, value: boolean) => {
    if (spellOf(slug)) prepared.set(slug, value || (prepared.get(slug) ?? false));
  };
  const onList = (list: string, maxLevel: number) => new Set(availableSpells(data.spells, list, maxLevel).map((s) => s.slug));

  const ability = castingAbilityAt3(cls.slug, subclass?.slug, cls.data);
  const casting = ability
    ? spellcastingAt3(cls.slug, subclass?.slug, cls.data, abilityModifier(scores[ability]))
    : null;
  if (ability && casting) {
    const fixed = (casting.fixedCantrips ?? []).filter((s) => spellOf(s));
    const listCantrips = onList(casting.list, 0);
    const pickedCantrips = unique(choices.cantripSlugs)
      .filter((s) => listCantrips.has(s) && !fixed.includes(s) && spellOf(s)?.data.level === 0)
      .slice(0, Math.max(0, casting.cantrips - fixed.length));
    for (const slug of [...fixed, ...pickedCantrips]) cantrips.set(slug, ability);

    const extra = subclass ? expandedSpellsFor(subclass.data, casting.maxLevel) : [];
    const pool = new Set(
      availableSpells(data.spells, casting.list, casting.maxLevel, undefined, extra)
        .filter((s) => s.data.level > 0)
        .map((s) => s.slug),
    );
    // Picks in order until the limit; an off-school pick is kept only while free picks remain.
    const limit = casting.known ?? casting.spellbook ?? casting.prepared ?? 0;
    let freeSchoolPicks = casting.freeSchoolPicks ?? 0;
    const picked: string[] = [];
    for (const slug of unique(choices.spellSlugs)) {
      if (picked.length >= limit) break;
      if (!pool.has(slug)) continue;
      const inSchool = !casting.schools || casting.schools.includes(spellOf(slug)!.data.school);
      if (!inSchool) {
        if (freeSchoolPicks <= 0) continue;
        freeSchoolPicks -= 1;
      }
      picked.push(slug);
    }
    const preparedCount = casting.spellbook !== undefined ? (casting.prepared ?? 0) : picked.length;
    picked.forEach((slug, i) => prepare(slug, i < preparedCount));
    if (subclass) for (const slug of alwaysPreparedFor(subclass.data, choices.optionPicks, casting.maxLevel)) prepare(slug, true);
  }

  // Race, feat and option choices: cantrips with their own ability, spells always ready.
  let optionAbility: AbilityKey | undefined;
  for (const { effect, picks: slugs } of picks) {
    if (effect.type === 'cantripChoice') {
      const valid = onList(effect.list, 0);
      for (const slug of slugs.filter((s) => valid.has(s) && spellOf(s)?.data.level === 0)) {
        if (!cantrips.has(slug)) cantrips.set(slug, effect.ability);
        optionAbility ??= effect.ability;
      }
    }
    if (effect.type === 'spellChoice') {
      const valid = onList(effect.list, effect.level);
      for (const slug of slugs.filter((s) => valid.has(s) && spellOf(s)?.data.level === effect.level)) prepare(slug, true);
    }
  }
  for (const e of of(effects, 'alwaysPrepared')) e.slugs.forEach((slug) => prepare(slug, true));

  if (!casting && cantrips.size === 0 && prepared.size === 0) return null;

  const cantripEntries = [...cantrips.keys()].map((slug) => spellOf(slug)!);
  const spells: FifthEditionSpell[] = [...prepared.entries()]
    .map(([slug, isPrepared]) => {
      const s = spellOf(slug)!;
      return {
        level: s.data.level,
        name: s.name,
        prepared: isPrepared,
        ritual: s.data.ritual,
        concentration: s.data.concentration,
        compendiumRef: refOf(s),
      };
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const sheetAbility = ability ?? optionAbility;
  const abilityMod = sheetAbility ? abilityModifier(scores[sheetAbility]) : 0;
  const sheet: FifthEditionSpellcasting = {
    ...(ability ? { class: cls.name } : {}),
    ...(sheetAbility
      ? {
          ability: LONG[sheetAbility],
          spellSaveDC: 8 + PROFICIENCY + abilityMod,
          spellAttackBonus: PROFICIENCY + abilityMod,
        }
      : {}),
    cantrips: cantripEntries.map((s) => s.name),
    cantripRefs: cantripEntries.map((s) => ({ name: s.name, compendiumRef: refOf(s) })),
    ...(casting ? { slots: slotsOf(casting.slots) } : {}),
    spells,
  };
  return {
    sheet,
    attackCantrips: cantripEntries.map((spell) => ({ spell, ability: cantrips.get(spell.slug)! })),
  };
}

/** Slots by spell level; the warlock's pact slots are already in `slots`. */
function slotsOf(slots: number[]): FifthEditionSpellSlots {
  return Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [String(i + 1), { total: slots[i] ?? 0, expended: 0 }]),
  ) as unknown as FifthEditionSpellSlots;
}
