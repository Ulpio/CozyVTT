import { ABILITY_KEYS } from '@/utils/rules/fifthEdition';
import { MANEUVERS } from './subclassRules';
import type { AbilityKey, Effect, OptionEffect } from './types';

/**
 * PHB feats (variant human only) that change a number or add a choice. Feats
 * whose benefits are only situational have no entry.
 */

/** +1 to one of `allowed`. */
const plusOneOf = (...allowed: AbilityKey[]): Effect => ({
  type: 'abilityChoice',
  count: 1,
  amount: 1,
  exclude: ABILITY_KEYS.filter((k) => !allowed.includes(k)),
});
const plusOne = (ability: AbilityKey): Effect => ({ type: 'ability', ability, amount: 1 });

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: 'Força',
  dex: 'Destreza',
  con: 'Constituição',
  int: 'Inteligência',
  wis: 'Sabedoria',
  cha: 'Carisma',
};

const RESILIENT: OptionEffect[] = ABILITY_KEYS.map((ability) => ({
  id: ability,
  name: ABILITY_NAMES[ability],
  effects: [plusOne(ability), { type: 'save', ability }],
}));

const MAGIC_INITIATE: OptionEffect[] = (
  [
    ['bardo', 'Bardo', 'cha'],
    ['bruxo', 'Bruxo', 'cha'],
    ['clerigo', 'Clérigo', 'wis'],
    ['druida', 'Druida', 'wis'],
    ['feiticeiro', 'Feiticeiro', 'cha'],
    ['mago', 'Mago', 'int'],
  ] as const
).map(([list, name, ability]) => ({
  id: list,
  name,
  effects: [
    { type: 'cantripChoice', count: 2, list, ability },
    { type: 'spellChoice', count: 1, level: 1, list },
  ],
}));

export const FEAT_EFFECTS: Record<string, Effect[]> = {
  'adepto-marcial': [{ type: 'option', id: 'martialAdeptManeuvers', choose: 2, options: MANEUVERS }],
  alerta: [{ type: 'initiative', amount: 5 }],
  atleta: [plusOneOf('str', 'dex')],
  ator: [plusOne('cha')],
  'especialista-em-briga': [
    plusOneOf('str', 'con'),
    { type: 'weaponProficiency', weapon: 'improvised' },
    { type: 'attackBonus', attack: 'unarmed', die: '1d4' },
  ],
  'iniciado-em-magia': [{ type: 'option', id: 'magicInitiateClass', choose: 1, options: MAGIC_INITIATE }],
  'maestria-em-armadura-pesada': [plusOne('str')],
  'mente-afiada': [plusOne('int')],
  'mestre-de-armas': [plusOneOf('str', 'dex')],
  mobilidade: [{ type: 'speed', meters: 3 }],
  observador: [plusOneOf('int', 'wis'), { type: 'passivePerception', amount: 5 }],
  perito: [{ type: 'skillChoice', count: 3, orTool: true }],
  poliglota: [plusOne('int'), { type: 'languageChoice', count: 3 }],
  'protecao-leve': [plusOneOf('str', 'dex'), { type: 'armorProficiency', armor: 'light' }],
  'protecao-moderada': [
    plusOneOf('str', 'dex'),
    { type: 'armorProficiency', armor: 'medium' },
    { type: 'armorProficiency', armor: 'shield' },
  ],
  'protecao-pesada': [plusOne('str'), { type: 'armorProficiency', armor: 'heavy' }],
  resiliente: [{ type: 'option', id: 'resilientAbility', choose: 1, options: RESILIENT }],
  resistente: [plusOne('con')],
  robusto: [{ type: 'hpPerLevel', amount: 2 }],
};
