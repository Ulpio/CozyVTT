/**
 * The sheets the guided creation builds (frontend buildSheet, one per class)
 * are what POST /api/characters stores: the 5e schema takes each as it is,
 * dropping nothing.
 *
 * The frontend's buildSheet test writes them to its fixtures/sheets folder.
 */

import fs from 'fs';
import path from 'path';
import { fifthEditionCharacterDataSchema } from '../fifthEdition.schema';

const dir = path.resolve(__dirname, '../../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];

describe('guided-creation sheets', () => {
  it('there is one per class', () => {
    expect(files).toHaveLength(12);
  });

  it.each(files)('%s parses unchanged', (file) => {
    const sheet = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const result = fifthEditionCharacterDataSchema.safeParse(sheet);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(result.success && result.data).toEqual(sheet);
  });
});
