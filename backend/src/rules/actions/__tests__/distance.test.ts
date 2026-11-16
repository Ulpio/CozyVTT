import { tokenDistanceFeet } from '../distance';

const flat = { feetPerSquare: 5, diagonalRule: 'flat' };
const sq = (x: number, y: number, w = 1, h = 1) => ({ x, y, width: w, height: h });

describe('tokenDistanceFeet', () => {
  it('adjacent medium tokens are 5 ft apart', () => expect(tokenDistanceFeet(sq(0, 0), sq(1, 0), flat)).toBe(5));
  it('a large ogre next to a medium target is 5 ft away', () => expect(tokenDistanceFeet(sq(0, 0, 2, 2), sq(2, 1), flat)).toBe(5));
  it('flat diagonal counts one square each', () => expect(tokenDistanceFeet(sq(0, 0), sq(3, 3), flat)).toBe(15));
  it('alternating diagonal counts 5 then 10', () => expect(tokenDistanceFeet(sq(0, 0), sq(3, 3), { feetPerSquare: 5, diagonalRule: 'alternating' })).toBe(20));
  it('overlapping tokens are 0 apart', () => expect(tokenDistanceFeet(sq(0, 0), sq(0, 0), flat)).toBe(0));
  it('scales by feetPerSquare', () => expect(tokenDistanceFeet(sq(0, 0), sq(2, 0), { feetPerSquare: 10, diagonalRule: 'flat' })).toBe(20));
});
