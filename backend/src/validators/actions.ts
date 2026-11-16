/**
 * What the action events (`action.list`, `action.resolve`, `action.undo`,
 * `action.concentration`) may carry over the socket.
 *
 * The client names the token, the action and the choices; the bonus and the
 * dice are never sent, they come from the stored sheet or stat block
 * (services/actionResolver.ts). The first thing wrong is the one reported,
 * in the order of the fields below.
 */

import { z } from 'zod';

const MAX_ID_LENGTH = 64;
const MAX_ACTION_ID_LENGTH = 200;

const id = (field: string) =>
  z
    .string({ error: `${field} required` })
    .min(1, { error: `${field} required` })
    .max(MAX_ID_LENGTH, { error: `${field} must be ${MAX_ID_LENGTH} characters or fewer` });

export const ActionListSchema = z.object(
  { mapId: id('mapId'), actorTokenId: id('actorTokenId') },
  { error: 'mapId and actorTokenId required' },
);

export const ActionRequestSchema = z.object(
  {
    mapId: id('mapId'),
    actorTokenId: id('actorTokenId'),
    actionId: z
      .string({ error: 'actionId required' })
      .min(1, { error: 'actionId required' })
      .max(MAX_ACTION_ID_LENGTH, { error: `actionId must be ${MAX_ACTION_ID_LENGTH} characters or fewer` }),
    targetTokenId: id('targetTokenId').optional(),
    mode: z.enum(['normal', 'advantage', 'disadvantage'], { error: 'mode must be normal, advantage or disadvantage' }),
    slotLevel: z
      .number({ error: 'slotLevel must be a whole number from 1 to 9' })
      .int({ error: 'slotLevel must be a whole number from 1 to 9' })
      .min(1, { error: 'slotLevel must be a whole number from 1 to 9' })
      .max(9, { error: 'slotLevel must be a whole number from 1 to 9' })
      .optional(),
    grip: z.enum(['one', 'two'], { error: 'grip must be one or two' }).optional(),
    replaceConcentration: z.boolean({ error: 'replaceConcentration must be true or false' }).optional(),
  },
  { error: 'Action request required' },
);

export const ActionUndoSchema = z.object({ messageId: id('messageId') }, { error: 'messageId required' });

export const ActionConcentrationSchema = z.object(
  { messageId: id('messageId'), targetTokenId: id('targetTokenId') },
  { error: 'messageId and targetTokenId required' },
);
