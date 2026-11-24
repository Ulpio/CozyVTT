/**
 * The English texts the client compares, which the socket layer must keep
 * word for word while every other refusal is written in Portuguese: the
 * sign-in check (`'Unauthorized'`), the dice panel's wait (`'Rate limit exceeded'`)
 * and the texts the GM tools' refusal mapper translates in the client
 * (frontend/src/utils/gmToolRefusal.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { SOCKET_CEILINGS } from '../shared';

const repo = path.resolve(__dirname, '../../../..');
const read = (file: string): string => fs.readFileSync(path.join(repo, file), 'utf8');

/** The English keys of gmToolRefusal's table, read from where the client defines them. */
function gmToolRefusalKeys(): string[] {
  const source = read('frontend/src/utils/gmToolRefusal.ts');
  const table = source.slice(source.indexOf('const KEYS'), source.indexOf('};'));
  const keys: string[] = [];
  for (const row of table.split('\n')) {
    const match = /^\s*'((?:[^'\\]|\\.)*)':/.exec(row) ?? /^\s*"((?:[^"\\]|\\.)*)":/.exec(row);
    if (match) keys.push(match[1]);
  }
  return keys;
}

describe('the client-compared socket texts', () => {
  it('answers a failed sign-in with exactly Unauthorized', () => {
    expect(read('backend/src/websocket/events.ts')).toContain("socket.emit('error', { message: 'Unauthorized' })");
  });

  it('starts the dice flood refusal with Rate limit exceeded', () => {
    expect(SOCKET_CEILINGS['dice.roll'].refusal.startsWith('Rate limit exceeded')).toBe(true);
  });

  it('keeps the give-item, notice and secret-check flood texts the client maps', () => {
    const keys = gmToolRefusalKeys();
    expect(keys).toContain(SOCKET_CEILINGS['character.item.give'].refusal);
    expect(keys).toContain(SOCKET_CEILINGS['gm.notice'].refusal);
    expect(keys).toContain(SOCKET_CEILINGS['gm.secretCheck'].refusal);
  });

  it('keeps the give-item, notice and secret-check failure texts the client maps', () => {
    const keys = gmToolRefusalKeys();
    expect(read('backend/src/websocket/handlers/characters.ts')).toContain("'Failed to give the item'");
    expect(read('backend/src/websocket/handlers/characters.ts')).toContain("'Failed to send the notice'");
    expect(read('backend/src/websocket/handlers/dice.ts')).toContain("'Failed to roll the secret check'");
    expect(keys).toEqual(expect.arrayContaining(['Failed to give the item', 'Failed to send the notice', 'Failed to roll the secret check']));
  });
});
