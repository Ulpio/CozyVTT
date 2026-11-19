import type { FifthEditionCharacterData } from '../../validators/game-systems/fifthEdition.schema';
import type { NpcStatBlockInput } from '../../validators/statBlock';
import { parseDiceExpression } from '../../utils/dice-parser';
import { fifthEditionSpellAttackBonus, fifthEditionSpellSaveDC, spellcastingAbilityModifier } from '../../utils/rules/fifthEdition';
import type { AreaSpec } from '../../utils/areaGeometry';
import { parseAreaText } from './areaText';
import { parseMonsterAction, parseMonsterSaveAction, type Ability, type SaveEffect } from './monsterActions';
import { metresToFeet, parseRangeText } from './rangeText';
import { cantripTier } from '../../services/actionResolver/dice';
import type { ActionCost } from '../../utils/turnEconomy';
import type { ActorFeature } from './features';

/** The abilities as a pt-BR sheet shortens them, for the GM's line under a save button (its damage types are pt-BR too). */
const ABILITY_SHORT: Record<Ability, string> = { str: 'For', dex: 'Des', con: 'Con', int: 'Int', wis: 'Sab', cha: 'Car' };

export type ActionId = string;

/** Who an action can reach: one target, a number of them, or whatever a shape covers. */
export type ActionTargeting =
  | { kind: 'single' }
  | { kind: 'multi'; count: number; perSlot?: number; distinct: boolean }
  | { kind: 'area'; area: AreaSpec; origin: 'self' | 'point'; rangeFeet?: number };

/** The most targets a monster save action with no area is given ("each creature"). */
const MANY_TARGETS_CAP = 20;

/** What the client may see of one thing a token can do (no AC, no HP). */
export interface ActionOption {
  id: ActionId;
  name: string;
  group: 'attack' | 'spell' | 'npc' | 'common' | 'feature';
  resolution: 'attack' | 'heal' | 'cast' | 'post' | 'save' | 'feature';
  /** Absent: the P5a single target (or none). */
  targeting?: ActionTargeting;
  recharge?: { min: number; spent: boolean };
  saveAbility?: Ability;
  /** Character spells only: public to the caster. */
  saveDc?: number;
  spellLevel?: number;
  concentration?: boolean;
  grips?: ('one' | 'two')[];
  reach?: { kind: 'self' | 'touch' } | { kind: 'feet'; normal: number; long?: number };
  /** NPC options only: the attack bonus and dice, for the GM. */
  summary?: string;
  /** What taking it spends in the turn. */
  cost: ActionCost;
  /** Spells: the book's casting time, as written. */
  castingTime?: string;
  /** Casting time of a minute or more: not something to do in a fight. */
  combatUnavailable?: true;
  /** A melee weapon attack: it can be an opportunity attack off turn. */
  meleeWeapon?: true;
  /** A monster's Multiattack: it takes the Attack action, so its attacks that follow pass as part of it. */
  startsAttackAction?: true;
  /** Class features: the uses left in the pool the feature spends. */
  uses?: { left: number; max: number };
  /** Class feature that heals an amount the player chooses (Lay on Hands): the bar asks for it. */
  chosenAmount?: true;
  /** Class feature states: running now. */
  active?: true;
  /** Weapon attacks: the features that can add to the hit (Sneak Attack, Divine Smite). */
  riders?: FeatureRider[];
}

/** A feature that adds to a weapon attack's hit; `slot` when it spends a spell slot. */
export interface FeatureRider {
  featureId: string;
  name: string;
  uses?: { left: number; max: number };
  slot?: true;
}

/** Server-only: everything the resolver needs to roll the action. */
export interface ResolvedActionSpec {
  option: ActionOption;
  attackBonus?: number;
  damage: { dice: string; type?: string }[];
  versatileDamage?: { dice: string; type?: string };
  healing?: { dice: string; addModifier: boolean };
  scaling?: { perSlot?: string; cantrip?: boolean };
  extraText?: string;
  description?: string;
  save?: SaveEffect;
  /** A save the hit of an attack forces on its target. */
  onHitSave?: SaveEffect;
  rays?: { count: number; perSlot?: number; cantripLevels?: boolean };
  autoHit?: boolean;
  selfHeal?: 'half-damage';
  /** Where the action comes from: Magic Resistance helps against spells only. */
  source: 'spell' | 'monster' | 'weapon' | 'feature';
  /** Weapon attacks: the weapon has finesse, so it may use STR or DEX. */
  finesse?: true;
  /** Weapon attacks from an item in hand: how it is held, which decides a versatile weapon's damage. */
  grip?: 'one' | 'two';
  /** Weapon attacks: what the weapon fires (the gear slug, and its plural name in lower case). */
  ammunition?: { slug: string; label: string };
  /** Class feature options: the feature the button resolves. */
  feature?: ActorFeature;
}

