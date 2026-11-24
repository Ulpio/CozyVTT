import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { inPortuguese } from '@/test/inPortuguese';

describe('plural forms added by the final review', () => {
  it('agree with the count in Portuguese', async () => {
    await inPortuguese(() => {
      expect(i18n.t('rollText.left', { count: 1 })).toBe('1 restante');
      expect(i18n.t('rollText.left', { count: 3 })).toBe('3 restantes');
      expect(i18n.t('rollText.left', { count: 0 })).toBe('0 restantes');
      expect(i18n.t('chat.shown', { count: 1 })).toBe('1 exibida');
      expect(i18n.t('chat.shown', { count: 4 })).toBe('4 exibidas');
      expect(i18n.t('chat.shown', { count: 0 })).toBe('0 exibidas');
      expect(i18n.t('gmWalls.deleteMany', { count: 1 })).toBe('Excluir 1 trecho');
      expect(i18n.t('gmWalls.deleteMany', { count: 2 })).toBe('Excluir 2 trechos');
    });
  });

  it('read the same for every count in English', () => {
    for (const count of [0, 1, 2]) {
      expect(i18n.t('rollText.left', { count })).toBe(`${count} left`);
      expect(i18n.t('chat.shown', { count })).toBe(`${count} shown`);
      expect(i18n.t('gmWalls.deleteMany', { count })).toBe(`Delete ${count} segments`);
    }
  });
});
