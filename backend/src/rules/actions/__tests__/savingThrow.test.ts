import { readFileSync } from 'fs';
import { resolve } from 'path';
import { rollSave, saveSucceeds, characterSaveBonus, monsterSaveBonus, hasMagicResistance, damageAfterSave } from '../savingThrow';

const SHEETS = resolve(__dirname, '../../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const sheet = (name: string) => JSON.parse(readFileSync(resolve(SHEETS, `${name}.json`), 'utf8'));
const fixed = (n: number) => () => n;
const seq = (...v: number[]) => { let i = 0; return () => v[i++]; };

describe('rollSave', () => {
  it('adds the bonus to the d20', () => expect(rollSave(3, 'normal', fixed(20))).toEqual({ d20s: [20], natural: 20, total: 23 }));
  it('keeps the higher d20 with advantage and the lower with disadvantage', () => {
    expect(rollSave(0, 'advantage', seq(4, 17)).natural).toBe(17);
    expect(rollSave(0, 'disadvantage', seq(4, 17)).natural).toBe(4);
  });
  it('gives a natural 20 no special success', () => {
    const roll = rollSave(-20, 'normal', fixed(20));
    expect(roll.total).toBe(0);
    expect(saveSucceeds(roll.total, 5)).toBe(false);
  });
});

describe('saveSucceeds', () => {
  it('succeeds at the DC and fails below it', () => {
    expect(saveSucceeds(15, 15)).toBe(true);
    expect(saveSucceeds(4, 5)).toBe(false);
  });
});

describe('characterSaveBonus', () => {
  it('reads the sheet save', () => {
    expect(characterSaveBonus(sheet('clerigo'), 'wis')).toBe(5);
    expect(characterSaveBonus(sheet('clerigo'), 'cha')).toBe(3);
  });
  it('falls back to the ability modifier', () => {
    expect(characterSaveBonus({ stats: { dexterity: { modifier: 2 } } } as any, 'dex')).toBe(2);
    expect(characterSaveBonus({} as any, 'dex')).toBe(0);
  });
});

describe('monsterSaveBonus', () => {
  it('prefers the listed save, then the modifier, then the score', () => {
    const block = { savingThrows: { dex: 9 }, attributeModifiers: { dex: 1, con: 4 }, abilities: { dex: 12, con: 12, wis: 8 } };
    expect(monsterSaveBonus(block, 'dex')).toBe(9);
    expect(monsterSaveBonus(block, 'con')).toBe(4);
    expect(monsterSaveBonus(block, 'wis')).toBe(-1);
    expect(monsterSaveBonus(block, 'str')).toBe(0);
    expect(monsterSaveBonus(null, 'str')).toBe(0);
  });
});

describe('hasMagicResistance', () => {
  it('finds the trait ignoring case and accents', () => {
    expect(hasMagicResistance({ traits: [{ name: 'Visão no Escuro', description: '' }, { name: 'RESISTENCIA A MAGIA', description: '' }] })).toBe(true);
    expect(hasMagicResistance({ traits: [{ name: 'Resistência à Magia', description: '' }] })).toBe(true);
  });
  it('is false without it', () => {
    expect(hasMagicResistance({ traits: [{ name: 'Regeneração', description: '' }] })).toBe(false);
    expect(hasMagicResistance({})).toBe(false);
    expect(hasMagicResistance(null)).toBe(false);
  });
});

describe('damageAfterSave', () => {
  it('takes all on a failure, half rounded down on a success, none when no half', () => {
    expect(damageAfterSave(17, false, true)).toBe(17);
    expect(damageAfterSave(17, true, true)).toBe(8);
    expect(damageAfterSave(17, true, false)).toBe(0);
  });
});
