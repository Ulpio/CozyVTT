import { parseRangeText, metresToFeet } from '../rangeText';

describe('parseRangeText', () => {
  it.each([
    ['Pessoal', { kind: 'self' }],
    ['Toque', { kind: 'touch' }],
    ['36 metros', { kind: 'feet', normal: 120 }],
    ['1,5 m', { kind: 'feet', normal: 5 }],
    ['24/96 m', { kind: 'feet', normal: 80, long: 320 }],
    ['alcance 3 m', { kind: 'feet', normal: 10 }],
    ['distância 24/96 m', { kind: 'feet', normal: 80, long: 320 }],
  ])('%s', (t, r) => expect(parseRangeText(t)).toEqual(r));
  it('unknown text is null', () => expect(parseRangeText('Visão')).toBeNull());
  it('metresToFeet rounds to 5', () => expect(metresToFeet(9)).toBe(30));
});
