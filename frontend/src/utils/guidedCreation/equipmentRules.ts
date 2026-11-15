import { abilityModifier } from '@/utils/rules/fifthEdition';
import type {
  ArmorData,
  BackgroundData,
  ClassData,
  EquipmentAnyOf,
  EquipmentChoiceData,
  EquipmentItemType,
  SpellData,
  WeaponData,
} from './compendiumData';
import { classArmor, type RulesEntry } from './collectEffects';
import { proficiencyBonusFor } from './derived';
import { TOOL_CATEGORIES } from './toolRules';
import type { AbilityKey, ArmorKind, Effect } from './types';

/** The compendium items equipment lines point at. Gear, tool and pack data is read for `weight` only. */
export interface EquipmentItems {
  weapons?: RulesEntry<WeaponData>[];
  armor?: RulesEntry<ArmorData>[];
  gear?: RulesEntry<{ weight?: number }>[];
  tools?: RulesEntry<{ weight?: number }>[];
  packs?: RulesEntry<unknown>[];
}

/** One inventory line; `weight` is per unit. */
export interface InventoryItem {
  type: EquipmentItemType;
  slug: string;
  name: string;
  quantity: number;
  weight?: number;
}

export interface WeaponEntry extends RulesEntry<WeaponData> {
  quantity: number;
}

/** `armor`: armor kinds; `weapons`: 'simple', 'martial' or weapon slugs (plus other weaponProficiency values). */
export interface Proficiencies {
  armor: ArmorKind[];
  weapons: string[];
}

export interface Attack {
  name: string;
  slug?: string;
  source: 'weapon' | 'unarmed' | 'cantrip';
  attackBonus: number;
  damageRoll: string;
  damageType?: string;
  /** Two-handed damage of a versatile weapon. */
  versatileDamageRoll?: string;
  /** Normal range in meters, for ranged and thrown weapons. */
  range?: number;
  properties: string[];
}

const LEVEL = 3;
const PROFICIENCY = proficiencyBonusFor(LEVEL);

const SIMPLE = 'simple';
const MARTIAL = 'martial';
const ROGUE_WEAPONS = [SIMPLE, 'besta-de-mao', 'espada-longa', 'rapieira', 'espada-curta'];
const ARCANE_WEAPONS = ['adaga', 'dardo', 'funda', 'bordao', 'besta-leve'];

/** Class weapon proficiencies (the data has them as prose). */
const CLASS_WEAPONS: Record<string, string[]> = {
  barbaro: [SIMPLE, MARTIAL],
  bardo: ROGUE_WEAPONS,
  bruxo: [SIMPLE],
  clerigo: [SIMPLE],
  druida: ['porrete', 'adaga', 'dardo', 'azagaia', 'maca', 'bordao', 'cimitarra', 'foice-curta', 'funda', 'lanca'],
  feiticeiro: ARCANE_WEAPONS,
  guerreiro: [SIMPLE, MARTIAL],
  ladino: ROGUE_WEAPONS,
  mago: ARCANE_WEAPONS,
  monge: [SIMPLE, 'espada-curta'],
  paladino: [SIMPLE, MARTIAL],
  patrulheiro: [SIMPLE, MARTIAL],
};

const FINESSE = 'acuidade';
const TWO_HANDED = 'duas mãos';
const HEAVY = 'pesada';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Armor and weapon proficiencies: the class's, the effects' and the weapons a
 * race or subrace proficiency line names ("espada longa").
 */
export function proficienciesFor(
  classSlug: string,
  classData: ClassData,
  effects: Effect[],
  raceLines: string[] = [],
  weapons: RulesEntry<WeaponData>[] = [],
): Proficiencies {
  const armor = new Set<ArmorKind>(classArmor(classData.proficiencies.armor));
  const weaponSet = new Set<string>(CLASS_WEAPONS[classSlug] ?? []);
  for (const e of effects) {
    if (e.type === 'armorProficiency') armor.add(e.armor);
    if (e.type === 'weaponProficiency') weaponSet.add(e.weapon);
  }
  const lines = new Set(raceLines.map(normalize));
  for (const w of weapons) if (lines.has(normalize(w.name))) weaponSet.add(w.slug);
  const kinds: ArmorKind[] = ['light', 'medium', 'heavy', 'shield'];
  return { armor: kinds.filter((k) => armor.has(k)), weapons: [...weaponSet] };
}

