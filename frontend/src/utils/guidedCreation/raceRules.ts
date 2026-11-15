import type { AbilityKey, Effect, OptionEffect } from './types';

const DRAGONS: Array<[string, string, string]> = [
  ['preto', 'Preto', 'acid'],
  ['azul', 'Azul', 'lightning'],
  ['latao', 'Latão', 'fire'],
  ['bronze', 'Bronze', 'lightning'],
  ['cobre', 'Cobre', 'acid'],
  ['ouro', 'Ouro', 'fire'],
  ['verde', 'Verde', 'poison'],
  ['vermelho', 'Vermelho', 'fire'],
  ['prata', 'Prata', 'cold'],
  ['branco', 'Branco', 'cold'],
];

export const DRAGON_ANCESTRIES: OptionEffect[] = DRAGONS.map(([id, name, damageType]) => ({
  id,
  name,
  effects: [{ type: 'resistance', damageType }],
}));

/** Only what the race/subrace data lacks; slugs and numbers, no book text. */
export const RACE_EFFECTS: Record<string, Effect[]> = {
  'meio-elfo': [
    { type: 'abilityChoice', count: 2, amount: 1, exclude: ['cha'] },
    { type: 'skillChoice', count: 2 },
    { type: 'languageChoice', count: 1 },
  ],
  humano: [{ type: 'languageChoice', count: 1 }],
  'humano-variante': [
    { type: 'abilityChoice', count: 2, amount: 1 },
    { type: 'skillChoice', count: 1 },
    { type: 'featChoice', count: 1 },
  ],
  draconato: [{ type: 'option', id: 'ancestry', choose: 1, options: DRAGON_ANCESTRIES }],
  'alto-elfo': [
    { type: 'cantripChoice', count: 1, list: 'mago', ability: 'int' },
    { type: 'languageChoice', count: 1 },
  ],
  'anao-da-colina': [{ type: 'hpPerLevel', amount: 1 }],
  'anao-da-montanha': [
    { type: 'armorProficiency', armor: 'light' },
    { type: 'armorProficiency', armor: 'medium' },
  ],
  'elfo-da-floresta': [{ type: 'speed', meters: 1.5 }],
};

/** Fixed `ability` effects from a race/subrace `abilityIncreases` map. */
export function abilityIncreaseEffects(
  increases: Partial<Record<AbilityKey, number>> | undefined,
): Effect[] {
  return Object.entries(increases ?? {}).map(([ability, amount]) => ({
    type: 'ability' as const,
    ability: ability as AbilityKey,
    amount: amount as number,
  }));
}

export function raceEffects(raceSlug: string, subraceSlug?: string): Effect[] {
  return [...(RACE_EFFECTS[raceSlug] ?? []), ...(subraceSlug ? (RACE_EFFECTS[subraceSlug] ?? []) : [])];
}
