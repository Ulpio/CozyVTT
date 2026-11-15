import { describe, expect, it } from 'vitest';
import { abilityIncreaseEffects, DRAGON_ANCESTRIES, raceEffects, RACE_EFFECTS } from '../raceRules';

describe('raceRules', () => {
  it('has the choices the data lacks', () => {
    expect(RACE_EFFECTS['meio-elfo']).toEqual([
      { type: 'abilityChoice', count: 2, amount: 1, exclude: ['cha'] },
      { type: 'skillChoice', count: 2 },
      { type: 'languageChoice', count: 1 },
    ]);
    expect(RACE_EFFECTS['humano-variante']).toContainEqual({ type: 'featChoice', count: 1 });
    expect(RACE_EFFECTS['alto-elfo']).toContainEqual({ type: 'cantripChoice', count: 1, list: 'mago', ability: 'int' });
    expect(RACE_EFFECTS['anao-da-colina']).toEqual([{ type: 'hpPerLevel', amount: 1 }]);
    expect(RACE_EFFECTS['elfo-da-floresta']).toEqual([{ type: 'speed', meters: 1.5 }]);
    expect(RACE_EFFECTS['anao-da-montanha']).toHaveLength(2);
  });
  it('lists ten dragon ancestries with a damage type', () => {
    expect(DRAGON_ANCESTRIES).toHaveLength(10);
    expect(new Set(DRAGON_ANCESTRIES.map((d) => d.id)).size).toBe(10);
    expect(DRAGON_ANCESTRIES.every((d) => d.effects.length === 1)).toBe(true);
  });
  it('gives each dragon its damage type', () => {
    const eff = (id: string) => DRAGON_ANCESTRIES.find((d) => d.id === id)?.effects;
    expect(eff('vermelho')).toEqual([{ type: 'resistance', damageType: 'fire' }]);
    expect(eff('prata')).toEqual([{ type: 'resistance', damageType: 'cold' }]);
  });
  it('combines race and subrace effects and converts increases', () => {
    expect(raceEffects('elfo', 'elfo-da-floresta')).toEqual([{ type: 'speed', meters: 1.5 }]);
    expect(raceEffects('humano')).toEqual([]);
    expect(abilityIncreaseEffects({ str: 2, cha: 1 })).toEqual([
      { type: 'ability', ability: 'str', amount: 2 },
      { type: 'ability', ability: 'cha', amount: 1 },
    ]);
  });
});