/** The parts of a compendium spell entry the catalogue reads. */
export interface CompendiumSpell {
  slug: string;
  name: string;
  /** The entry's text, posted on the card of a spell with nothing to roll. */
  text?: string;
  data: {
    level: number;
    range: string;
    castingTime?: string;
    concentration: boolean;
    mechanics?: {
      attack?: 'melee' | 'ranged';
      damage?: { dice: string; type: string }[];
      save?: Ability;
      healing?: string;
      healingAddsModifier?: boolean;
      halfOnSave?: boolean;
      targets?: number;
      targetsPerSlot?: number;
      rays?: { count: number; perSlot?: number; cantripLevels?: boolean };
      autoHit?: boolean;
      selfHeal?: 'half-damage';
      area?: { shape: string; size: string; width?: string };
      castOnly?: string;
      scaling?: { perSlot?: string; cantrip?: boolean };
    };
  };
}

/** The parts of a compendium weapon entry the catalogue reads (ranges in metres). */
export interface CompendiumWeapon {
  slug: string;
  name: string;
  data: {
    range: 'melee' | 'ranged';
    properties?: string[];
    normalRange?: number;
    longRange?: number;
    damage?: { dice: string; type: string };
    /** The gear slug of the ammunition the weapon fires. */
    ammunition?: string;
  };
}

/** "Flechas (20)" -> "flechas"; with no gear entry, the slug's words without a trailing number. */
function ammunitionLabel(name: string | undefined, slug: string): string {
  const source = name ?? slug.replace(/-\d+$/, '').replace(/-/g, ' ');
  return source.replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase();
}

type Reach = NonNullable<ActionOption['reach']>;
type Damage = { dice: string; type?: string };

const VERSATILE_LABEL = 'Duas mãos';

/** The dice with a unicode minus made plain, or null when they would not roll. */
function cleanDice(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const dice = raw.replace(/[\u2212\u2013]/g, '-').trim();
  if (!dice) return null;
  try {
    parseDiceExpression(dice);
  } catch {
    return null;
  }
  return dice;
}

function damageOf(dice: unknown, type: unknown): Damage | null {
  const d = cleanDice(dice);
  if (!d) return null;
  return { dice: d, type: typeof type === 'string' && type.trim() ? type.trim() : undefined };
}

export function spellcastingModifier(sheet: FifthEditionCharacterData): number {
  return spellcastingAbilityModifier(sheet);
}

export function characterLevel(sheet: FifthEditionCharacterData): number {
  return typeof sheet?.level === 'number' && sheet.level >= 1 ? sheet.level : 1;
}

/** The constant part of a damage roll beyond its dice ('1d10+3' is 3, '1d10' is 0, unreadable is 0). */
function flatModifier(raw: unknown): number {
  const dice = cleanDice(raw);
  if (!dice) return 0;
  let total = 0;
  for (const m of dice.replace(/\s+/g, '').matchAll(/([+-]?)(\d*d\d+|\d+)/gi)) {
    if (m[2].toLowerCase().includes('d')) continue;
    total += (m[1] === '-' ? -1 : 1) * parseInt(m[2], 10);
  }
  return total;
}

/** Lowercase, accents off, for matching the book's pt-BR words. */
const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** The cost in the turn of a spell, from its casting time ("1 ação", "1 ação bônus", "1 reação, que…"); a minute or more is no combat action. */
export function costFromCastingTime(text: string): { cost: ActionCost; combatUnavailable?: true } {
  const t = plain(text ?? '');
  if (/^1 acao bonus/.test(t)) return { cost: 'bonus' };
  if (/^1 reacao/.test(t)) return { cost: 'reaction' };
  if (/(^|\s)(minutos?|horas?)(\s|$)/.test(t)) return { cost: 'action', combatUnavailable: true };
  return { cost: 'action' };
}

