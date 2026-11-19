import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fifthEditionCharacterDataSchema } from '../fifthEdition.schema';

const BASE = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets', readdirSync(path.resolve(__dirname, '../../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets')).filter((n) => n.endsWith('.json')).sort()[0]), 'utf8'));
const parse = (extra: Record<string, unknown>) => fifthEditionCharacterDataSchema.safeParse({ ...BASE, ...extra });

describe('5e inventory fields', () => {
  it('accepts an item id and a body slot', () => {
    const result = parse({ inventory: [{ name: 'Espada', id: 'inv-0', slot: 'both' }] });
    expect(result.success && result.data.inventory?.[0]).toMatchObject({ id: 'inv-0', slot: 'both' });
  });

  it('refuses an unknown slot', () => {
    expect(parse({ inventory: [{ name: 'Capacete', slot: 'head' }] }).success).toBe(false);
  });

  it('refuses an id longer than 64 characters', () => {
    expect(parse({ inventory: [{ name: 'X', id: 'a'.repeat(65) }] }).success).toBe(false);
  });

  it('accepts an attack linked to an item', () => {
    const result = parse({ attacks: [{ name: 'Espada', attackBonus: 5, itemId: 'inv-0' }] });
    expect(result.success && result.data.attacks?.[0].itemId).toBe('inv-0');
  });

  it('accepts ammunition to recover and refuses a negative count', () => {
    const ok = parse({ ammoToRecover: { 'flechas-20': 3 } });
    expect(ok.success && ok.data.ammoToRecover).toEqual({ 'flechas-20': 3 });
    expect(parse({ ammoToRecover: { 'flechas-20': -1 } }).success).toBe(false);
    expect(parse({ ammoToRecover: { 'flechas-20': 1.5 } }).success).toBe(false);
  });
});
