import { describe, it, expect } from 'vitest';
import { checkChoices, checkFor, passivePerception } from '../secretCheck';

const ability = (modifier: number) => ({ score: 10 + modifier * 2, modifier });
const stats = { strength: ability(3), dexterity: ability(1), constitution: ability(2), intelligence: ability(0), wisdom: ability(1), charisma: ability(0) };
const fighter = {
  proficiencyBonus: 2, level: 3, stats,
  skills: { perception: { proficient: true, expertise: false, bonus: 0, otherBonus: 0 }, athletics: { proficient: true, expertise: false, bonus: 0, otherBonus: 0 } },
  savingThrows: { strength: { proficient: true, bonus: 0, otherBonus: 0 } },
};
const wizard = {
  proficiencyBonus: 2, level: 3, stats: { ...stats, intelligence: ability(3) },
  skills: { perception: { proficient: false, expertise: false, bonus: 0, otherBonus: 0 }, arcana: { proficient: true, expertise: false, bonus: 0, otherBonus: 0 } },
};

describe('checkChoices', () => {
  it('lists Perception under skills once for a fighter and a wizard', () => {
    const choices = checkChoices([{ gameSystem: 'FIFTH_EDITION', data: fighter }, { gameSystem: 'FIFTH_EDITION', data: wizard }]);
    expect(choices.filter((c) => c.group === 'skills' && c.label === 'Perception')).toHaveLength(1);
    expect(choices.some((c) => c.label === 'Arcana')).toBe(true);
    expect(choices.some((c) => c.label === 'Athletics')).toBe(true);
  });

  it('groups skills, then abilities, then saves', () => {
    const groups = checkChoices([{ gameSystem: 'FIFTH_EDITION', data: fighter }]).map((c) => c.group);
    expect(groups).toEqual([...groups].sort((a, b) => ['skills', 'abilities', 'savingThrows'].indexOf(a) - ['skills', 'abilities', 'savingThrows'].indexOf(b)));
    expect(groups).toContain('savingThrows');
  });

  it('lists a d100 skill and rolls it as a percentage', () => {
    const sheet = { characteristics: { STR: 50 }, skills: { status: { value: 30 } } };
    const choices = checkChoices([{ gameSystem: 'HORROR_D100', data: sheet }]);
    const spot = choices.find((c) => c.group === 'skills' && c.label === 'Status');
    expect(spot).toBeDefined();
    expect(checkFor('HORROR_D100', sheet, spot!)?.expression).toBe('1d100');
  });
});

describe('checkFor', () => {
  it('gives the sheet\'s own bonus, or null when it has no such check', () => {
    const key = { group: 'skills' as const, label: 'Perception' };
    expect(checkFor('FIFTH_EDITION', fighter, key)?.expression).toBe('1d20+3');
    expect(checkFor('FIFTH_EDITION', fighter, { group: 'skills', label: 'Arcana' })).toBeNull();
  });
});

describe('passivePerception', () => {
  it('uses the stored value', () => {
    expect(passivePerception('FIFTH_EDITION', { ...fighter, passivePerception: 17 })).toBe(17);
  });
  it('computes 10 + bonus + other bonus otherwise', () => {
    expect(passivePerception('FIFTH_EDITION', fighter)).toBe(13);
    expect(passivePerception('FIFTH_EDITION', { ...fighter, passivePerceptionBonus: 5 })).toBe(18);
  });
  it('is none for other systems and empty sheets', () => {
    expect(passivePerception('FANTASY_D20', fighter)).toBeNull();
    expect(passivePerception('FIFTH_EDITION', null)).toBeNull();
  });
});
