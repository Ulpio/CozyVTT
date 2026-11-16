import type { AreaShape, AreaSpec } from '../../utils/areaGeometry';
import { metresToFeet } from './rangeText';

const SHAPES: Record<string, AreaShape> = {
  esfera: 'sphere',
  cilindro: 'cylinder',
  circulo: 'cylinder',
  cubo: 'cube',
  quadrado: 'cube',
  cone: 'cone',
  linha: 'line',
};

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** The first metre figure in a text ("6 m de raio", "4,5 m", "18 metros") in feet, or null. */
function feetFrom(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(text);
  if (!m) return null;
  return metresToFeet(parseFloat(m[1].replace(',', '.')));
}

/**
 * Reads a curated spell area (Portuguese shape and size text) into an AreaSpec.
 * A line's width is left out when absent; consumers default it to 5 ft.
 * Anything it does not understand gives null.
 */
export function parseAreaText(area: { shape: string; size: string; width?: string }): AreaSpec | null {
  const shape = SHAPES[plain(area.shape)];
  const sizeFt = feetFrom(area.size);
  if (!shape || sizeFt === null) return null;
  const spec: AreaSpec = { shape, sizeFt };
  if (shape === 'line' && area.width !== undefined) {
    const widthFt = feetFrom(area.width);
    if (widthFt !== null) spec.widthFt = widthFt;
  }
  return spec;
}