const isProficient = (weapon: { slug: string; data: WeaponData }, weapons: string[]) =>
  weapons.includes(weapon.data.category) || weapons.includes(weapon.slug);

/** Class equipment choices, then the background's: the order `equipmentPicks` follows. */
export function equipmentChoicesOf(
  classData: ClassData,
  backgroundData: BackgroundData | undefined,
): EquipmentChoiceData[] {
  return [...(classData.startingEquipmentChoices ?? []), ...(backgroundData?.startingEquipmentChoices ?? [])];
}

/** The `anyOfPicks` key of one unit of an anyOf line. */
export function anyOfKey(choice: number, item: number, unit: number): string {
  return `${choice}.${item}.${unit}`;
}

/** The compendium items an anyOf line can be filled with. */
export function anyOfOptions(anyOf: EquipmentAnyOf, items: EquipmentItems): RulesEntry<unknown>[] {
  const weapons = items.weapons ?? [];
  switch (anyOf) {
    case 'simpleWeapon':
      return weapons.filter((w) => w.data.category === 'simple');
    case 'martialWeapon':
      return weapons.filter((w) => w.data.category === 'martial');
    case 'simpleMeleeWeapon':
      return weapons.filter((w) => w.data.category === 'simple' && w.data.range === 'melee');
    case 'martialMeleeWeapon':
      return weapons.filter((w) => w.data.category === 'martial' && w.data.range === 'melee');
    case 'instrument':
    case 'artisanTool':
    case 'gamingSet':
      return (items.tools ?? []).filter((t) => TOOL_CATEGORIES[anyOf].includes(t.slug));
    default: {
      const unreachable: never = anyOf;
      throw new Error(`Unknown anyOf: ${String(unreachable)}`);
    }
  }
}

/**
 * Per equipment choice, the indexes of the options the character can use: an
 * option with armor or a weapon the character is not proficient with is left
 * out (the cleric's chain mail and warhammer "if proficient"), unless that
 * leaves the choice empty.
 */
export function offeredOptions(
  classData: ClassData,
  backgroundData: BackgroundData | undefined,
  proficiencies: Proficiencies,
  items: EquipmentItems,
): number[][] {
  const usable = (type: EquipmentItemType, slug: string) => {
    if (type === 'armor') {
      const a = items.armor?.find((x) => x.slug === slug);
      return !a || proficiencies.armor.includes(a.data.category);
    }
    if (type === 'weapon') {
      const w = items.weapons?.find((x) => x.slug === slug);
      return !w || isProficient(w, proficiencies.weapons);
    }
    return true;
  };
  return equipmentChoicesOf(classData, backgroundData).map((choice) => {
    const all = choice.options.map((_, i) => i);
    const ok = all.filter((i) => choice.options[i].items.every((it) => !it.ref || usable(it.ref.type, it.ref.slug)));
    return ok.length ? ok : all;
  });
}

const listFor = (type: EquipmentItemType, items: EquipmentItems): RulesEntry<unknown>[] =>
  ({ weapon: items.weapons, armor: items.armor, gear: items.gear, tool: items.tools, pack: items.packs })[type] ?? [];

const weightOf = (entry: RulesEntry<unknown> | undefined): number | undefined => {
  const w = (entry?.data as { weight?: unknown } | undefined)?.weight;
  return typeof w === 'number' ? w : undefined;
};

