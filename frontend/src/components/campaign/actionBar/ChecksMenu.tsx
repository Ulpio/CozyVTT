// ============================================
// The checks menu: ability checks, skills and saves of the actor, from the
// same roll lists the roll pickers use. A pick is rolled in the bar's mode.
// ============================================

import { useTranslation } from 'react-i18next';
import type { CharacterRolls, RollOption } from '@/utils/characterRolls';
import ActionButton from './ActionButton';

interface ChecksMenuProps {
  rolls: CharacterRolls | null;
  onRoll: (option: RollOption) => void;
}

const SECTIONS = ['abilities', 'skills', 'savingThrows'] as const;
const TITLE_KEYS = { abilities: 'actionBar.checkGroups.abilities', skills: 'actionBar.checkGroups.skills', savingThrows: 'actionBar.checkGroups.savingThrows' } as const;

export default function ChecksMenu({ rolls, onRoll }: ChecksMenuProps) {
  const { t } = useTranslation();
  const sections = SECTIONS.filter((key) => (rolls?.[key].length ?? 0) > 0);
  if (!rolls || sections.length === 0) return <p className="text-sm text-ink-muted">{t('actionBar.noChecks')}</p>;
  return (
    <div className="space-y-2">
      {sections.map((key) => (
        <section key={key}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-warm-gray">{t(TITLE_KEYS[key])}</h3>
          <div className="flex flex-wrap gap-1.5">
            {rolls[key].map((option) => (
              <ActionButton key={option.purpose + option.label} menu onClick={() => onRoll(option)}>{option.label}</ActionButton>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
