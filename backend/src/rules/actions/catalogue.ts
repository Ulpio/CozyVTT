import type { FifthEditionCharacterData } from '../../validators/game-systems/fifthEdition.schema';
import type { NpcStatBlockInput } from '../../validators/statBlock';
import { parseDiceExpression } from '../../utils/dice-parser';
import { fifthEditionSpellAttackBonus, fifthEditionSpellSaveDC, spellcastingAbilityModifier } from '../../utils/rules/fifthEdition';
import type { AreaSpec } from '../../utils/areaGeometry';
import { parseAreaText } from './areaText';
import { parseMonsterAction, parseMonsterSaveAction, type Ability, type SaveEffect } from './monsterActions';
import { metresToFeet, parseRangeText } from './rangeText';
import { cantripTier } from '../../services/actionResolver/dice';

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
  group: 'attack' | 'spell' | 'npc';
  resolution: 'attack' | 'heal' | 'cast' | 'post' | 'save';
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
  source: 'spell' | 'monster' | 'weapon';
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
  };
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
    spellLevel: entry?.data.level ?? sheetLevel ?? 0,
    concentration: entry?.data.concentration ?? sheetConcentration ?? false,
  };
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
): ResolvedActionSpec[] {
  const out: ResolvedActionSpec[] = [];
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

    const option: ActionOption = { id: `attack:${i}`, name: atk.name, group: 'attack', resolution: 'attack', reach };
    if (versatile) option.grips = ['one', 'two'];
    const spec: ResolvedActionSpec = { option, attackBonus: atk.attackBonus, damage, source: 'weapon' };
    if (versatile) spec.versatileDamage = versatile;
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
        option: { id: `attack:${i}:thrown`, name: `${atk.name} (arremesso)`, group: 'attack', resolution: 'attack', reach: thrown },
        attackBonus: atk.attackBonus,
        damage,
        source: 'weapon',
      });
    }
  });

  return [...out, ...spellSpecs];
}

const NPC_LISTS = ['actions', 'bonusActions', 'reactions'] as const;

/**
 * What an NPC's stat block says it can do: its actions, bonus actions and
 * reactions. `rechargeSpent` lists the option ids whose recharge is spent on
 * the token (ids are by position in the list, so they stay put for a given
 * stat block).
 */
export function npcActions(statBlock: NpcStatBlockInput, rechargeSpent: readonly string[] = []): ResolvedActionSpec[] {
  const out: ResolvedActionSpec[] = [];
  const post = (id: string, name: string, description: string | undefined): void => {
    out.push({ option: { id, name, group: 'npc', resolution: 'post' }, damage: [], description, source: 'monster' });
  };
  for (const list of NPC_LISTS) {
    (statBlock?.[list] ?? []).forEach((entry, i) => {
      const id = `npc:${list}:${i}`;
      const parsed = parseMonsterAction(entry.description ?? '');
      if (!parsed) {
        const saveAction = parseMonsterSaveAction(entry.name, entry.description ?? '');
        if (!saveAction) {
          post(id, entry.name, entry.description);
          return;
        }
        const damage = saveAction.save.damage.map((d) => damageOf(d.dice, d.type)).filter((d): d is Damage => d !== null);
        let targeting: ActionTargeting;
        if (saveAction.area) {
          targeting = { kind: 'area', area: saveAction.area, origin: 'self' };
          if (saveAction.rangeFeet !== undefined) targeting.rangeFeet = saveAction.rangeFeet;
        } else if (saveAction.targets === 'many') {
          targeting = { kind: 'multi', count: MANY_TARGETS_CAP, distinct: true };
        } else {
          targeting = { kind: 'single' };
        }
        const summary = [`CD ${saveAction.save.dc} ${saveAction.save.ability}`, ...damage.map((d) => (d.type ? `${d.dice} ${d.type}` : d.dice))].join(', ');
        const option: ActionOption = { id, name: entry.name, group: 'npc', resolution: 'save', saveAbility: saveAction.save.ability, targeting, summary };
        if (saveAction.recharge) option.recharge = { min: saveAction.recharge.min, spent: rechargeSpent.includes(id) };
        const spec: ResolvedActionSpec = { option, damage, save: saveAction.save, description: entry.description, source: 'monster' };
        if (saveAction.save.extraText) spec.extraText = saveAction.save.extraText;
        out.push(spec);
        return;
      }
      const damage = parsed.damage.map((d) => damageOf(d.dice, d.type)).filter((d): d is Damage => d !== null);
      if (damage.length === 0) {
        // An attack with no damage to roll (a net): its text is posted.
        post(id, entry.name, entry.description);
        return;
      }
      const normal = parsed.kind === 'melee' ? (parsed.reachFeet ?? parsed.normalFeet ?? 5) : (parsed.normalFeet ?? parsed.reachFeet ?? 5);
      const reach: Reach = { kind: 'feet', normal };
      if (parsed.kind === 'ranged' && parsed.longFeet !== undefined) reach.long = parsed.longFeet;
      const bonus = parsed.bonus >= 0 ? `+${parsed.bonus}` : `${parsed.bonus}`;
      const summary = [bonus, ...damage.map((d) => (d.type ? `${d.dice} ${d.type}` : d.dice))].join(', ');
      const spec: ResolvedActionSpec = {
        option: { id, name: entry.name, group: 'npc', resolution: 'attack', reach, summary },
        attackBonus: parsed.bonus,
        damage,
        description: entry.description,
        source: 'monster',
      };
      if (parsed.extraText) spec.extraText = parsed.extraText;
      if (parsed.onHitSave) spec.onHitSave = parsed.onHitSave;
      out.push(spec);
    });
  }
  return out;
}
