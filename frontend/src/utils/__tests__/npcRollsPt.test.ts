import { describe, it, expect } from 'vitest';
import type { NpcStatBlock } from '@/types';
import { buildNpcRolls } from '../npcRolls';
import { checkLabel } from '@/components/campaign/actionBar/ChecksMenu';
import i18n from '@/i18n';
import { inPortuguese } from '@/test/inPortuguese';

const goblin: NpcStatBlock = {
  ac: 15,
  hpMax: 7,
  speed: '30 ft.',
  abilities: { str: 14, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  skills: { stealth: 6 },
  challengeRating: '1/4',
  actions: [],
};

describe('NPC checks in the GM action bar, in Portuguese', () => {
  it('name the ability in full, the way a character check does', async () => {
    await inPortuguese(() => {
      const rolls = buildNpcRolls(goblin);
      const t = i18n.t.bind(i18n) as never;
      expect(checkLabel('abilities', rolls.abilities[0], t)).toBe('Força +2');
      expect(checkLabel('savingThrows', rolls.savingThrows[0], t)).toContain('Força');
    });
  });
});
