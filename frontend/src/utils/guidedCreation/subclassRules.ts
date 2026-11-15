import type { Effect, OptionEffect } from './types';

/**
 * What a subclass gains up to 3rd level that changes a number or adds a choice.
 * Subclasses whose features up to 3rd level are only text have no entry.
 * Spellcasting (Eldritch Knight, Arcane Trickster) and always-prepared subclass
 * spells live in the spell rules, which read the compendium data.
 */

const opt = (id: string, name: string, effects: Effect[] = []): OptionEffect => ({ id, name, effects });
const options = (pairs: Array<[string, string]>): OptionEffect[] => pairs.map(([id, name]) => opt(id, name));

/** Battle Master maneuvers; the Martial Adept feat picks from the same list. */
export const MANEUVERS: OptionEffect[] = options([
  ['aparar', 'Aparar'],
  ['ataque-ameacador', 'Ataque Ameaçador'],
  ['ataque-de-encontrao', 'Ataque de Encontrão'],
  ['ataque-de-finta', 'Ataque de Finta'],
  ['ataque-de-manobra', 'Ataque de Manobra'],
  ['ataque-de-precisao', 'Ataque de Precisão'],
  ['ataque-desarmante', 'Ataque Desarmante'],
  ['ataque-estendido', 'Ataque Estendido'],
  ['ataque-provocante', 'Ataque Provocante'],
  ['ataque-trespassante', 'Ataque Trespassante'],
  ['contra-atacar', 'Contra-Atacar'],
  ['derrubar', 'Derrubar'],
  ['golpe-distrativo', 'Golpe Distrativo'],
  ['golpe-do-comandante', 'Golpe do Comandante'],
  ['inspirar', 'Inspirar'],
  ['passo-evasivo', 'Passo Evasivo'],
]);

/** Ids are the terrain keys of the feature's `mechanics.spellsByTerrain`. */
const TERRAINS = options([
  ['artico', 'Ártico'],
  ['costa', 'Costa'],
  ['deserto', 'Deserto'],
  ['floresta', 'Floresta'],
  ['montanha', 'Montanha'],
  ['pantano', 'Pântano'],
  ['planicie', 'Planície'],
  ['subterraneo', 'Subterrâneo'],
]);

/** Ids are the keys of the feature's `mechanics.damageTypes`. */
const DRACONIC_ANCESTORS = options([
  ['azul', 'Azul'],
  ['branco', 'Branco'],
  ['bronze', 'Bronze'],
  ['cobre', 'Cobre'],
  ['latão', 'Latão'],
  ['negro', 'Negro'],
  ['ouro', 'Ouro'],
  ['prata', 'Prata'],
  ['verde', 'Verde'],
  ['vermelho', 'Vermelho'],
]);

/** Disciplines open at 3rd level (Elemental Attunement is known for free). */
const DISCIPLINES = options([
  ['chicote-de-agua', 'Chicote de Água'],
  ['golpe-de-varredura-cauterizante', 'Golpe de Varredura Cauterizante'],
  ['investida-dos-espiritos-da-ventania', 'Investida dos Espíritos da Ventania'],
  ['moldar-o-rio-corrente', 'Moldar o Rio Corrente'],
  ['presas-da-serpente-de-fogo', 'Presas da Serpente de Fogo'],
  ['punho-do-ar-continuo', 'Punho do Ar Contínuo'],
  ['punho-dos-quatro-trovoes', 'Punho dos Quatro Trovões'],
]);

const TOTEMS = options([
  ['aguia', 'Águia'],
  ['lobo', 'Lobo'],
  ['urso', 'Urso'],
]);

const HUNTERS_PREY = options([
  ['assassino-de-colossos', 'Assassino de Colossos'],
  ['matador-de-gigantes', 'Matador de Gigantes'],
  ['destruidor-de-hordas', 'Destruidor de Hordas'],
]);

const COMPANIONS = options([
  ['arminho-gigante', 'Arminho Gigante'],
  ['javali', 'Javali'],
  ['gorila', 'Gorila'],
  ['lobo', 'Lobo'],
  ['mula', 'Mula'],
  ['pantera', 'Pantera'],
  ['texugo-gigante', 'Texugo Gigante'],
  ['urso-negro', 'Urso Negro'],
]);

const heavyArmor: Effect = { type: 'armorProficiency', armor: 'heavy' };
const martial: Effect = { type: 'weaponProficiency', weapon: 'martial' };
/** Knowledge Domain: two of these skills, with expertise in both. */
const KNOWLEDGE_SKILLS: Effect = {
  type: 'skillChoice',
  count: 2,
  from: ['arcana', 'history', 'nature', 'religion'],
  expertise: true,
};

export const SUBCLASS_EFFECTS: Record<string, Effect[]> = {
  // Bard
  'colegio-do-conhecimento': [{ type: 'skillChoice', count: 3 }],
  'colegio-da-bravura': [
    { type: 'armorProficiency', armor: 'medium' },
    { type: 'armorProficiency', armor: 'shield' },
    martial,
  ],
  // Barbarian
  'caminho-do-guerreiro-totemico': [{ type: 'option', id: 'totemSpirit', choose: 1, options: TOTEMS }],
  // Cleric
  'dominio-da-vida': [heavyArmor],
  'dominio-da-tempestade': [heavyArmor, martial],
  'dominio-da-guerra': [heavyArmor, martial],
  'dominio-da-natureza': [
    heavyArmor,
    { type: 'cantripChoice', count: 1, list: 'druida', ability: 'wis' },
    { type: 'skillChoice', count: 1, from: ['animalHandling', 'nature', 'survival'] },
  ],
  'dominio-do-conhecimento': [
    { type: 'languageChoice', count: 2 },
    KNOWLEDGE_SKILLS,
  ],
  // Druid
  'circulo-da-terra': [
    { type: 'cantripChoice', count: 1, list: 'druida', ability: 'wis' },
    { type: 'option', id: 'landTerrain', choose: 1, options: TERRAINS },
  ],
  // Fighter
  'mestre-de-batalha': [
    { type: 'option', id: 'maneuvers', choose: 3, options: MANEUVERS },
    { type: 'toolChoice', count: 1, category: 'artisanTool' },
  ],
  // Monk
  'caminho-dos-quatro-elementos': [{ type: 'option', id: 'elementalDiscipline', choose: 1, options: DISCIPLINES }],
  // Rogue
  assassino: [
    { type: 'tool', tool: 'kit-de-disfarce' },
    { type: 'tool', tool: 'kit-de-venenos' },
  ],
  // Ranger
  'conclave-do-cacador': [{ type: 'option', id: 'huntersPrey', choose: 1, options: HUNTERS_PREY }],
  'conclave-da-besta': [{ type: 'option', id: 'animalCompanion', choose: 1, options: COMPANIONS }],
  // Sorcerer
  'linhagem-draconica': [
    { type: 'option', id: 'draconicAncestor', choose: 1, options: DRACONIC_ANCESTORS },
    { type: 'language', language: 'Dracônico' },
    { type: 'hpPerLevel', amount: 1 },
    { type: 'unarmoredAC', base: 13, abilities: ['dex'] },
  ],
};
