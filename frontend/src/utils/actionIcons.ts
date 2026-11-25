import type { IconType } from 'react-icons';
import {
  GiAcid, GiAcrobatic, GiArrowhead, GiBiceps, GiBrain, GiPsychicWaves, GiCrossedSwords,
  GiDeathSkull, GiDiceTwentyFacesTwenty, GiDodge, GiExitDoor, GiFist, GiFlame, GiGhost,
  GiHearts, GiMuscularTorso, GiShakingHands, GiHidden, GiHourglass, GiBoltSpellCast, GiMagicPortal,
  GiMagicSwirl, GiMagnifyingGlass, GiOwl, GiPoisonBottle, GiRoundStar, GiRunningShoe,
  GiSaberSlash, GiShield, GiSnowflake1, GiSoundWaves, GiSparkles, GiSpellBook, GiStarFormation,
  GiSun, GiTalk,
} from 'react-icons/gi';
import type { ActionOption } from '../types/actions';
import { ABILITY_LABELS, FIFTH_EDITION_SKILLS, type AbilityKey } from './rules/fifthEdition';

export const DAMAGE_ICONS: Record<string, IconType> = {
  'ácido': GiAcid, 'concussão': GiFist, cortante: GiSaberSlash, 'elétrico': GiBoltSpellCast,
  energia: GiMagicSwirl, fogo: GiFlame, frio: GiSnowflake1, 'necrótico': GiDeathSkull,
  perfurante: GiArrowhead, 'psíquico': GiPsychicWaves, radiante: GiSun, trovejante: GiSoundWaves,
  veneno: GiPoisonBottle,
};

export const SCHOOL_ICONS: Record<string, IconType> = {
  'abjuração': GiShield, 'adivinhação': GiMagnifyingGlass, 'conjuração': GiMagicPortal,
  encantamento: GiSparkles, 'evocação': GiStarFormation, 'ilusão': GiGhost,
  necromancia: GiDeathSkull, 'transmutação': GiHourglass,
};

export const COMMON_ICONS: Record<string, IconType> = {
  'common:dash': GiRunningShoe, 'common:disengage': GiExitDoor, 'common:dodge': GiDodge,
  'common:help': GiShakingHands, 'common:hide': GiHidden,
};

export const ABILITY_ICONS: Record<AbilityKey, IconType> = {
  str: GiBiceps, dex: GiAcrobatic, con: GiMuscularTorso, int: GiBrain, wis: GiOwl, cha: GiTalk,
};

const HEAL_ICON: IconType = GiHearts;
export const SPELL_ICON: IconType = GiSpellBook;
export const FEATURE_ICON: IconType = GiRoundStar;
export const CHECK_ICON: IconType = GiDiceTwentyFacesTwenty;
export const ACTION_ICON: IconType = GiCrossedSwords;

const norm = (value: string | undefined) => value?.trim().toLowerCase() ?? '';

/** Own-property lookup so keys like "constructor" never match. */
const pick = <T,>(map: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

export function actionIconFor(
  option: Pick<ActionOption, 'id' | 'group' | 'resolution' | 'damageType' | 'school'>,
): IconType {
  switch (option.group) {
    case 'spell':
      if (option.resolution === 'heal') return HEAL_ICON;
      return pick(DAMAGE_ICONS, norm(option.damageType))
        ?? pick(SCHOOL_ICONS, norm(option.school))
        ?? SPELL_ICON;
    case 'common':
      return pick(COMMON_ICONS, option.id.replace(/:bonus$/, '')) ?? ACTION_ICON;
    case 'feature':
      return FEATURE_ICON;
    default:
      return ACTION_ICON;
  }
}

export function checkIconFor(testName: string | undefined, given?: AbilityKey): IconType {
  if (given && pick(ABILITY_ICONS, given)) return ABILITY_ICONS[given];
  if (!testName) return CHECK_ICON;
  const ability = (Object.keys(ABILITY_LABELS) as AbilityKey[]).find((k) => ABILITY_LABELS[k] === testName)
    ?? FIFTH_EDITION_SKILLS.find((s) => s.label === testName)?.ability;
  return ability ? ABILITY_ICONS[ability] : CHECK_ICON;
}
