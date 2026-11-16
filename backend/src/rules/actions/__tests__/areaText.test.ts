import { parseAreaText } from '../areaText';

describe('parseAreaText', () => {
  it('reads a sphere radius', () => {
    expect(parseAreaText({ shape: 'esfera', size: '6 m de raio' })).toEqual({ shape: 'sphere', sizeFt: 20 });
  });
  it('reads a line with a width', () => {
    expect(parseAreaText({ shape: 'linha', size: '30 m', width: '1,5 m' })).toEqual({ shape: 'line', sizeFt: 100, widthFt: 5 });
  });
  it('leaves the width out when absent', () => {
    expect(parseAreaText({ shape: 'linha', size: '18 metros' })).toEqual({ shape: 'line', sizeFt: 60 });
  });
  it('reads a square as a cube', () => {
    expect(parseAreaText({ shape: 'quadrado', size: '3 m' })).toEqual({ shape: 'cube', sizeFt: 10 });
    expect(parseAreaText({ shape: 'cubo', size: '3 m de lado' })).toEqual({ shape: 'cube', sizeFt: 10 });
  });
  it('reads cone, cylinder and an accented circle', () => {
    expect(parseAreaText({ shape: 'cone', size: '4,5 m' })).toEqual({ shape: 'cone', sizeFt: 15 });
    expect(parseAreaText({ shape: 'cilindro', size: '6 m' })).toEqual({ shape: 'cylinder', sizeFt: 20 });
    expect(parseAreaText({ shape: 'círculo', size: '6 m' })).toEqual({ shape: 'cylinder', sizeFt: 20 });
  });
  it('gives null for an unknown shape or size', () => {
    expect(parseAreaText({ shape: 'hexágono', size: '3 m' })).toBeNull();
    expect(parseAreaText({ shape: 'esfera', size: 'grande' })).toBeNull();
  });
});