const COMMON: { id: string; name: string }[] = [
  { id: 'common:dash', name: 'Disparada' },
  { id: 'common:disengage', name: 'Desengajar' },
  { id: 'common:dodge', name: 'Esquivar' },
  { id: 'common:help', name: 'Ajudar' },
  { id: 'common:hide', name: 'Esconder' },
];

/** The actions anyone can take, posted as a card. */
function commonActions(): ResolvedActionSpec[] {
  return COMMON.map(({ id, name }) => ({ option: { id, name, group: 'common', resolution: 'post', cost: 'action' }, damage: [], source: 'weapon' }));
}

/** The common actions a feature lets be taken as a bonus action. */
export type BonusCommon = 'dash' | 'disengage' | 'hide';

/**
 * Common actions taken as a bonus action (Cunning Action): `common:<x>:bonus`,
 * posted like the common action they copy, in the order of the common list.
 */
export function commonBonusActions(kinds: BonusCommon[]): ResolvedActionSpec[] {
  const wanted = new Set(kinds.map((k) => `common:${k}`));
  return COMMON.filter(({ id }) => wanted.has(id)).map(({ id, name }) => ({
    option: { id: `${id}:bonus`, name: `${name} (bônus)`, group: 'common', resolution: 'post', cost: 'bonus' },
    damage: [],
    source: 'weapon',
  }));
}

const key = (ref: { bookId: string; slug: string }) => `${ref.bookId}/${ref.slug}`;

function spellSpec(
  id: string,
  sheetName: string,
  sheetLevel: number | undefined,
  sheetConcentration: boolean | undefined,
  entry: CompendiumSpell | undefined,
  attackBonus: number,
  sheet: FifthEditionCharacterData,
): ResolvedActionSpec {
  const mech = entry?.data.mechanics;
  const damage = (mech?.damage ?? []).map((d) => damageOf(d.dice, d.type)).filter((d): d is Damage => d !== null);
  let resolution: ActionOption['resolution'] = 'cast';
  if (mech && !mech.castOnly) {
    if (mech.save) resolution = 'save';
    else if (mech.attack || (mech.autoHit && damage.length > 0)) resolution = 'attack';
    else if (mech.healing) resolution = 'heal';
  }
  const option: ActionOption = {
    id,
    name: entry?.name ?? sheetName,
    group: 'spell',
    resolution,
    cost: 'action',
    spellLevel: entry?.data.level ?? sheetLevel ?? 0,
    concentration: entry?.data.concentration ?? sheetConcentration ?? false,
  };
  if (entry?.data.castingTime) {
    option.castingTime = entry.data.castingTime;
    Object.assign(option, costFromCastingTime(entry.data.castingTime));
  }
  const reach = entry ? parseRangeText(entry.data.range) : null;
  if (reach) option.reach = reach;
  const spec: ResolvedActionSpec = { option, damage, source: 'spell' };
  if (resolution === 'attack' && mech?.attack) spec.attackBonus = attackBonus;
  if (resolution === 'attack' && mech?.autoHit) spec.autoHit = true;
  const heal = cleanDice(mech?.healing);
  if (resolution === 'heal' && heal) spec.healing = { dice: heal, addModifier: mech?.healingAddsModifier === true };
  if (mech?.scaling) spec.scaling = mech.scaling;
  if (mech?.selfHeal) spec.selfHeal = mech.selfHeal;
  if (resolution === 'save' && mech?.save) {
    const dc = fifthEditionSpellSaveDC(sheet);
    spec.save = { ability: mech.save, dc, damage: damage.map((d) => ({ dice: d.dice, type: d.type ?? '' })), halfOnSave: mech.halfOnSave === true };
    option.saveAbility = mech.save;
    option.saveDc = dc;
  }
  if (resolution !== 'cast' && mech) {
    const level = characterLevel(sheet);
    const area = mech.area ? parseAreaText(mech.area) : null;
    if (area) {
      const targeting: ActionTargeting = { kind: 'area', area, origin: reach?.kind === 'self' ? 'self' : 'point' };
      if (reach?.kind === 'feet') targeting.rangeFeet = reach.normal;
      // An area cast by touch is placed at a point beside the caster.
      else if (reach?.kind === 'touch') targeting.rangeFeet = 5;
      option.targeting = targeting;
    } else if (mech.rays) {
      spec.rays = mech.rays;
      const count = mech.rays.cantripLevels ? cantripTier(level) : mech.rays.count;
      option.targeting = { kind: 'multi', count, ...(mech.rays.perSlot ? { perSlot: mech.rays.perSlot } : {}), distinct: false };
    } else if ((mech.targets ?? 1) > 1 || mech.targetsPerSlot) {
      option.targeting = { kind: 'multi', count: mech.targets ?? 1, ...(mech.targetsPerSlot ? { perSlot: mech.targetsPerSlot } : {}), distinct: true };
    } else if (resolution === 'save') {
      option.targeting = { kind: 'single' };
    }
  }
  // Nothing to roll: the card posts what the spell does.
  if (resolution === 'cast' && entry?.text) spec.description = entry.text;
  return spec;
}

