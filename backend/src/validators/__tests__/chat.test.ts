/**
 * What a `chat.message` may carry, and the words it is refused with.
 *
 * The handler checked the payload field by field, and a client, the
 * WebSocket guide and the tests match its refusals word for word. The schema
 * keeps each of them: a payload that is not an object and a message that is
 * blank once trimmed are both "Escreva uma mensagem.", the length is
 * counted before trimming, and the message is stored trimmed. A whisper's
 * `recipientId` that is not a user id is refused as a recipient who is not
 * in the campaign is, so a script learns nothing more from the one than the
 * other.
 */

import { ChatMessageSchema } from '../chat';

/** The refusal a payload gets, or null when it is taken. */
function refusal(payload: unknown): string | null {
  const parsed = ChatMessageSchema.safeParse(payload);
  return parsed.success ? null : parsed.error.issues[0]?.message ?? '(no message)';
}

describe('ChatMessageSchema', () => {
  // The schema is checked before anything is read, so loading it loads no
  // database client: the module that makes one is replaced, in a registry of
  // this test's own, by one that says when it is loaded.
  it('loads no database client', () => {
    let loaded = false;
    jest.isolateModules(() => {
      jest.doMock('../../config/database', () => {
        loaded = true;
        return {};
      });
      jest.requireActual('../chat');
    });
    jest.dontMock('../../config/database');
    expect(loaded).toBe(false);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['text', 'Hello'],
    ['a list', ['Hello']],
    ['no content', {}],
    ['content that is not text', { content: 5 }],
    ['empty content', { content: '' }],
    ['blank content', { content: '   \n\t ' }],
    ['blank content over the length', { content: ' '.repeat(2001) }],
  ])('refuses %s with "Escreva uma mensagem."', (_what, payload) => {
    expect(refusal(payload)).toBe('Escreva uma mensagem.');
  });

  it('counts the length before trimming, and refuses past 2000 characters with the limit', () => {
    expect(refusal({ content: 'x'.repeat(2000) })).toBeNull();
    expect(refusal({ content: ` ${'x'.repeat(1999)} ` })).toBe('Mensagem longa demais. O máximo é 2000 caracteres.');
    expect(refusal({ content: 'x'.repeat(2001) })).toBe('Mensagem longa demais. O máximo é 2000 caracteres.');
  });

  it('gives the content back trimmed', () => {
    const parsed = ChatMessageSchema.parse({ content: '  Hello there \n' });
    expect(parsed.content).toBe('Hello there');
  });

  it.each([['SYSTEM'], ['WHISPER'], [null], [7]])('refuses the type %p with the type refusal', (type) => {
    expect(refusal({ content: 'Hi', type })).toBe('Tipo de mensagem inválido. Deve ser PLAYER ou GM.');
  });

  it('takes PLAYER, GM or no type', () => {
    expect(refusal({ content: 'Hi', type: 'PLAYER' })).toBeNull();
    expect(refusal({ content: 'Hi', type: 'GM' })).toBeNull();
    expect(refusal({ content: 'Hi' })).toBeNull();
  });

  it.each([[''], ['x'.repeat(65)], ['has space'], ['dot.ted'], [{ id: 1 }], [null]])('refuses the clientId %p with the clientId refusal', (clientId) => {
    expect(refusal({ content: 'Hi', clientId })).toBe('clientId deve ter de 1 a 64 letras, dígitos, hífens ou sublinhados');
  });

  it('takes a clientId of 1 to 64 letters, digits, hyphens or underscores', () => {
    expect(refusal({ content: 'Hi', clientId: 'a' })).toBeNull();
    expect(refusal({ content: 'Hi', clientId: `${'A-_9'.repeat(16)}` })).toBeNull();
  });

  it.each([['mara'], [''], [5], [null], ['00000000-0000-0000-0000-00000000000g']])('refuses the recipientId %p as a recipient who is not in the campaign', (recipientId) => {
    expect(refusal({ content: 'Hi', recipientId })).toBe('Essa pessoa não está nesta campanha.');
  });

  it('takes a recipientId that is a user id, or none', () => {
    const parsed = ChatMessageSchema.parse({ content: 'Hi', recipientId: '6c83a363-b51d-4d9c-a3a6-9edd72b24c83' });
    expect(parsed.recipientId).toBe('6c83a363-b51d-4d9c-a3a6-9edd72b24c83');
    expect(ChatMessageSchema.parse({ content: 'Hi' }).recipientId).toBeUndefined();
  });

  it('refuses the first thing wrong, in the order the handler checked them', () => {
    expect(refusal({ content: '', type: 'SYSTEM', clientId: '' })).toBe('Escreva uma mensagem.');
    expect(refusal({ content: 'x'.repeat(2001), type: 'SYSTEM' })).toBe('Mensagem longa demais. O máximo é 2000 caracteres.');
    expect(refusal({ content: 'Hi', type: 'SYSTEM', clientId: '' })).toBe('Tipo de mensagem inválido. Deve ser PLAYER ou GM.');
    expect(refusal({ content: 'Hi', clientId: '', recipientId: 'mara' })).toBe('clientId deve ter de 1 a 64 letras, dígitos, hífens ou sublinhados');
  });
});
