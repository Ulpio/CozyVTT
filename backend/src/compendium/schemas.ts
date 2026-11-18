/**
 * What each type of compendium entry holds in `data`, and the checks a data
 * file must pass before it is imported (docs/superpowers/specs/
 * 2026-11-14-p2-compendio-5e-design.md, "O que cada tipo guarda em data").
 *
 * The schemas give the shape; the checks after them catch what a shape
 * cannot: dice written wrong, a damage type that does not exist, an armour
 * class no armour has, a spell naming a class the compendium lacks, the same
 * slug twice. Every message names the value at fault, so a curator can find it.
 */

import { z } from 'zod';
import { NpcStatBlockSchema } from '../validators/statBlock';
import { COMPENDIUM_TYPES, isCompendiumType, type CompendiumType, type Issue, type RawEntry, type RawMonster } from './types';

/** The six abilities, by the keys the 5e sheet and stat blocks use. */
const Ability = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);

/** The damage types of D&D 5e, as the Portuguese books name them. */
export const DAMAGE_TYPES = [
  'ácido',
  'concussão',
  'cortante',
  'elétrico',
  'energia',
  'fogo',
  'frio',
  'necrótico',
  'perfurante',
  'psíquico',
  'radiante',
  'trovejante',
  'veneno',
] as const;

/** Dice such as 1d8, 2d6+3 or 1d4 + 1. */
const DICE = /^\d+d\d+( ?[+-] ?\d+)?$/;
// Healing and its per-slot step may also be a plain whole number (Heal: 70, +10 per slot).
const FLAT = /^\d+$/;
const FLAT_PATHS = new Set(['mechanics.healing', 'mechanics.scaling.perSlot']);

/** The challenge ratings a monster can have. */
const CHALLENGE_RATINGS = new Set(['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))]);

const Damage = z.object({ dice: z.string(), type: z.string() });
const Named = z.object({ name: z.string().min(1), description: z.string() });
/** Spell slugs by spell level 1 to 5, for the spells a subclass always has prepared. */
const SpellsBySpellLevel = z.partialRecord(z.enum(['1', '2', '3', '4', '5']), z.array(z.string().min(1)));

/** A value by class level: the entry with the highest key at or below the level applies. */
const ByLevel = <T extends z.ZodType>(value: T) => z.record(z.string().regex(/^\d+$/, 'a level such as "3"'), value);

const Recovery = z.enum(['short', 'long']);

/**
 * What a class feature does on the action bar. `kind` says how it is used;
 * the other fields are the numbers that kind reads. `resources` declares a
 * pool of uses (per character, shared by every feature that spends its key);
 * `spends` takes from one.
 */
export const FeatureActionSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'a slug'),
    kind: z.enum(['addDamage', 'state', 'heal', 'extraAction', 'makeBonus', 'attacks', 'passive', 'use', 'none']),
    cost: z.enum(['action', 'bonus', 'reaction', 'none', 'attack']).optional(),
    // The button's name when it is not the feature's (a use of a feature named for its pool).
    label: z.string().min(1).max(60).optional(),
    // Why a feature has no button (kind none): what the table decides instead.
    reason: z.string().min(1).optional(),
    resources: z
      .array(
        z.object({
          key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'a slug'),
          max: z.union([
            z.number().int().min(0),
            z.enum(['classLevel', 'proficiency']),
            z.strictObject({ ability: Ability, min: z.number().int().min(0).optional() }),
            z.strictObject({ perLevel: z.number().int().min(1) }),
            ByLevel(z.number().int().min(0)),
          ]),
          recovers: z.union([Recovery, ByLevel(Recovery)]),
        })
      )
      .optional(),
    spends: z.object({ key: z.string().min(1), amount: z.number().int().min(1).optional(), chosen: z.literal(true).optional() }).optional(),
    dice: ByLevel(z.string().regex(DICE, 'dice such as 1d8')).optional(),
    addAbility: z.union([Ability, z.literal('best-str-dex')]).optional(),
    addClassLevel: z.literal(true).optional(),
    oncePerTurn: z.literal(true).optional(),
    filter: z
      .object({
        melee: z.literal(true).optional(),
        ranged: z.literal(true).optional(),
        finesseOrRanged: z.literal(true).optional(),
        strength: z.literal(true).optional(),
      })
      .optional(),
    slot: z.object({ base: z.string().regex(DICE), perSlot: z.string().regex(DICE), maxDice: z.number().int().min(1) }).optional(),
    damageBonus: ByLevel(z.number().int()).optional(),
    stateName: z.string().min(1).optional(),
    attacks: z
      .object({
        count: z.number().int().min(1),
        unarmedDice: ByLevel(z.string().regex(DICE)),
        requiresAttackAction: z.literal(true).optional(),
      })
      .optional(),
    makeBonus: z.array(z.enum(['dash', 'disengage', 'hide'])).optional(),
    passive: z.object({ extraAttacks: z.number().int().min(1).optional(), critMin: z.number().int().min(2).max(20).optional() }).optional(),
  })
  .refine((action) => action.kind !== 'none' || action.reason !== undefined, {
    message: 'a feature of kind none needs a reason',
    path: ['reason'],
  });

