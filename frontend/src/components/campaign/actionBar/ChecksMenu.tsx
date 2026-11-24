// ============================================
// The checks menu: ability checks, skills and saves of the actor, from the
// same roll lists the roll pickers use. A pick is rolled in the bar's mode.
// The names follow the app's language (the guided creation's ability and
// skill names); the rolled expression and purpose are the roll list's own.
// A name with no translation (a custom skill) keeps its label.
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

const ABILITY_KEYS = {
  Strength: 'guidedCreation.ability.str',
  Dexterity: 'guidedCreation.ability.dex',
  Constitution: 'guidedCreation.ability.con',
  Intelligence: 'guidedCreation.ability.int',
  Wisdom: 'guidedCreation.ability.wis',
  Charisma: 'guidedCreation.ability.cha',
} as const;

const SKILL_KEYS = {
  Acrobatics: 'guidedCreation.skill.acrobatics',
  'Animal Handling': 'guidedCreation.skill.animalHandling',
  Arcana: 'guidedCreation.skill.arcana',
  Athletics: 'guidedCreation.skill.athletics',
  Deception: 'guidedCreation.skill.deception',
  History: 'guidedCreation.skill.history',
  Insight: 'guidedCreation.skill.insight',
  Intimidation: 'guidedCreation.skill.intimidation',
  Investigation: 'guidedCreation.skill.investigation',
  Medicine: 'guidedCreation.skill.medicine',
  Nature: 'guidedCreation.skill.nature',
  Perception: 'guidedCreation.skill.perception',
  Performance: 'guidedCreation.skill.performance',
  Persuasion: 'guidedCreation.skill.persuasion',
  Religion: 'guidedCreation.skill.religion',
  'Sleight of Hand': 'guidedCreation.skill.sleightOfHand',
  Stealth: 'guidedCreation.skill.stealth',
  Survival: 'guidedCreation.skill.survival',
} as const;

type Translate = (key: never, options?: Record<string, unknown>) => string;

/** A check's name in the app's language from its English name; a name with no translation keeps it. */
export function checkName(section: (typeof SECTIONS)[number], english: string, t: Translate): string {
  const key = section === 'skills' ? SKILL_KEYS[english as keyof typeof SKILL_KEYS] : ABILITY_KEYS[english as keyof typeof ABILITY_KEYS];
  if (!key) return english;
  const name = t(key as never);
  return section === 'savingThrows' ? t('actionBar.checkSave' as never, { name }) : name;
}

/** The roll's label in the app's language: its name translated, its signed bonus kept. */
export function checkLabel(section: (typeof SECTIONS)[number], option: RollOption, t: Translate): string {
  const bonus = /\s([+-]\d+)$/.exec(option.label)?.[1];
  if (!bonus) return option.label;
  const english = option.testName ?? option.purpose.replace(/ (Saving Throw|Check)$/, '');
  const key = section === 'skills' ? SKILL_KEYS[english as keyof typeof SKILL_KEYS] : ABILITY_KEYS[english as keyof typeof ABILITY_KEYS];
  if (!key) return option.label;
  const name = t(key as never);
  if (section === 'savingThrows') return `${t('actionBar.checkSave' as never, { name })} ${bonus}`;

  return `${name} ${bonus}`;
}

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
              <ActionButton key={option.purpose + option.label} menu onClick={() => onRoll(option)}>
                {checkLabel(key, option, t as unknown as Translate)}
              </ActionButton>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