/**
 * What a character's sheet says it can do: each attack (index order kept, so
 * `attack:<i>` is `sheet.attacks[i]`), and each cantrip and spell it lists.
 * `spells` and `weapons` are keyed `bookId/slug`.
 */
export function characterActions(
  sheet: FifthEditionCharacterData,
  spells: Map<string, CompendiumSpell>,
  weapons: Map<string, CompendiumWeapon>,
  /** Gear names keyed `bookId/slug`, for the ammunition weapons fire. */
  gear: Map<string, string> = new Map(),
): ResolvedActionSpec[] {
  const out: ResolvedActionSpec[] = [];
  const itemSlots = new Map((sheet?.inventory ?? []).map((i) => [i.id, i.slot] as const));
  const spellAttackBonus = fifthEditionSpellAttackBonus(sheet);

  // Spells first, so an attack cantrip that is also in attacks[] is listed once.
  const spellSpecs: ResolvedActionSpec[] = [];
  const seen = new Set<string>();
  const attackNames = new Set((sheet?.attacks ?? []).map((a) => a.name.trim().toLowerCase()));
  const addSpell = (name: string, level: number | undefined, conc: boolean | undefined, ref: { bookId: string; slug: string } | undefined, sheetId: string) => {
    if (!ref) {
      // No book entry: a cast that spends the slot and takes up concentration.
      // One the sheet also lists as an attack row is that row.
      if (attackNames.has(name.trim().toLowerCase())) return;
      spellSpecs.push(spellSpec(`spell:${sheetId}`, name, level, conc, undefined, spellAttackBonus, sheet));
      return;
    }
    const k = key(ref);
    if (seen.has(k)) return;
    seen.add(k);
    spellSpecs.push(spellSpec(`spell:${k}`, name, level, conc, spells.get(k), spellAttackBonus, sheet));
  };
  const sc = sheet?.spellcasting;
  for (const c of sc?.cantripRefs ?? []) addSpell(c.name, 0, false, c.compendiumRef, '');
  // Cantrips are names; those with a book entry are in cantripRefs.
  const cantripsWithRef = new Set((sc?.cantripRefs ?? []).map((c) => c.name));
  (sc?.cantrips ?? []).forEach((name, i) => {
    if (typeof name === 'string' && name.trim() && !cantripsWithRef.has(name)) addSpell(name, 0, false, undefined, `sheet-cantrip:${i}`);
  });
  (sc?.spells ?? []).forEach((s, i) => addSpell(s.name, s.level, s.concentration, s.compendiumRef, `sheet:${i}`));
  const attackSpellRefs = new Set(spellSpecs.filter((s) => s.option.resolution === 'attack').map((s) => s.option.id.slice('spell:'.length)));

  (sheet?.attacks ?? []).forEach((atk, i) => {
    // A row linked to an item is listed while the item is in a hand; a row with no item stays.
    let grip: 'one' | 'two' | undefined;
    if (atk.itemId) {
      const slot = itemSlots.get(atk.itemId);
      if (slot !== 'main' && slot !== 'off' && slot !== 'both') return;
      grip = slot === 'both' ? 'two' : 'one';
    }
    if (atk.compendiumRef && attackSpellRefs.has(key(atk.compendiumRef))) {
      // The spell keeps the book's dice; the sheet row's flat modifier (an invocation, say) is added.
      const flat = flatModifier(atk.damageRoll);
      const spell = spellSpecs.find((s) => s.option.id === `spell:${key(atk.compendiumRef!)}`);
      if (flat !== 0 && spell?.damage[0]) spell.damage[0] = { ...spell.damage[0], dice: `${spell.damage[0].dice}${flat > 0 ? '+' : '-'}${Math.abs(flat)}` };
      return;
    }
    const wpn = atk.compendiumRef ? weapons.get(key(atk.compendiumRef)) : undefined;
    const props = new Set([...(atk.properties ?? []), ...(wpn?.data.properties ?? [])].map((p) => p.trim().toLowerCase()));
    const thrownWeapon = props.has('arremesso') || props.has('thrown');
    const reachWeapon = props.has('alcance') || props.has('reach');
    const finesse = props.has('acuidade') || props.has('finesse');
    // The sheet's own range (feet), for a weapon the book gives none.
    const sheetRange = typeof atk.range === 'number' && atk.range > 5 && typeof wpn?.data.normalRange !== 'number' ? atk.range : undefined;

    const damage: Damage[] = [];
    const base = damageOf(atk.damageRoll, atk.damageType);
    if (base) damage.push(base);
    let versatile: Damage | undefined;
    for (const extra of atk.additionalDamage ?? []) {
      const d = damageOf(extra.damageRoll, extra.damageType);
      if (!d) continue;
      if ((extra.label ?? '').trim() === VERSATILE_LABEL) versatile = d;
      else damage.push(d);
    }

    let reach: Reach;
    if (wpn?.data.range === 'ranged' && typeof wpn.data.normalRange === 'number') {
      reach = { kind: 'feet', normal: metresToFeet(wpn.data.normalRange) };
      if (typeof wpn.data.longRange === 'number') reach.long = metresToFeet(wpn.data.longRange);
    } else if (sheetRange !== undefined && !thrownWeapon) {
      reach = { kind: 'feet', normal: sheetRange };
    } else {
      reach = { kind: 'feet', normal: reachWeapon ? 10 : 5 };
    }

    const option: ActionOption = { id: `attack:${i}`, name: atk.name, group: 'attack', resolution: 'attack', reach, cost: 'attack' };
    if (wpn ? wpn.data.range !== 'ranged' : sheetRange === undefined || thrownWeapon) option.meleeWeapon = true;
    // An item in hand is held one way or the other: no grip to choose.
    if (versatile && !grip) option.grips = ['one', 'two'];
    const spec: ResolvedActionSpec = { option, attackBonus: atk.attackBonus, damage, source: 'weapon' };
    if (versatile) spec.versatileDamage = versatile;
    if (grip) spec.grip = grip;
    const fires = wpn?.data.ammunition;
    if (atk.compendiumRef && typeof fires === 'string' && fires) {
      spec.ammunition = { slug: fires, label: ammunitionLabel(gear.get(`${atk.compendiumRef.bookId}/${fires}`), fires) };
    }
    if (finesse) spec.finesse = true;
    out.push(spec);

    let thrown: Reach | undefined;
    if (thrownWeapon && typeof wpn?.data.normalRange === 'number' && wpn.data.range === 'melee') {
      thrown = { kind: 'feet', normal: metresToFeet(wpn.data.normalRange) };
      if (typeof wpn.data.longRange === 'number') thrown.long = metresToFeet(wpn.data.longRange);
    } else if (thrownWeapon && sheetRange !== undefined && wpn?.data.range !== 'ranged') {
      thrown = { kind: 'feet', normal: sheetRange };
    }
    if (thrown) {
      out.push({
        option: { id: `attack:${i}:thrown`, name: `${atk.name} (arremesso)`, group: 'attack', resolution: 'attack', reach: thrown, cost: 'attack' },
        attackBonus: atk.attackBonus,
        damage,
        source: 'weapon',
        ...(finesse ? { finesse: true as const } : {}),
      });
    }
  });

  return [...out, ...spellSpecs, ...commonActions()];
}