export type FeatureAction = z.infer<typeof FeatureActionSchema>;

// Feature mechanics are free-form, except the subclass spell lists, which the
// character wizard reads (by spell level, or, for the Circle of the Land, by
// terrain and then spell level), and `action`, which the action bar reads.
const Feature = Named.extend({ level: z.number().int().min(1).max(20), mechanics: z.unknown().optional() }).superRefine(
  (feature, ctx) => {
    const mechanics = feature.mechanics;
    if (!mechanics || typeof mechanics !== 'object') return;
    const { spellsBySpellLevel, spellsByTerrain, action } = mechanics as Record<string, unknown>;
    const complain = (path: (string | number)[], error: z.ZodError) => {
      for (const issue of error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: ['mechanics', ...path, ...issue.path.map(String)] });
    };
    if (spellsBySpellLevel !== undefined) {
      const parsed = SpellsBySpellLevel.safeParse(spellsBySpellLevel);
      if (!parsed.success) complain(['spellsBySpellLevel'], parsed.error);
    }
    if (spellsByTerrain !== undefined) {
      const parsed = z.record(z.string().min(1), SpellsBySpellLevel).safeParse(spellsByTerrain);
      if (!parsed.success) complain(['spellsByTerrain'], parsed.error);
    }
    if (action !== undefined) {
      const parsed = FeatureActionSchema.safeParse(action);
      if (!parsed.success) complain(['action'], parsed.error);
    }
  }
);

const ITEM_TYPES = ['weapon', 'armor', 'gear', 'tool', 'pack'] as const;

/** One thing a character starts with: a compendium item, or any item of a kind to pick. */
const EquipmentItem = z
  .object({
    ref: z.object({ type: z.enum(ITEM_TYPES), slug: z.string().min(1) }).optional(),
    anyOf: z
      .enum(['simpleWeapon', 'martialWeapon', 'simpleMeleeWeapon', 'martialMeleeWeapon', 'instrument', 'artisanTool', 'gamingSet'])
      .optional(),
    quantity: z.number().int().min(1),
  })
  .refine((item) => (item.ref === undefined) !== (item.anyOf === undefined), {
    message: 'an item needs exactly one of ref and anyOf',
  });

const EquipmentBundle = z.object({ items: z.array(EquipmentItem), gp: z.number().int().min(0).optional() });
/** One "(a) ... or (b) ..." choice; a single option is fixed equipment. */
const EquipmentChoice = z.object({ options: z.array(EquipmentBundle).min(1) });

