/**
 * The words a roll goes out with (its purpose in the dice log, and the labels
 * of the roll pickers), in the language of the person who makes it: the dice
 * log is shared, so a Portuguese player's roll reads in Portuguese for
 * everyone, and is written once, when the roll is made. Names the sheet keeps
 * as typed text (a weapon's, a homebrew skill's) go in as they are.
 */
import i18n from '@/i18n';

const tr = (key: string, options?: Record<string, unknown>): string => i18n.t(key as never, options as never) as unknown as string;

const ABILITY_SHORT_BY_ENGLISH: Record<string, string> = {
  Strength: 'str', Dexterity: 'dex', Constitution: 'con', Intelligence: 'int', Wisdom: 'wis', Charisma: 'cha',
};
const ABILITY_LONG: Record<string, string> = {
  str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma',
};
const SKILL_BY_ENGLISH: Record<string, string> = {
  Acrobatics: 'acrobatics', 'Animal Handling': 'animalHandling', Arcana: 'arcana', Athletics: 'athletics', Deception: 'deception',
  History: 'history', Insight: 'insight', Intimidation: 'intimidation', Investigation: 'investigation', Medicine: 'medicine',
  Nature: 'nature', Perception: 'perception', Performance: 'performance', Persuasion: 'persuasion', Religion: 'religion',
  'Sleight of Hand': 'sleightOfHand', Stealth: 'stealth', Survival: 'survival',
};

/** An ability's name from its English name ("Strength"); a name that is no ability keeps itself. */
export function abilityName(english: string): string {
  const short = ABILITY_SHORT_BY_ENGLISH[english];
  return short ? tr(`guidedCreation.ability.${short}`) : english;
}

/** An ability's three-letter mark from its short key ("str"): STR, or FOR in Portuguese. */
export function abilityMark(short: string): string {
  const long = ABILITY_LONG[short.toLowerCase()];
  return long ? tr(`sheet5e.abbreviations.${long}`) : short.toUpperCase();
}

/** A skill's name from its English name ("Sleight of Hand"); homebrew keeps the name it was given. */
export function skillName(english: string): string {
  const key = SKILL_BY_ENGLISH[english];
  return key ? tr(`guidedCreation.skill.${key}`) : english;
}

export const skillNameForRoll = skillName;
export const checkPurpose = (name: string) => tr('rollText.check', { name });
export const savePurpose = (name: string) => tr('rollText.saveThrow', { name });
export const saveShortPurpose = (name: string) => tr('rollText.saveShort', { name });
export const saveLabel = (name: string, bonus: string) => tr('rollText.saveLabel', { name, bonus });
export const attackLabel = (name: string, bonus: string) => tr('rollText.attackLabel', { name, bonus });
export const damageLabel = (name: string, roll: string) => tr('rollText.damageLabel', { name, roll });
export const alternateLabel = () => tr('rollText.alternate');
export const hitDiePurpose = (className?: string) => (className ? tr('rollText.hitDieClass', { class: className }) : tr('rollText.hitDie'));
export const hitDiceLeft = (count: number) => tr('rollText.left', { count });
export const customRollPurpose = () => tr('rollText.customRoll');
export const damageNth = (name: string, n: number) => tr('rollText.damageNth', { name, n });
export const npcDamageLabel = (name: string, kind: 'Action' | 'Bonus Action' | 'Reaction' | 'Legendary', suffix: string, expr: string) => {
  const key = { Action: 'npcDamage', 'Bonus Action': 'npcBonusActionDamage', Reaction: 'npcReactionDamage', Legendary: 'npcLegendaryDamage' }[kind];
  return `${name} (${tr(`rollText.${key}`, { suffix, expr })})`;
};
