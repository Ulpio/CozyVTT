// ============================================
// Campaign request-body schemas.
// Replaces hand-rolled typeof checks on the create route with a Zod schema.
// On failure the route returns the same { error, message } 400 shape it
// always has, using the first issue's message.
// ============================================

import { z } from 'zod';
import { CampaignStatus } from '@prisma/client';
import { GameSystemSchema } from './gameSystem';
import { HEX_COLOR_PATTERN, SPIRIT_STYLE_PATTERN, isSafeVibeFilter } from '../utils/styleAllowlists';
import { CAMPAIGN_LIMITS } from './campaignLimits';

/** The ways a campaign lets players set ability scores: at least one, each once. */
const AbilityScoreMethodsSchema = z.array(z.enum(['POINT_BUY', 'STANDARD_ARRAY', 'ROLL']), {
  error: 'abilityScoreMethods deve ser uma lista de POINT_BUY, STANDARD_ARRAY ou ROLL',
}).min(1, 'abilityScoreMethods precisa de ao menos um método').max(3)
  .transform((methods) => [...new Set(methods)]);

const DetailLevelSchema = z.enum(['FAITHFUL', 'FLEXIBLE'], { error: 'detailLevel deve ser FAITHFUL ou FLEXIBLE' });

/** POST /api/campaigns */
export const CreateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'O nome da campanha é obrigatório.').max(CAMPAIGN_LIMITS.maxNameLength, `O nome da campanha deve ter no máximo ${CAMPAIGN_LIMITS.maxNameLength} caracteres.`),
  description: z.string().max(CAMPAIGN_LIMITS.maxDescriptionLength).optional(),
  gameSystem: GameSystemSchema.nullish(),
  // The compendium books it uses; left out, its system's books but the English SRD.
  bookIds: z.array(z.string().max(40), { error: 'bookIds deve ser uma lista de IDs de livros.' }).max(50).optional(),
  abilityScoreMethods: AbilityScoreMethodsSchema.optional(),
  detailLevel: DetailLevelSchema.optional(),
});