const SpellMechanics = z.object({
  attack: z.enum(['melee', 'ranged']).optional(),
  save: Ability.optional(),
  damage: z.array(Damage).default([]),
  healing: z.string().optional(),
  // Whether the healing adds the caster's spellcasting modifier (Cure Wounds, Healing Word).
  healingAddsModifier: z.boolean().optional(),
  halfOnSave: z.boolean().optional(),
  targets: z.number().int().min(1).optional(),
  // Extra targets per slot level above the spell's own (Hold Person).
  targetsPerSlot: z.number().int().min(1).optional(),
  // One attack (or dart) per ray; cantripLevels is Eldritch Blast's 1/2/3/4.
  rays: z
    .object({
      count: z.number().int().min(1),
      perSlot: z.number().int().min(1).optional(),
      cantripLevels: z.boolean().optional(),
    })
    .optional(),
  // No attack roll (Magic Missile).
  autoHit: z.boolean().optional(),
  // The caster heals for half the damage dealt (Vampiric Touch).
  selfHeal: z.literal('half-damage').optional(),
  // Width is the line's width text ("1,5 m").
  area: z.object({ shape: z.string(), size: z.string(), width: z.string().optional() }).optional(),
  // Why the spell stays "conjurar"; the catalogue treats it as 'cast'.
  castOnly: z.string().optional(),
  // Dice added per slot level above the spell's own, or, for a cantrip,
  // whether it grows at character levels 5, 11 and 17.
  scaling: z.object({ perSlot: z.string().optional(), cantrip: z.boolean().optional() }).optional(),
});

const Spell = z.object({
    level: z.number().int().min(0).max(9),
    school: z.string().min(1),
    castingTime: z.string().min(1),
    range: z.string().min(1),
    components: z.object({ v: z.boolean(), s: z.boolean(), m: z.boolean(), material: z.string().optional() }),
    duration: z.string().min(1),
    concentration: z.boolean(),
    ritual: z.boolean(),
    classes: z.array(z.string()).default([]),
    higherLevels: z.string().optional(),
    mechanics: SpellMechanics.optional(),
});

const RaceFields = {
  abilityIncreases: z.partialRecord(Ability, z.number().int()).optional(),
  size: z.string().optional(),
  speed: z.number().optional(),
  languages: z.array(z.string()).optional(),
  proficiencies: z.array(z.string()).optional(),
  darkvision: z.number().optional(),
  traits: z.array(Named).default([]),
};

const Race = z.object({ ...RaceFields, size: z.string().min(1), speed: z.number() });
const Subrace = z.object({ ...RaceFields, parent: z.string().min(1) });

const Class = z.object({
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  savingThrows: z.array(Ability).length(2),
  proficiencies: z.object({ armor: z.array(z.string()), weapons: z.array(z.string()), tools: z.array(z.string()) }),
  skills: z.object({ choose: z.number().int().min(0), from: z.array(z.string()) }),
  startingEquipment: z.array(z.string()),
  startingEquipmentChoices: z.array(EquipmentChoice).optional(),
  spellcasting: z
    .object({
      ability: Ability,
      // slots[characterLevel - 1][spellLevel - 1]
      slots: z.array(z.array(z.number().int().min(0))).optional(),
      cantripsKnown: z.array(z.number().int().min(0)).optional(),
      spellsKnown: z.array(z.number().int().min(0)).optional(),
    })
    .optional(),
  subclassLevel: z.number().int().min(1).max(20),
  features: z.array(Feature),
});

const Subclass = z.object({ parent: z.string().min(1), features: z.array(Feature) });

const Background = z.object({
  proficiencies: z.object({ skills: z.array(z.string()), tools: z.array(z.string()) }),
  languages: z.union([z.number().int(), z.array(z.string())]).optional(),
  equipment: z.array(z.string()),
  startingEquipmentChoices: z.array(EquipmentChoice).optional(),
  personality: z
    .object({ traits: z.array(z.string()), ideals: z.array(z.string()), bonds: z.array(z.string()), flaws: z.array(z.string()) })
    .optional(),
  feature: Named,
});

const Feat = z.object({
  prerequisite: z.string().optional(),
  effects: z
    .object({
      abilityIncrease: z.partialRecord(Ability, z.number().int()).optional(),
      proficiencies: z.array(z.string()).optional(),
    })
    .optional(),
});