/**
 * The starting equipment the picks give: `picks[i]` is the option index of
 * choice i (`equipmentChoicesOf` order; a single option needs no pick), and each
 * anyOf unit is filled from `anyOfPicks[anyOfKey(...)]` when the pick is of the
 * right kind. Repeated items are merged. `armor` is the body armor, `shield`
 * whether a shield came with it.
 */
export function resolveEquipment(
  classData: ClassData,
  backgroundData: BackgroundData | undefined,
  picks: number[],
  anyOfPicks: Record<string, string>,
  items: EquipmentItems,
): { inventory: InventoryItem[]; armor?: RulesEntry<ArmorData>; shield: boolean; weapons: WeaponEntry[]; gp: number } {
  const inventory: InventoryItem[] = [];
  let gp = 0;
  const add = (type: EquipmentItemType, slug: string, quantity: number) => {
    const existing = inventory.find((i) => i.type === type && i.slug === slug);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    const entry = listFor(type, items).find((e) => e.slug === slug);
    const weight = weightOf(entry);
    inventory.push({ type, slug, name: entry?.name ?? slug, quantity, ...(weight !== undefined ? { weight } : {}) });
  };

  equipmentChoicesOf(classData, backgroundData).forEach((choice, c) => {
    const index = choice.options.length === 1 ? (picks[c] ?? 0) : picks[c];
    const bundle = index !== undefined ? choice.options[index] : undefined;
    if (!bundle) return;
    gp += bundle.gp ?? 0;
    bundle.items.forEach((item, i) => {
      if (item.ref) {
        add(item.ref.type, item.ref.slug, item.quantity);
        return;
      }
      if (!item.anyOf) return;
      const options = anyOfOptions(item.anyOf, items);
      const type: EquipmentItemType = item.anyOf.endsWith('Weapon') ? 'weapon' : 'tool';
      for (let unit = 0; unit < item.quantity; unit++) {
        const slug = anyOfPicks[anyOfKey(c, i, unit)];
        if (slug && options.some((o) => o.slug === slug)) add(type, slug, 1);
      }
    });
  });

  const armorOwned = new Set(inventory.filter((i) => i.type === 'armor').map((i) => i.slug));
  const armorEntries = (items.armor ?? []).filter((a) => armorOwned.has(a.slug));
  const weapons: WeaponEntry[] = inventory.flatMap((i) => {
    const w = i.type === 'weapon' ? items.weapons?.find((x) => x.slug === i.slug) : undefined;
    return w ? [{ ...w, quantity: i.quantity }] : [];
  });
  const body = inventory
    .filter((i) => i.type === 'armor')
    .map((i) => armorEntries.find((a) => a.slug === i.slug))
    .find((a) => a && a.data.category !== 'shield');
  return {
    inventory,
    ...(body ? { armor: body } : {}),
    shield: armorEntries.some((a) => a.data.category === 'shield'),
    weapons,
    gp,
  };
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '');

type AttackBonus = Extract<Effect, { type: 'attackBonus' }>;
const attackBonuses = (effects: Effect[]) => effects.filter((e): e is AttackBonus => e.type === 'attackBonus');
const sum = (list: AttackBonus[], key: 'toHit' | 'damageBonus') => list.reduce((s, e) => s + (e[key] ?? 0), 0);

const isMonkWeapon = (w: { slug: string; data: WeaponData }) =>
  w.slug === 'espada-curta' ||
  (w.data.category === 'simple' &&
    w.data.range === 'melee' &&
    !w.data.properties.includes(TWO_HANDED) &&
    !w.data.properties.includes(HEAVY));

/**
 * One attack per weapon: ranged weapons use DEX, finesse the better of STR and
 * DEX, others STR (Martial Arts may let monk weapons use DEX); the proficiency
 * bonus only when proficient; Archery to hit with ranged weapons and Dueling to
 * one-handed melee damage. Plus an unarmed strike when an effect changes it.
 */
