import { withFinalPeriod } from '../withFinalPeriod';

describe('withFinalPeriod', () => {
  it('adds the period a message lacks', () => {
    expect(withFinalPeriod('sem detalhes')).toBe('sem detalhes.');
  });
  it('does not double the period a message has', () => {
    expect(withFinalPeriod('Os metadados do token são grandes demais (máximo de 8 KB).')).toBe('Os metadados do token são grandes demais (máximo de 8 KB).');
  });
});
