/**
 * What a `chat.message` over the socket may carry.
 *
 * Each refusal is worded as the handler worded it when it checked the payload
 * field by field: clients, the WebSocket guide and the tests match them. A
 * payload that is not an object, and a message that is blank once trimmed,
 * are both "Message content required". The length is counted before the
 * message is trimmed, and the message is stored trimmed. The first thing
 * wrong is the one reported, in the order of the fields below.
 *
 * `recipientId` makes the message a whisper to that member. One that is not
 * a user id is answered as one who is not in the campaign is, so the answer
 * says nothing more about the one than the other.
 */

import { z } from 'zod';
import { MAX_CHAT_MESSAGE_LENGTH } from './chatLimits';
import { normaliseMessageType } from '../legacy/gameSystemAliases';

export const CHAT_CONTENT_REFUSAL = 'Escreva uma mensagem.';
export const CHAT_TOO_LONG_REFUSAL = `Mensagem longa demais. O máximo é ${MAX_CHAT_MESSAGE_LENGTH} caracteres.`;
export const CHAT_TYPE_REFUSAL = 'Tipo de mensagem inválido. Deve ser PLAYER ou GM.';
export const CHAT_CLIENT_ID_REFUSAL = 'clientId deve ter de 1 a 64 letras, dígitos, hífens ou sublinhados';

/** What a whisper to its own sender is answered. */
export const WHISPER_SELF_REFUSAL = 'Você não pode sussurrar para si mesmo.';
/**
 * What a whisper to anyone but a current member is answered: someone outside
 * the campaign, someone removed from it, an id that names nobody or is not
 * an id at all. One answer for all of them, so it tells a script nothing
 * about who has an account.
 */
export const WHISPER_RECIPIENT_REFUSAL = 'Essa pessoa não está nesta campanha.';

/**
 * The types a client may ask for: a player's message, or the GM's. The GM's
 * value from an older version is read as GM.
 */
export const CHAT_TYPES = ['PLAYER', 'GM'] as const;

/** What a client may name a message with: a short id of its own making. */
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const ChatMessageSchema = z.object(
  {
    content: z
      .string({ error: CHAT_CONTENT_REFUSAL })
      .refine((text) => text.trim().length > 0, { error: CHAT_CONTENT_REFUSAL })
      .max(MAX_CHAT_MESSAGE_LENGTH, { error: CHAT_TOO_LONG_REFUSAL })
      .transform((text) => text.trim()),
    type: z.preprocess(normaliseMessageType, z.enum(CHAT_TYPES, { error: CHAT_TYPE_REFUSAL })).optional(),
    clientId: z
      .string({ error: CHAT_CLIENT_ID_REFUSAL })
      .regex(CLIENT_ID_PATTERN, { error: CHAT_CLIENT_ID_REFUSAL })
      .optional(),
    recipientId: z
      .string({ error: WHISPER_RECIPIENT_REFUSAL })
      .uuid({ error: WHISPER_RECIPIENT_REFUSAL })
      .optional(),
  },
  { error: CHAT_CONTENT_REFUSAL }
);
