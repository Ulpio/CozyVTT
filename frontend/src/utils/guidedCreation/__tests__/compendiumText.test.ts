/**
 * Text from the books' PDFs carries private-use characters (a symbol font's
 * bullets, U+F020 and U+F0B7 among them) that draw as boxes and would be
 * copied into a saved sheet: bullets become "• ", the rest go.
 */
import { describe, it, expect } from 'vitest';
import { cleanCompendiumEntry, cleanCompendiumText } from '../compendiumText';

describe('cleanCompendiumText', () => {
  it('turns a symbol-font bullet and the space after it into "• "', () => {
    expect(cleanCompendiumText('Traits:\n Darkvision\n  Keen Senses')).toBe('Traits:\n• Darkvision\n• Keen Senses');
  });

  it('drops any other private-use character', () => {
    expect(cleanCompendiumText('Fireball and bolt')).toBe('Fireball and bolt');
  });

  it('leaves ordinary text, accents and real bullets alone', () => {
    const text = 'Ação bônus — • já é um marcador';
    expect(cleanCompendiumText(text)).toBe(text);
  });
});

describe('cleanCompendiumEntry', () => {
  it('cleans the text and every string in the data, at any depth, and nothing else', () => {
    const entry = {
      bookId: 'phb',
      slug: 'anao',
      name: 'Ano',
      text: ' Visão no escuro',
      data: {
        speed: 7.5,
        traits: [{ name: 'Resiliência', description: ' Vantagem' }],
        features: { first: { text: 'ab' } },
        flag: true,
        nothing: null,
      },
    };
    expect(cleanCompendiumEntry(entry)).toEqual({
      bookId: 'phb',
      slug: 'anao',
      name: 'Ano',
      text: '• Visão no escuro',
      data: {
        speed: 7.5,
        traits: [{ name: 'Resiliência', description: '• Vantagem' }],
        features: { first: { text: 'ab' } },
        flag: true,
        nothing: null,
      },
    });
  });
});
