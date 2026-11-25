import { describe, expect, it } from 'vitest';
import {
  ABILITY_ICONS, ACTION_ICON, CHECK_ICON, COMMON_ICONS, DAMAGE_ICONS, FEATURE_ICON, SCHOOL_ICONS,
  SPELL_ICON, actionIconFor, checkIconFor,
} from '../actionIcons';

const spell = (extra: object) => ({ id: 's', group: 'spell' as const, resolution: 'cast' as const, ...extra });
const distinct = (m: Record<string, unknown>) => new Set(Object.values(m)).size === Object.keys(m).length;

describe('actionIcons', () => {
  it('every damage type, school, common action and ability has its own icon', () => {
    expect(Object.keys(DAMAGE_ICONS).sort()).toEqual(['ácido', 'concussão', 'cortante', 'elétrico', 'energia', 'fogo', 'frio', 'necrótico', 'perfurante', 'psíquico', 'radiante', 'trovejante', 'veneno'].sort());
    expect(Object.keys(SCHOOL_ICONS).sort()).toEqual(['abjuração', 'adivinhação', 'conjuração', 'encantamento', 'evocação', 'ilusão', 'necromancia', 'transmutação'].sort());
    expect(Object.keys(COMMON_ICONS).sort()).toEqual(['common:dash', 'common:disengage', 'common:dodge', 'common:help', 'common:hide']);
    expect(Object.keys(ABILITY_ICONS).sort()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
    for (const m of [DAMAGE_ICONS, SCHOOL_ICONS, COMMON_ICONS, ABILITY_ICONS]) expect(distinct(m)).toBe(true);
  });

  it('a healing spell shows the heart even with a damage line', () => {
    const heal = actionIconFor(spell({ resolution: 'heal', damageType: 'radiante' }));
    expect(heal).not.toBe(DAMAGE_ICONS.radiante);
    expect(heal).not.toBe(SPELL_ICON);
    expect(actionIconFor(spell({ resolution: 'heal' }))).toBe(heal);
  });

  it('a damaging spell shows its damage type', () => {
    expect(actionIconFor(spell({ damageType: 'fogo', school: 'evocação' }))).toBe(DAMAGE_ICONS.fogo);
    expect(actionIconFor(spell({ damageType: 'Fogo ' }))).toBe(DAMAGE_ICONS.fogo);
  });

  it('a spell without damage shows its school', () => {
    expect(actionIconFor(spell({ school: 'Ilusão' }))).toBe(SCHOOL_ICONS['ilusão']);
  });

  it('an unknown damage type falls back to the school, then the generic spell', () => {
    expect(actionIconFor(spell({ damageType: 'fire', school: 'evocação' }))).toBe(SCHOOL_ICONS['evocação']);
    expect(actionIconFor(spell({}))).toBe(SPELL_ICON);
  });

  it('a bonus-action common action shares its action\'s icon', () => {
    const c = (id: string) => ({ id, group: 'common' as const, resolution: 'post' as const });
    expect(actionIconFor(c('common:dash:bonus'))).toBe(COMMON_ICONS['common:dash']);
    expect(actionIconFor(c('common:dash'))).toBe(COMMON_ICONS['common:dash']);
    expect(actionIconFor(c('common:other'))).toBe(ACTION_ICON);
  });

  it('a feature shows the feature icon', () => {
    expect(actionIconFor({ id: 'f', group: 'feature', resolution: 'feature' })).toBe(FEATURE_ICON);
    expect(actionIconFor({ id: 'a', group: 'attack', resolution: 'attack' })).toBe(ACTION_ICON);
  });

  it('a check shows its ability\'s icon', () => {
    expect(checkIconFor('Strength')).toBe(ABILITY_ICONS.str);
    expect(checkIconFor('Sleight of Hand')).toBe(ABILITY_ICONS.dex);
    expect(checkIconFor('Luck')).toBe(CHECK_ICON);
    expect(checkIconFor(undefined)).toBe(CHECK_ICON);
  });

  it('a custom skill shows the icon of its own ability', () => {
    expect(checkIconFor("Thieves' Tools", 'dex')).toBe(ABILITY_ICONS.dex);
    expect(checkIconFor('Luck', 'wis')).toBe(ABILITY_ICONS.wis);
    expect(checkIconFor('Luck', undefined)).toBe(CHECK_ICON);
  });
});