const Weapon = z.object({
  category: z.enum(['simple', 'martial']),
  range: z.enum(['melee', 'ranged']),
  damage: Damage,
  properties: z.array(z.string()),
  versatile: z.string().optional(),
  normalRange: z.number().optional(),
  longRange: z.number().optional(),
  cost: z.string(),
  weight: z.number(),
});

const Armor = z.object({
  category: z.enum(['light', 'medium', 'heavy', 'shield']),
  baseAc: z.number().int(),
  addDex: z.boolean(),
  maxDex: z.number().int().optional(),
  strength: z.number().int().optional(),
  stealthDisadvantage: z.boolean(),
  cost: z.string(),
  weight: z.number(),
});

const Gear = z.object({ cost: z.string().optional(), weight: z.number().optional() });
const Pack = z.object({ cost: z.string(), contents: z.array(z.string()) });

const MagicItem = z.object({
  category: z.string().min(1),
  rarity: z.string().min(1),
  attunement: z.boolean(),
  attunementBy: z.string().optional(),
  bonus: z
    .object({ attack: z.number().int().optional(), damage: z.number().int().optional(), ac: z.number().int().optional() })
    .optional(),
  effect: z.object({ healing: z.string().optional() }).optional(),
});

export const entryDataSchemas: Record<CompendiumType, z.ZodType> = {
  spell: Spell,
  race: Race,
  subrace: Subrace,
  class: Class,
  subclass: Subclass,
  background: Background,
  feat: Feat,
  weapon: Weapon,
  armor: Armor,
  gear: Gear,
  tool: Gear,
  pack: Pack,
  magicItem: MagicItem,
  condition: z.object({}),
};

// ----------------------------------------------------------------------------

type Data = Record<string, unknown>;
const asData = (value: unknown): Data => (value && typeof value === 'object' ? (value as Data) : {});

/** Every dice expression and damage type the entry carries, with where it is. */
function diceAndDamage(entry: RawEntry): { dice: [string, string][]; damageTypes: [string, string][] } {
  const data = asData(entry.data);
  const dice: [string, string][] = [];
  const damageTypes: [string, string][] = [];
  const damages = (list: unknown, where: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((d, i) => {
      const { dice: roll, type } = asData(d);
      if (typeof roll === 'string') dice.push([`${where}[${i}].dice`, roll]);
      if (typeof type === 'string') damageTypes.push([`${where}[${i}].type`, type]);
    });
  };
  if (entry.type === 'spell') {
    const mechanics = asData(data.mechanics);
    damages(mechanics.damage, 'mechanics.damage');
    if (typeof mechanics.healing === 'string') dice.push(['mechanics.healing', mechanics.healing]);
    const scaling = asData(mechanics.scaling);
    if (typeof scaling.perSlot === 'string') dice.push(['mechanics.scaling.perSlot', scaling.perSlot]);
  }
  if (entry.type === 'weapon') {
    damages([data.damage], 'damage');
    if (typeof data.versatile === 'string') dice.push(['versatile', data.versatile]);
  }
  if (entry.type === 'magicItem') {
    const healing = asData(data.effect).healing;
    if (typeof healing === 'string') dice.push(['effect.healing', healing]);
  }
  return { dice, damageTypes };
}

/** Every compendium entry ("type:slug") a class, background or subclass points at, with where. */
function references(entry: RawEntry): [string, string][] {
  const data = asData(entry.data);
  const out: [string, string][] = [];
  if (entry.type === 'class' || entry.type === 'background') {
    const choices = Array.isArray(data.startingEquipmentChoices) ? data.startingEquipmentChoices : [];
    choices.forEach((choice, c) => {
      const options = asData(choice).options;
      (Array.isArray(options) ? options : []).forEach((option, o) => {
        const items = asData(option).items;
        (Array.isArray(items) ? items : []).forEach((item, i) => {
          const ref = asData(asData(item).ref);
          if (typeof ref.type === 'string' && typeof ref.slug === 'string') {
            out.push([`startingEquipmentChoices[${c}].options[${o}].items[${i}].ref`, `${ref.type}:${ref.slug}`]);
          }
        });
      });
    });
  }
  if (entry.type === 'subclass') {
    const features = Array.isArray(data.features) ? data.features : [];
    features.forEach((feature, f) => {
      const mechanics = asData(asData(feature).mechanics);
      const lists = (value: unknown, where: string) => {
        for (const [level, slugs] of Object.entries(asData(value))) {
          if (Array.isArray(slugs)) for (const slug of slugs) out.push([`features[${f}].mechanics.${where}.${level}`, `spell:${String(slug)}`]);
        }
      };
      lists(mechanics.spellsBySpellLevel, 'spellsBySpellLevel');
      for (const [terrain, byLevel] of Object.entries(asData(mechanics.spellsByTerrain))) lists(byLevel, `spellsByTerrain.${terrain}`);
    });
  }
  return out;
}

