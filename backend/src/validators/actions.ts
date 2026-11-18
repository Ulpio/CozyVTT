/**
 * What the action events (`action.list`, `action.resolve`, `action.undo`,
 * `action.concentration`, `action.save`, `action.saveRemaining`,
 * `action.undoTarget`, `action.pendingSaves`, `action.recharge`,
 * `action.rechargeReset`) may carry over the socket.
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

/** A point on the map in pixels: finite numbers. */
const point = (field: string) =>
  z.object(
    {
      x: z.number({ error: `${field} must be a point on the map` }).finite({ error: `${field} must be a point on the map` }),
      y: z.number({ error: `${field} must be a point on the map` }).finite({ error: `${field} must be a point on the map` }),
    },
    { error: `${field} must be a point on the map` },
  );

/** The most targets one action names (a breath on "each creature" is capped as many). */
const MAX_TARGETS = 20;

/** The most a pool-spending feature asks to spend at once (Lay on Hands is 5 a level: 100 at 20th). */
const MAX_AMOUNT = 100;

/** The most features one attack asks to add (a character has two or three that fit). */
const MAX_RIDERS = 5;

const mode = z.enum(['normal', 'advantage', 'disadvantage'], { error: 'mode must be normal, advantage or disadvantage' });

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
    targetTokenIds: z
      .array(id('targetTokenIds'), { error: 'targetTokenIds must be a list of token ids' })
      .min(1, { error: 'targetTokenIds must name at least one token' })
      .max(MAX_TARGETS, { error: `targetTokenIds must name ${MAX_TARGETS} tokens or fewer` })
      .optional(),
    area: z.object({ anchor: point('area.anchor'), aim: point('area.aim').optional() }, { error: 'area must give an anchor point' }).optional(),
    mode,
    slotLevel: z
      .number({ error: 'slotLevel must be a whole number from 1 to 9' })
      .int({ error: 'slotLevel must be a whole number from 1 to 9' })
      .min(1, { error: 'slotLevel must be a whole number from 1 to 9' })
      .max(9, { error: 'slotLevel must be a whole number from 1 to 9' })
      .optional(),
    grip: z.enum(['one', 'two'], { error: 'grip must be one or two' }).optional(),
    replaceConcentration: z.boolean({ error: 'replaceConcentration must be true or false' }).optional(),
    // How much of a pool a feature heals from (Lay on Hands); the pool itself is read from the sheet.
    amount: z
      .number({ error: `amount must be a whole number from 1 to ${MAX_AMOUNT}` })
      .int({ error: `amount must be a whole number from 1 to ${MAX_AMOUNT}` })
      .min(1, { error: `amount must be a whole number from 1 to ${MAX_AMOUNT}` })
      .max(MAX_AMOUNT, { error: `amount must be a whole number from 1 to ${MAX_AMOUNT}` })
      .optional(),
    // The features to add to a weapon attack's hit; the server checks each is one the attack lists.
    riders: z
      .array(
        z.object(
          {
            featureId: z
              .string({ error: 'riders.featureId required' })
              .min(1, { error: 'riders.featureId required' })
              .max(MAX_ACTION_ID_LENGTH, { error: `riders.featureId must be ${MAX_ACTION_ID_LENGTH} characters or fewer` }),
            slotLevel: z
              .number({ error: 'riders.slotLevel must be a whole number from 1 to 9' })
              .int({ error: 'riders.slotLevel must be a whole number from 1 to 9' })
              .min(1, { error: 'riders.slotLevel must be a whole number from 1 to 9' })
              .max(9, { error: 'riders.slotLevel must be a whole number from 1 to 9' })
              .optional(),
          },
          { error: 'each rider must name a featureId' },
        ),
        { error: 'riders must be a list' },
      )
      .max(MAX_RIDERS, { error: `riders must name ${MAX_RIDERS} features or fewer` })
      .optional(),
  },
  { error: 'Action request required' },
);

export const ActionUndoSchema = z.object({ messageId: id('messageId') }, { error: 'messageId required' });

export const ActionConcentrationSchema = z.object(
  { messageId: id('messageId'), targetTokenId: id('targetTokenId') },
  { error: 'messageId and targetTokenId required' },
);

export const ActionSaveSchema = z.object(
  { messageId: id('messageId'), targetTokenId: id('targetTokenId'), mode },
  { error: 'messageId, targetTokenId and mode required' },
);

export const ActionSaveRemainingSchema = z.object({ messageId: id('messageId') }, { error: 'messageId required' });

export const ActionUndoTargetSchema = z.object(
  { messageId: id('messageId'), targetTokenId: id('targetTokenId') },
  { error: 'messageId and targetTokenId required' },
);

/** `action.pendingSaves` carries nothing; anything sent with it is ignored. */
export const ActionPendingSavesSchema = z.unknown();

export const ActionRechargeSchema = z.object(
  { mapId: id('mapId'), tokenId: id('tokenId'), optionId: id('optionId') },
  { error: 'mapId, tokenId and optionId required' },
);
