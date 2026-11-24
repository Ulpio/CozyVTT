/**
 * What accepting a campaign invitation may carry: the characters to bring.
 *
 * Without a schema, a `characterIds` that was not a list of ids reached the
 * database and answered 500. Fifty is far more characters than one player
 * brings to a table, and keeps the lookup bounded.
 */

import { z } from 'zod';

export const MAX_CHARACTERS_PER_ACCEPT = 50;

export const acceptInvitationSchema = z.object({
  characterIds: z
    .array(z.string().min(1, 'Cada ID de personagem deve ser um texto não vazio.'), { error: 'characterIds deve ser uma lista de IDs de personagens.' })
    .max(MAX_CHARACTERS_PER_ACCEPT, `No máximo ${MAX_CHARACTERS_PER_ACCEPT} personagens podem ser levados de uma vez.`)
    .default([]),
});
