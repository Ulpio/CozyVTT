import { z } from 'zod';
import { CoordinateSchema } from './maps';
import { MAP_LIMITS, MAX_EXPLORATION_REPORT_CELLS, MAX_FOG_CELLS, TOO_MANY_WALLS_MESSAGE, TOO_MANY_LIGHTS_MESSAGE } from './mapLimits';

/** What an add answers when the id it names is already on the map. */
export const DUPLICATE_WALL_ID_MESSAGE = 'Já existe uma parede com esse id neste mapa.';
export const DUPLICATE_LIGHT_ID_MESSAGE = 'Já existe uma luz com esse id neste mapa.';

export const WallSegmentSchema = z.object({
  id: z.string().uuid(),
  // Bounded (validators/maps.ts); where on the map is the route's check.
  x1: CoordinateSchema,
  y1: CoordinateSchema,
  x2: CoordinateSchema,
  y2: CoordinateSchema,
  type: z.enum(['wall', 'door-closed', 'door-open', 'door-locked', 'window']),
});

/**
 * Ids are unique within a map's list: an edit, a delete and sight all find a
 * wall or light by id, and two sharing one were each handled as the other.
 */
function refuseRepeatedIds(what: 'paredes' | 'luzes') {
  return (items: Array<{ id: string }>, ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      if (seen.has(item.id)) {
        ctx.addIssue({ code: 'custom', message: `Duas ${what} têm o mesmo id (${item.id}).`, path: [i, 'id'] });
      }
      seen.add(item.id);
    });
  };
}

/** Most wall segments, doors included, one map holds. */
export const MAX_WALL_SEGMENTS = MAP_LIMITS.maxWallSegments;
/** Most light sources one map holds. */
export const MAX_LIGHT_SOURCES = MAP_LIMITS.maxLightSources;

// What a wall or light past the map's cap answers (validators/mapLimits.ts).
export { TOO_MANY_WALLS_MESSAGE, TOO_MANY_LIGHTS_MESSAGE };

export const WallSegmentsArraySchema = z
  .array(WallSegmentSchema)
  .max(MAX_WALL_SEGMENTS, TOO_MANY_WALLS_MESSAGE)
  .superRefine(refuseRepeatedIds('paredes'));

// ── Light Sources ────────────────────────────────────────────────────────────

/** Base shape for a light source (without cross-field refinement). */
const LightSourceBaseShape = z.object({
  id: z.string().uuid(),
  x: CoordinateSchema,
  y: CoordinateSchema,
  brightRadius: z.number().min(0).max(100),
  dimRadius: z.number().min(0.5).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  enabled: z.boolean(),
});

export const LightSourceSchema = LightSourceBaseShape.refine(
  (obj) => obj.dimRadius >= obj.brightRadius,
  { message: 'O raio de penumbra não pode ser menor que o raio de luz forte.' }
);

export const LightSourcesArraySchema = z
  .array(LightSourceBaseShape)
  .max(MAX_LIGHT_SOURCES, TOO_MANY_LIGHTS_MESSAGE)
  .superRefine((lights, ctx) => {
    for (let i = 0; i < lights.length; i++) {
      if (lights[i].dimRadius < lights[i].brightRadius) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Luz ${i}: o raio de penumbra não pode ser menor que o raio de luz forte.`,
          path: [i, 'dimRadius'],
        });
      }
    }
  })
  .superRefine(refuseRepeatedIds('luzes'));

/** Partial schema for PATCH updates — all fields optional except id. */
export const LightSourceUpdateSchema = z.object({
  x: CoordinateSchema.optional(),
  y: CoordinateSchema.optional(),
  brightRadius: z.number().min(0).max(100).optional(),
  dimRadius: z.number().min(0.5).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  enabled: z.boolean().optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'Informe pelo menos um campo.' });

// ── Fog Operations ───────────────────────────────────────────────────────────

/**
 * What a reveal or hide naming more cells than the largest map has answers.
 * A cell is a grid square, so no box on any map names more.
 */
export const TOO_MANY_FOG_CELLS_MESSAGE =
  `Uma operação de névoa pode citar no máximo ${MAX_FOG_CELLS.toLocaleString('pt-BR')} quadrados. Use reveal_all ou hide_all para o mapa inteiro.`;

const FogCellsSchema = z.array(z.number().int().nonnegative()).max(MAX_FOG_CELLS, TOO_MANY_FOG_CELLS_MESSAGE);

export const FogOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('reveal'),
    cells: FogCellsSchema,
  }),
  z.object({
    op: z.literal('hide'),
    cells: FogCellsSchema,
  }),
  z.object({ op: z.literal('reveal_all') }),
  z.object({ op: z.literal('hide_all') }),
]);

// ── Explored memory ──────────────────────────────────────────────────────────

/**
 * A player's vision covered these fog cells. Bounded so a client cannot push
 * a whole large map every frame; the handler unions it with what is stored.
 */
export const ExplorationRevealSchema = z.object({
  mapId: z.string().uuid(),
  cells: z.array(z.number().int().nonnegative()).max(MAX_EXPLORATION_REPORT_CELLS),
  /** Whose memory to write. Only a GM may name someone else (Player Preview). */
  userId: z.string().uuid().optional(),
});
