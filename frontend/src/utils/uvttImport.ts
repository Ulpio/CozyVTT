import i18n from '@/i18n';

// ============================================
// Importing a Universal VTT file
//
// A UVTT holds one map image and the geometry that belongs with it. Two things
// about a file can need the GM's answer before it becomes a map.
//
// Some exporters crop the image to part of the map and then write out the walls
// for the whole of it, so the import would land a map with bare areas and walls
// standing in them. Those walls cannot even block sight, because the visibility
// pass stops at the map's own edges.
//
// And a file may carry walls for its furniture, pillars and crates, kept apart
// from the architecture in `objects_line_of_sight`. They block sight like any
// other wall, but whether a table should is the GM's call.
//
// The server answers 409 with `UVTT_IMPORT_NEEDS_CONFIRMATION` and creates
// nothing until it is told to go ahead. What follows reads that reply and puts
// it into words.
// ============================================

/** How much of a file's geometry falls outside its map image. */
export interface UvttOutOfBounds {
  walls: number;
  doors: number;
  lights: number;
}

/** What the server wants an answer about before importing. */
export interface UvttImportDecision {
  outOfBounds: UvttOutOfBounds;
  /** Wall segments the file keeps for its furniture. */
  objectWalls: number;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The counts carried by a `UVTT_IMPORT_NEEDS_CONFIRMATION` refusal.
 *
 * Returns undefined when the body carries nothing to decide, so a caller can
 * fall back to the plain message instead of a dialog full of zeroes.
 */
export function uvttImportDecision(err: unknown): UvttImportDecision | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const response = (err as { response?: unknown }).response;
  if (!response || typeof response !== 'object') return undefined;
  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return undefined;

  const body = data as { outOfBounds?: unknown; objectWalls?: unknown };
  const raw = body.outOfBounds && typeof body.outOfBounds === 'object'
    ? (body.outOfBounds as Record<string, unknown>)
    : {};

  const decision: UvttImportDecision = {
    outOfBounds: {
      walls: count(raw.walls),
      doors: count(raw.doors),
      lights: count(raw.lights),
    },
    objectWalls: count(body.objectWalls),
  };

  const { walls, doors, lights } = decision.outOfBounds;
  return walls + doors + lights + decision.objectWalls > 0 ? decision : undefined;
}

/** "79 walls and 20 doors", skipping whatever is zero. */
export function describeOutOfBounds(counts: UvttOutOfBounds): string {
  const parts: string[] = [];
  if (counts.walls > 0) parts.push(i18n.t('mapManager.uvtt.wall', { count: counts.walls }));
  if (counts.doors > 0) parts.push(i18n.t('mapManager.uvtt.door', { count: counts.doors }));
  if (counts.lights > 0) parts.push(i18n.t('mapManager.uvtt.light', { count: counts.lights }));
  if (parts.length === 0) return i18n.t('mapManager.uvtt.someWalls');
  if (parts.length === 1) return parts[0];
  return i18n.t('mapManager.uvtt.and', { list: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] });
}

/** Whether this file has geometry its picture does not cover. */
export function hasOutOfBounds(counts: UvttOutOfBounds): boolean {
  return counts.walls > 0 || counts.doors > 0 || counts.lights > 0;
}

/** The heading for the import dialog, which depends on what is being asked. */
export function uvttImportTitle(decision?: UvttImportDecision): string {
  if (decision && !hasOutOfBounds(decision.outOfBounds)) return i18n.t('mapManager.uvtt.furnitureTitle');
  return i18n.t('mapManager.uvtt.outsideTitle');
}

/** What the GM reads before deciding. */
export function uvttImportMessage(decision?: UvttImportDecision): string {
  if (!decision) {
    return i18n.t('mapManager.uvtt.outsideShort');
  }

  const parts: string[] = [];

  if (hasOutOfBounds(decision.outOfBounds)) {
    parts.push(i18n.t('mapManager.uvtt.outsideLong', { what: describeOutOfBounds(decision.outOfBounds) }));
  }

  if (decision.objectWalls > 0) {
    parts.push(i18n.t('mapManager.uvtt.furnitureLong', { walls: i18n.t('mapManager.uvtt.wall', { count: decision.objectWalls }) }));
  }

  return parts.join(' ');
}
