import { abilityModifier, proficiencyBonusForLevel } from '@/utils/rules/fifthEdition';
import type { ArmorData } from './compendiumData';
import { SKILL_KEYS, type AbilityKey, type Effect, type SkillKey } from './types';

export function proficiencyBonusFor(level: number): number {
  return proficiencyBonusForLevel(level);
}

/** First level takes the full die; later levels the average rounded up. */
export function maxHitPoints(
  hitDie: number,
  level: number,
  conMod: number,
  perLevelBonus: number,
): number {
  return hitDie + (level - 1) * (Math.floor(hitDie / 2) + 1) + level * (conMod + perLevelBonus);
}

/**
 * `scores` are final ability scores. `armor` is body armor (a shield passed here is
 * ignored; use the `shield` flag). Unarmored uses the best of 10 + DEX and any
 * unarmoredAC effect; acBonus applies always, or only when body armor is worn.
 */
export function armorClass(
  armor: ArmorData | undefined,
  shield: boolean,
  scores: Record<AbilityKey, number>,
  effects: Effect[],
): number {
  const mod = (k: AbilityKey) => abilityModifier(scores[k]);
  const body = armor && armor.category !== 'shield' ? armor : undefined;
  let ac: number;
  if (body) {
    ac = body.baseAc;
    if (body.addDex) {
      const dex = mod('dex');
      ac += body.maxDex !== undefined ? Math.min(dex, body.maxDex) : dex;
    }
  } else {
    ac = 10 + mod('dex');
    for (const e of effects) {
      if (e.type === 'unarmoredAC') {
        ac = Math.max(ac, e.base + e.abilities.reduce((s, k) => s + mod(k), 0));
      }
    }
  }
  if (shield) ac += 2;
  for (const e of effects) {
    if (e.type === 'acBonus' && (!e.whenArmored || body)) ac += e.amount;
  }
  return ac;
}

/** Proficient skills (deduplicated, canonical order) and expertise (proficient only). */
export function resolveSkills(
  backgroundSkills: SkillKey[],
  classPicks: SkillKey[],
  extra: SkillKey[],
  expertise: SkillKey[],
): { proficient: SkillKey[]; expertise: SkillKey[] } {
  const have = new Set<SkillKey>([...backgroundSkills, ...classPicks, ...extra]);
  const proficient = SKILL_KEYS.filter((k) => have.has(k));
  return { proficient, expertise: SKILL_KEYS.filter((k) => have.has(k) && expertise.includes(k)) };
}
