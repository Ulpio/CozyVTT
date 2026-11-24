/**
 * Text fields shared by every system's sheet schema, each held to its limit
 * in sheetLimits.ts.
 */

import { z } from 'zod';
import { SHEET_LONG_TEXT_MAX, SHEET_NAME_MAX, SHEET_SHORT_TEXT_MAX } from './sheetLimits';

/**
 * The character's own name on the sheet (`characterName`). Saving a sheet
 * copies it into the character's name column, so it has that column's limit.
 */
export const sheetCharacterNameSchema = z
  .string()
  .min(1)
  .max(SHEET_NAME_MAX, `O nome de um personagem pode ter no máximo ${SHEET_NAME_MAX} caracteres.`);

/**
 * Any other one-line box on a sheet: a class, a damage roll, an item's name,
 * one entry of a list.
 */
export const sheetShortTextSchema = z
  .string()
  .max(SHEET_SHORT_TEXT_MAX, `Pode ter no máximo ${SHEET_SHORT_TEXT_MAX.toLocaleString('pt-BR')} caracteres.`);

/**
 * A box that holds paragraphs: notes, a description, a backstory. Also any
 * field an older sheet may have used for a paragraph, so a sheet saved before
 * the limits existed can still be saved.
 */
export const sheetLongTextSchema = z
  .string()
  .max(SHEET_LONG_TEXT_MAX, `Pode ter no máximo ${SHEET_LONG_TEXT_MAX.toLocaleString('pt-BR')} caracteres.`);
