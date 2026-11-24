import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { inPortuguese } from '../inPortuguese';

describe('inPortuguese', () => {
  it('runs in pt-BR and restores English', async () => {
    const english = i18n.getFixedT('en')('common.tryAgain');
    const seen = await inPortuguese(() => {
      expect(i18n.language).toBe('pt-BR');
      expect(i18n.t('common.tryAgain')).not.toBe(english);
      return 'ok';
    });
    expect(seen).toBe('ok');
    expect(i18n.language).toBe('en');
  });

  it('restores English when the body throws', async () => {
    await expect(
      inPortuguese(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(i18n.language).toBe('en');
  });
});
