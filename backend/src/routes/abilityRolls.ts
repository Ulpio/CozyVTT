import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated } from '../middleware/compose';
import { prisma } from '../config/database';
import { rollDice } from '../utils/dice-parser';
import { toJson } from '../utils/prisma-json';
import { broadcastToCampaign } from '../websocket/utils';
import logger from '../utils/logger';

const router = Router();

/** The scope of a roll made outside any campaign. */
export const NO_CAMPAIGN = 'none';
const SCORES = 6;
const EXPRESSION = '4d6kh3';

interface AbilityRollDto {
  id: string;
  rolls: { dice: number[]; kept: number[]; total: number }[];
}

const RollBodySchema = z.object({ campaignId: z.string().min(1).nullish() });

function toDto(row: { id: string; rolls: unknown }): AbilityRollDto {
  return { id: row.id, rolls: Array.isArray(row.rolls) ? (row.rolls as AbilityRollDto['rolls']) : [] };
}

/**
 * What the campaign says about the caller: null when there is no such
 * campaign or the caller is not in it (answered as not found), else whether
 * its GM lets players roll their scores.
 */
async function campaignAccess(userId: string, campaignId: string): Promise<{ mayRoll: boolean } | null> {
  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { campaign: { select: { abilityScoreMethods: true } } },
  });
  if (!membership) return null;
  return { mayRoll: membership.campaign.abilityScoreMethods.includes('ROLL') };
}

function notFound(res: Response) {
  return res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
}

/**
 * GET /api/characters/ability-roll?campaignId=
 * The caller's saved roll for that campaign (or for none), or null.
 * NOTE: mounted before the /api/characters/:id routes so the path is not read as an id.
 */
router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const campaignId = typeof req.query.campaignId === 'string' && req.query.campaignId ? req.query.campaignId : null;
    if (campaignId && !(await campaignAccess(userId, campaignId))) return notFound(res);

    const row = await prisma.abilityRoll.findUnique({
      where: { userId_scope: { userId, scope: campaignId ?? NO_CAMPAIGN } },
    });
    return res.status(200).json({ roll: row ? toDto(row) : null });
  } catch (error) {
    logger.error('Error reading ability roll', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to read ability roll' });
  }
});

/**
 * POST /api/characters/ability-roll { campaignId? }
 * Rolls six scores (4d6, lowest dropped) once; a second call returns the same
 * roll until a character is created from it.
 */
router.post('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsed = RollBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: 'campaignId must be a campaign id' });
    }
    const campaignId = parsed.data.campaignId ?? null;
    const scope = campaignId ?? NO_CAMPAIGN;

    let mayRoll = true;
    if (campaignId) {
      const access = await campaignAccess(userId, campaignId);
      if (!access) return notFound(res);
      mayRoll = access.mayRoll;
    }

    const existing = await prisma.abilityRoll.findUnique({ where: { userId_scope: { userId, scope } } });
    if (existing) return res.status(200).json({ roll: toDto(existing) });

    if (!mayRoll) {
      return res.status(403).json({ error: 'Forbidden', message: 'This campaign does not allow rolling ability scores' });
    }

    const results = Array.from({ length: SCORES }, () => rollDice(EXPRESSION));
    const rolls = results.map((result) => {
      const term = result.rolls[0];
      return { dice: term.results ?? [], kept: term.kept ?? [], total: result.total };
    });

    let row;
    try {
      row = await prisma.abilityRoll.create({ data: { userId, scope, campaignId, rolls: toJson(rolls) } });
    } catch (error) {
      // Another request made the roll first: it is the one that stands.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await prisma.abilityRoll.findUnique({ where: { userId_scope: { userId, scope } } });
        if (winner) return res.status(200).json({ roll: toDto(winner) });
      }
      throw error;
    }

    if (campaignId) await recordInDiceHistory(userId, campaignId, results);

    return res.status(200).json({ roll: toDto(row) });
  } catch (error) {
    logger.error('Error rolling ability scores', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to roll ability scores' });
  }
});

/**
 * The six scores go in the campaign's dice history and out to its table as any
 * roll does (websocket/handlers/dice.ts). The roll itself is saved: a failure
 * here is logged and does not undo it.
 */
async function recordInDiceHistory(userId: string, campaignId: string, results: ReturnType<typeof rollDice>[]): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    const stored = await prisma.$transaction(
      results.map((result) =>
        prisma.diceRoll.create({
          data: {
            campaignId,
            userId,
            expression: EXPRESSION,
            result: result.total,
            breakdown: toJson(result),
            purpose: 'Atributos',
            secret: false,
          },
        }),
      ),
    );
    stored.forEach((diceRoll, index) => {
      broadcastToCampaign(campaignId, 'dice.rolled', {
        id: diceRoll.id,
        userId,
        userName: user?.displayName ?? '',
        characterName: null,
        expression: EXPRESSION,
        result: results[index].total,
        breakdown: results[index],
        purpose: 'Atributos',
        timestamp: diceRoll.rolledAt.toISOString(),
        secret: false,
      });
    });
  } catch (error) {
    logger.error('Ability roll saved but not put in the dice history', { err: error, campaignId });
  }
}

export default router;
