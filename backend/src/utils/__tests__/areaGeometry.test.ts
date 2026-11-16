import { cubeRect } from '../aoeGeometry';
import {
  placeAreaAtPoint,
  placeAreaFromCaster,
  rectInArea,
  squareInArea,
  type GridRules,
} from '../areaGeometry';

const GS = 50;
const grid: GridRules = { gridSize: GS, feetPerSquare: 5, coneRule: 'width-equals-distance' };

const inSquares = (area: Parameters<typeof squareInArea>[0], cols: number, rows: number) => {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (squareInArea(area, c, r, GS)) out.push(`${c},${r}`);
  return out;
};

describe('areaGeometry', () => {
  it('a 20 ft sphere is a 4 square radius around the centre of the square it is placed in', () => {
    // drawAoEOverlay pivots a non-exact sphere on the square centre, so (200,200) pivots on (225,225).
    const area = placeAreaAtPoint({ shape: 'sphere', sizeFt: 20 }, { x: 200, y: 200 }, undefined, grid);
    expect(area).toEqual({ kind: 'circle', centre: { x: 225, y: 225 }, radius: 200 });
    expect(squareInArea(area, 4, 4, GS)).toBe(true);
    expect(squareInArea(area, 8, 4, GS)).toBe(true); // exactly on the edge counts
    expect(squareInArea(area, 6, 6, GS)).toBe(true);
    expect(squareInArea(area, 7, 7, GS)).toBe(false); // 3,3 squares away: ~212 px
    expect(squareInArea(area, 9, 4, GS)).toBe(false);
    expect(squareInArea(area, 0, 0, GS)).toBe(false);
  });

  it('a 10 ft cube covers exactly two squares across', () => {
    const area = placeAreaAtPoint({ shape: 'cube', sizeFt: 10 }, { x: 200, y: 200 }, undefined, grid);
    expect(inSquares(area, 8, 8).sort()).toEqual(['4,4', '4,5', '5,4', '5,5']);
  });

  it('a 15 ft cone from a 1×1 caster aimed right covers 3 squares deep and never the caster square', () => {
    const caster = { x: 100, y: 100, width: 50, height: 50 };
    const area = placeAreaFromCaster({ shape: 'cone', sizeFt: 15 }, caster, { x: 1000, y: 125 }, grid);
    expect(squareInArea(area, 2, 2, GS)).toBe(false);
    expect(inSquares(area, 10, 5).sort()).toEqual(['3,2', '4,2', '5,1', '5,2', '5,3']);
    expect(squareInArea(area, 6, 2, GS)).toBe(false);
  });

  it('a 60 ft cone from a 3×3 dragon starts at its edge', () => {
    const dragon = { x: 0, y: 0, width: 150, height: 150 };
    const area = placeAreaFromCaster({ shape: 'cone', sizeFt: 60 }, dragon, { x: 1000, y: 75 }, grid);
    expect(squareInArea(area, 3, 1, GS)).toBe(true);
    expect(squareInArea(area, 2, 1, GS)).toBe(false);
  });

  it('a 30 ft × 5 ft line covers six squares in a row', () => {
    const caster = { x: 0, y: 100, width: 50, height: 50 };
    const area = placeAreaFromCaster({ shape: 'line', sizeFt: 30, widthFt: 5 }, caster, { x: 900, y: 125 }, grid);
    expect(inSquares(area, 10, 5).sort()).toEqual(['1,2', '2,2', '3,2', '4,2', '5,2', '6,2']);
  });

  it('a 2×2 token is in when only one of its squares is', () => {
    const area = placeAreaAtPoint({ shape: 'cube', sizeFt: 10 }, { x: 200, y: 200 }, undefined, grid); // squares 4..5
    expect(rectInArea(area, { x: 150, y: 150, width: 100, height: 100 }, GS)).toBe(true); // only its (4,4) square is in
    expect(rectInArea(area, { x: 300, y: 300, width: 100, height: 100 }, GS)).toBe(false);
  });

  it("placeAreaAtPoint matches drawAoEOverlay's cube rectangle", () => {
    const area = placeAreaAtPoint({ shape: 'cube', sizeFt: 10 }, { x: 213, y: 187 }, undefined, grid);
    const pivot = { x: 225, y: 175 };
    expect(area).toEqual({ kind: 'rect', ...cubeRect(pivot, GS, 2) });
  });

  it('a quarter-circle cone covers the squares in its sector', () => {
    const q: GridRules = { ...grid, coneRule: 'quarter-circle' };
    const area = placeAreaAtPoint({ shape: 'cone', sizeFt: 20 }, { x: 25, y: 125 }, { x: 900, y: 125 }, q);
    expect(squareInArea(area, 2, 2, GS)).toBe(true);
    expect(squareInArea(area, 0, 2, GS)).toBe(false);
  });
});