/** PUT /api/campaigns/:campaignId/books: the compendium books the campaign uses. */
export const CampaignBooksSchema = z.object({
  bookIds: z.array(z.string().max(40), { error: 'bookIds deve ser uma lista de IDs de livros.' }).max(50),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

/** PUT /api/campaigns/:campaignId/gm, and /dm as older versions named it */
export const TransferGMSchema = z.object({
  userId: z.string().uuid('Um membro da campanha deve ser indicado pelo ID de usuário.'),
});

export type TransferGMInput = z.infer<typeof TransferGMSchema>;

/** The longest a campaign invitation can be set to last. */
export const MAX_INVITE_EXPIRY_DAYS = 365;

/**
 * POST /api/campaigns/:campaignId/invite. `expiresInDays` omitted, null, zero
 * or negative means the invitation never expires; otherwise it is a whole
 * number of days, up to a year. `sendEmail` is read by the route itself, since
 * anything but `true` simply means no email.
 */
export const CampaignInviteSchema = z.object({
  userId: z.string({ error: 'O ID do usuário é obrigatório.' }).min(1, { error: 'O ID do usuário é obrigatório.' }),
  expiresInDays: z
    .number({ error: 'expiresInDays deve ser um número de dias.' })
    .int({ error: 'expiresInDays deve ser um número inteiro de dias.' })
    .max(MAX_INVITE_EXPIRY_DAYS, { error: `expiresInDays deve ser no máximo ${MAX_INVITE_EXPIRY_DAYS}.` })
    .nullable()
    .optional(),
});

/** A period's colour, filter and track, as every writer reads them. */
const vibePeriodLook = {
  hue: z.string().regex(HEX_COLOR_PATTERN, 'O matiz de um período deve ser uma cor #RRGGBB.'),
  // `abort` stops the check after it on an over-long value. Without it, Zod
  // runs every check in the chain whether or not an earlier one failed.
  filter: z
    .string()
    .max(200, { abort: true })
    .refine(isSafeVibeFilter, 'O filtro de um período só pode usar brightness(), saturate(), contrast() e hue-rotate().'),
  // An asset id, or none. A period sent without one has none.
  audio: z.string().max(500).nullable().optional().transform((audio) => audio ?? null),
};

/** One atmosphere period, as the period editor makes it. */
export const VibePeriodSchema = z.object({
  name: z.string().trim()
    .min(1, 'Um período precisa de um nome.')
    .max(CAMPAIGN_LIMITS.maxVibePeriodNameLength, `O nome de um período pode ter no máximo ${CAMPAIGN_LIMITS.maxVibePeriodNameLength} caracteres.`),
  ...vibePeriodLook,
}).strip();

/**
 * A campaign's atmosphere settings, as both settings routes save them
 * (`PUT /campaigns/:id/vibe` and `PUT /campaigns/:id`, through saveVibeSettings
 * in services/vibeSave.ts). `periods` is the part with a fixed shape; other
 * keys are stored as sent, which is why they pass through here, except
 * atmosphere audio, which the save keeps as stored.
 */
export const VibeSettingsSchema = z.object({
  enabled: z.boolean({ error: 'enabled deve ser true ou false.' }).optional(),
  periods: z.array(VibePeriodSchema)
    .min(1, 'A campanha precisa de ao menos um período de ambiente.')
    .max(CAMPAIGN_LIMITS.maxVibePeriods, `A campanha pode ter no máximo ${CAMPAIGN_LIMITS.maxVibePeriods} períodos de ambiente.`)
    .refine(
      (periods) => new Set(periods.map((p) => p.name.toLowerCase())).size === periods.length,
      'Cada período de ambiente precisa de um nome diferente.'
    ),
}).passthrough();

export type VibeSettingsInput = z.output<typeof VibeSettingsSchema>;

/**
 * Vibe settings as a campaign import reads them: the same look for each
 * period, without the editor's rules on names and counts, so an archive from
 * an older version keeps its periods.
 */
export const ImportVibeSettingsSchema = z.object({
  periods: z.array(z.object({ name: z.string().max(100), ...vibePeriodLook }).strip()).max(CAMPAIGN_LIMITS.maxVibePeriods),
}).passthrough();

const COOLDOWN_MESSAGE = 'chatCooldownSeconds deve ser um inteiro entre 1 e 300.';

/**
 * The statuses settings may set, between sessions. ACTIVE, PAUSED and
 * INACTIVE say where a session is, so only the session routes set them: one
 * set here put the campaign page out of step with its sessions.
 */
const SETTABLE_STATUSES = [CampaignStatus.PREPARATION, CampaignStatus.COMPLETED, CampaignStatus.ARCHIVED] as const;

/** PUT /api/campaigns/:campaignId. Every field optional; each is checked when present. */
export const UpdateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'O nome da campanha é obrigatório.').max(CAMPAIGN_LIMITS.maxNameLength, `O nome da campanha deve ter no máximo ${CAMPAIGN_LIMITS.maxNameLength} caracteres.`).optional(),
  description: z.string().max(CAMPAIGN_LIMITS.maxDescriptionLength, `A descrição deve ter no máximo ${CAMPAIGN_LIMITS.maxDescriptionLength} caracteres.`).nullable().optional(),
  status: z.enum(SETTABLE_STATUSES, {
    error: `Status inválido. Use um destes: ${SETTABLE_STATUSES.join(', ')}; iniciar, pausar e encerrar uma sessão definem os outros.`,
  }).optional(),
  gameSystem: GameSystemSchema.nullish(),
  vibeSettings: VibeSettingsSchema.optional(),
  spiritLayerEnabled: z.boolean({ error: 'spiritLayerEnabled deve ser true ou false.' }).optional(),
  spiritLayerStyle: z.string({ error: 'spiritLayerStyle deve ser um texto.' }).max(100, { abort: true })
    .regex(SPIRIT_STYLE_PATTERN, 'spiritLayerStyle deve ser wispy, ethereal, shadow, dream ou custom:#RRGGBB com um :<aparência> opcional.')
    .optional(),
  chatCooldownEnabled: z.boolean({ error: 'chatCooldownEnabled deve ser true ou false.' }).optional(),
  chatCooldownSeconds: z.number({ error: COOLDOWN_MESSAGE }).int(COOLDOWN_MESSAGE).min(1, COOLDOWN_MESSAGE).max(300, COOLDOWN_MESSAGE).optional(),
  playersMayDraw: z.boolean({ error: 'playersMayDraw deve ser true ou false.' }).optional(),
  abilityScoreMethods: AbilityScoreMethodsSchema.optional(),
  detailLevel: DetailLevelSchema.optional(),
});

export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