const NPC_LISTS = ['actions', 'bonusActions', 'reactions'] as const;

/** A stat block action named as the monster's Multiattack. */
const MULTIATTACK = /multiata|ataques\s+m[uú]ltiplos|multiattack/i;

/**
 * What an NPC's stat block says it can do: its actions, bonus actions and
 * reactions. `rechargeSpent` lists the option ids whose recharge is spent on
 * the token (ids are by position in the list, so they stay put for a given
 * stat block).
 */
export function npcActions(statBlock: NpcStatBlockInput, rechargeSpent: readonly string[] = []): ResolvedActionSpec[] {
  const out: ResolvedActionSpec[] = [];
  const post = (id: string, name: string, description: string | undefined, cost: ActionCost): void => {
    const option: ActionOption = { id, name, group: 'npc', resolution: 'post', cost };
    if (cost === 'action' && MULTIATTACK.test(name)) option.startsAttackAction = true;
    out.push({ option, damage: [], description, source: 'monster' });
  };
  for (const list of NPC_LISTS) {
    const listCost: ActionCost = list === 'actions' ? 'action' : list === 'bonusActions' ? 'bonus' : 'reaction';
    (statBlock?.[list] ?? []).forEach((entry, i) => {
      const id = `npc:${list}:${i}`;
      const parsed = parseMonsterAction(entry.description ?? '');
      if (!parsed) {
        const saveAction = parseMonsterSaveAction(entry.name, entry.description ?? '');
        if (!saveAction) {
          post(id, entry.name, entry.description, listCost);
          return;
        }
        const damage = saveAction.save.damage.map((d) => damageOf(d.dice, d.type)).filter((d): d is Damage => d !== null);
        let targeting: ActionTargeting;
        if (saveAction.area) {
          // A sphere, cylinder or cube "a até N metros" is placed at a point in
          // range; a cone or line, and a shape with no range, leave the monster.
          const atPoint = saveAction.rangeFeet !== undefined && saveAction.area.shape !== 'cone' && saveAction.area.shape !== 'line';
          targeting = { kind: 'area', area: saveAction.area, origin: atPoint ? 'point' : 'self' };
          if (saveAction.rangeFeet !== undefined) targeting.rangeFeet = saveAction.rangeFeet;
        } else if (saveAction.targets === 'many') {
          targeting = { kind: 'multi', count: MANY_TARGETS_CAP, distinct: true };
        } else {
          targeting = { kind: 'single' };
        }
        const summary = [`CD ${saveAction.save.dc} ${ABILITY_SHORT[saveAction.save.ability]}`, ...damage.map((d) => (d.type ? `${d.dice} ${d.type}` : d.dice))].join(', ');
        const option: ActionOption = { id, name: entry.name, group: 'npc', resolution: 'save', saveAbility: saveAction.save.ability, targeting, summary, cost: listCost };
        if (saveAction.recharge) option.recharge = { min: saveAction.recharge.min, spent: rechargeSpent.includes(id) };
        const spec: ResolvedActionSpec = { option, damage, save: saveAction.save, description: entry.description, source: 'monster' };
        if (saveAction.save.extraText) spec.extraText = saveAction.save.extraText;
        out.push(spec);
        return;
      }
      const damage = parsed.damage.map((d) => damageOf(d.dice, d.type)).filter((d): d is Damage => d !== null);
      if (damage.length === 0) {
        // An attack with no damage to roll (a net): its text is posted.
        post(id, entry.name, entry.description, listCost);
        return;
      }
      const normal = parsed.kind === 'melee' ? (parsed.reachFeet ?? parsed.normalFeet ?? 5) : (parsed.normalFeet ?? parsed.reachFeet ?? 5);
      const reach: Reach = { kind: 'feet', normal };
      if (parsed.kind === 'ranged' && parsed.longFeet !== undefined) reach.long = parsed.longFeet;
      const bonus = parsed.bonus >= 0 ? `+${parsed.bonus}` : `${parsed.bonus}`;
      const summary = [bonus, ...damage.map((d) => (d.type ? `${d.dice} ${d.type}` : d.dice))].join(', ');
      const spec: ResolvedActionSpec = {
        option: { id, name: entry.name, group: 'npc', resolution: 'attack', reach, summary, cost: list === 'actions' ? 'attack' : listCost },
        attackBonus: parsed.bonus,
        damage,
        description: entry.description,
        source: 'monster',
      };
      // A melee attack can be the monster's opportunity attack off turn.
      if (parsed.kind === 'melee') spec.option.meleeWeapon = true;
      if (parsed.extraText) spec.extraText = parsed.extraText;
      if (parsed.onHitSave) spec.onHitSave = parsed.onHitSave;
      out.push(spec);
    });
  }
  return [...out, ...commonActions()];
}