export function attacksFor(
  weapons: WeaponEntry[],
  scores: Record<AbilityKey, number>,
  proficiencies: string[],
  effects: Effect[],
): Attack[] {
  const mod = (k: AbilityKey) => abilityModifier(scores[k]);
  const best = (keys: AbilityKey[]) => Math.max(...keys.map(mod));
  const bonuses = attackBonuses(effects);
  const of = (...kinds: AttackBonus['attack'][]) => bonuses.filter((e) => kinds.includes(e.attack));
  const out: Attack[] = [];

  for (const w of weapons) {
    const { data } = w;
    const ranged = data.range === 'ranged';
    const keys: AbilityKey[] = ranged ? ['dex'] : data.properties.includes(FINESSE) ? ['str', 'dex'] : ['str'];
    if (!ranged && isMonkWeapon(w)) {
      for (const e of of('monkWeapon')) if (e.ability) keys.push(e.ability);
    }
    const m = best(keys);
    const kinds: AttackBonus['attack'][] = ['all', ranged ? 'ranged' : 'oneHandedMelee'];
    const oneHanded = !ranged && !data.properties.includes(TWO_HANDED);
    const applying = of(...kinds).filter((e) => e.attack !== 'oneHandedMelee' || oneHanded);
    const twoHanded = applying.filter((e) => e.attack !== 'oneHandedMelee');
    const range = data.normalRange;
    out.push({
      name: w.name,
      slug: w.slug,
      source: 'weapon',
      attackBonus: m + (isProficient(w, proficiencies) ? PROFICIENCY : 0) + sum(applying, 'toHit'),
      damageRoll: `${data.damage.dice}${signed(m + sum(applying, 'damageBonus'))}`,
      damageType: data.damage.type,
      ...(data.versatile ? { versatileDamageRoll: `${data.versatile}${signed(m + sum(twoHanded, 'damageBonus'))}` } : {}),
      ...(range !== undefined ? { range } : {}),
      properties: data.properties,
    });
  }

  const unarmed = of('unarmed');
  if (unarmed.length) {
    const keys: AbilityKey[] = ['str', ...unarmed.flatMap((e) => (e.ability ? [e.ability] : []))];
    const m = best(keys);
    const applying = [...unarmed, ...of('all')];
    const die = unarmed.find((e) => e.die)?.die;
    const bonus = m + sum(applying, 'damageBonus');
    out.push({
      name: 'Ataque Desarmado',
      source: 'unarmed',
      attackBonus: m + PROFICIENCY + sum(applying, 'toHit'),
      damageRoll: die ? `${die}${signed(bonus)}` : String(Math.max(1, 1 + bonus)),
      damageType: 'concussão',
      properties: [],
    });
  }
  return out;
}

/**
 * An attack per known cantrip with an attack roll, with the ability it is cast
 * with: proficiency + modifier to hit, the 1st-tier dice (cantrips grow at 5th
 * level), and the modifier on Eldritch Blast's damage with Agonizing Blast.
 */
export function cantripAttacks(
  cantrips: { spell: RulesEntry<SpellData>; ability: AbilityKey }[],
  scores: Record<AbilityKey, number>,
  effects: Effect[],
): Attack[] {
  const bonuses = attackBonuses(effects);
  return cantrips.flatMap(({ spell, ability }) => {
    const mech = spell.data.mechanics;
    const damage = mech?.damage[0];
    if (!mech?.attack || !damage) return [];
    const m = abilityModifier(scores[ability]);
    const applying = bonuses.filter((e) => e.attack === 'all' || (e.attack === 'eldritchBlast' && spell.slug === 'rajada-mistica'));
    const damageBonus = applying.reduce((s, e) => s + (e.damage === 'ability' ? m : 0) + (e.damageBonus ?? 0), 0);
    return [
      {
        name: spell.name,
        slug: spell.slug,
        source: 'cantrip' as const,
        attackBonus: m + PROFICIENCY + sum(applying, 'toHit'),
        damageRoll: `${damage.dice}${signed(damageBonus)}`,
        damageType: damage.type,
        properties: [],
      },
    ];
  });
}
