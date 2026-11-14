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

/** The challenge ratings a monster can have. */
const CHALLENGE_RATINGS = new Set(['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))]);

const Damage = z.object({ dice: z.string(), type: z.string() });
const Named = z.object({ name: z.string().min(1), description: z.string() });
const Feature = Named.extend({ level: z.number().int().min(1).max(20), mechanics: z.unknown().optional() });

const SpellMechanics = z.object({
  attack: z.enum(['melee', 'ranged']).optional(),
  save: Ability.optional(),
  damage: z.array(Damage).default([]),
  healing: z.string().optional(),
  halfOnSave: z.boolean().optional(),
  targets: z.number().int().min(1).optional(),
  area: z.object({ shape: z.string(), size: z.string() }).optional(),
  // Dice added per slot level above the spell's own, or, for a cantrip,
  // whether it grows at character levels 5, 11 and 17.
  scaling: z.object({ perSlot: z.string().optional(), cantrip: z.boolean().optional() }).optional(),
});

const Spell = z
  .object({
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
  })
  .refine((s) => s.mechanics === undefined || s.level <= 2, {
    message: 'mechanics are only kept for spells of level 0 to 2',
    path: ['mechanics'],
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

/** The problems with these entries; none means they may be imported. */
export function validateEntries(entries: RawEntry[], known: { classSlugs: Set<string> }): Issue[] {
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
    for (const [path, roll] of dice) if (!DICE.test(roll)) add(`${path}: "${roll}" is not dice such as 1d8 or 2d6+3`);
    for (const [path, type] of damageTypes) {
      if (!(DAMAGE_TYPES as readonly string[]).includes(type)) add(`${path}: unknown damage type "${type}"`);
    }

    const data = asData(entry.data);
    if (entry.type === 'armor') {
      const ac = Number(data.baseAc);
      const [min, max] = data.category === 'shield' ? [1, 5] : [5, 30];
      if (ac < min || ac > max) add(`baseAc ${ac} is outside ${min}–${max}`);
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