/**
 * The problems with these entries; none means they may be imported. When
 * `known.slugs` ("type:slug" of every entry there is) is given, the items a
 * class or background starts with and the spells a subclass always has
 * prepared must exist.
 */
export function validateEntries(entries: RawEntry[], known: { classSlugs: Set<string>; slugs?: Set<string> }): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const where = `${entry.type ?? '?'}:${entry.slug ?? '?'}`;
    const add = (message: string) => issues.push({ where, message });

    if (!isCompendiumType(entry.type)) {
      add(`unknown type "${String(entry.type)}" (expected one of ${COMPENDIUM_TYPES.join(', ')})`);
      continue;
    }
    if (!entry.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.slug)) add(`slug "${entry.slug}" is not a slug`);
    if (!entry.name?.trim()) add('has no name');
    if (typeof entry.text !== 'string') add('has no text');

    const key = `${entry.type}:${entry.slug}`;
    if (seen.has(key)) add(`slug "${entry.slug}" appears twice for ${entry.type}`);
    seen.add(key);

    const parsed = entryDataSchemas[entry.type].safeParse(entry.data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) add(`data.${issue.path.join('.')}: ${issue.message}`);
      continue;
    }

    const { dice, damageTypes } = diceAndDamage(entry);
    for (const [path, roll] of dice) if (!DICE.test(roll) && !(FLAT_PATHS.has(path) && FLAT.test(roll))) add(`${path}: "${roll}" is not dice such as 1d8 or 2d6+3`);
    for (const [path, type] of damageTypes) {
      if (!(DAMAGE_TYPES as readonly string[]).includes(type)) add(`${path}: unknown damage type "${type}"`);
    }

    const data = asData(entry.data);
    if (entry.type === 'armor') {
      const ac = Number(data.baseAc);
      const [min, max] = data.category === 'shield' ? [1, 5] : [5, 30];
      if (ac < min || ac > max) add(`baseAc ${ac} is outside ${min}–${max}`);
    }
    if (known.slugs) {
      for (const [path, ref] of references(entry)) {
        if (!known.slugs.has(ref)) add(`${path}: "${ref.slice(ref.indexOf(':') + 1)}" is not a ${ref.slice(0, ref.indexOf(':'))} in the compendium`);
      }
    }
    if (entry.type === 'spell' && Array.isArray(data.classes)) {
      for (const cls of data.classes) if (!known.classSlugs.has(String(cls))) add(`names unknown class "${String(cls)}"`);
    }
  }
  return issues;
}

/** The problems with these monsters; none means they may be imported. */
export function validateMonsters(monsters: RawMonster[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const monster of monsters) {
    const where = `monster:${monster.name ?? '?'}`;
    const add = (message: string) => issues.push({ where, message });
    if (!monster.name?.trim()) add('has no name');
    if (seen.has(monster.name)) add(`"${monster.name}" appears twice`);
    seen.add(monster.name);

    const parsed = NpcStatBlockSchema.safeParse(monster.statBlock);
    if (!parsed.success) for (const issue of parsed.error.issues) add(`statBlock.${issue.path.join('.')}: ${issue.message}`);

    const cr = monster.challengeRating ?? asData(monster.statBlock).challengeRating;
    if (cr !== undefined && !CHALLENGE_RATINGS.has(String(cr))) add(`challenge rating "${String(cr)}" does not exist`);
  }
  return issues;
}
