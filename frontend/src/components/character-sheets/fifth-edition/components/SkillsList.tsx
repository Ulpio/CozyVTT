/**
 * SkillsList Component
 *
 * Displays all 5E skills with proficiency/expertise indicators and bonuses.
 */

import React from 'react';
import { Circle, CheckCircle2, CircleDot, Dices } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { i18n as I18n } from 'i18next';
import { rollTarget } from '../../useSheetRolls';
import { checkPurpose, skillNameForRoll } from '@/utils/rollText';

interface Skill {
  proficient: boolean;
  expertise: boolean;
  bonus: number;
}

interface SkillsListProps {
  skills: {
    acrobatics: Skill;
    animalHandling: Skill;
    arcana: Skill;
    athletics: Skill;
    deception: Skill;
    history: Skill;
    insight: Skill;
    intimidation: Skill;
    investigation: Skill;
    medicine: Skill;
    nature: Skill;
    perception: Skill;
    performance: Skill;
    persuasion: Skill;
    religion: Skill;
    sleightOfHand: Skill;
    stealth: Skill;
    survival: Skill;
  };
  passivePerception?: number;
  /**
   * Checks the eighteen skills do not cover — tool proficiencies and homebrew.
   * Already carries a derived bonus, so this row draws exactly like the rest.
   */
  customSkills?: { name: string; proficient: boolean; expertise: boolean; bonus: number }[];
  /**
   * Click to roll. Omit outside campaign context. Each row is then a d20 test
   * whose roll menu the sheet's root opens on a right-click or a press and hold.
   */
  onRoll?: (expression: string, purpose: string) => void;
}

// Skill display names (camelCase to Title Case)
const SKILL_NAMES: Record<string, string> = {
  acrobatics: 'Acrobatics',
  animalHandling: 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  sleightOfHand: 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival',
};

/** A skill's name in the app's language; a key the app has no name for shows as English or as stored. */
function skillName(i18n: I18n, key: string): string {
  const path = `guidedCreation.skill.${key}`;
  return i18n.exists(path) ? i18n.t(path as never) : (SKILL_NAMES[key] ?? key);
}

/** The skills in alphabetical order of their names; any unknown key last. */
export function sortedSkillEntries<T>(skills: Record<string, T>): [string, T][] {
  const order = Object.keys(SKILL_NAMES);
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  return Object.entries(skills).sort(([a], [b]) => rank(a) - rank(b));
}

/**
 * SkillRow - Single skill display with proficiency indicator
 */
const SkillRow: React.FC<{
  name: string;
  /** The skill as the roll names it, in English: the table reads it. */
  rollName?: string;
  skill: Skill;
  onRoll?: (expression: string, purpose: string) => void;
}> = ({ name, rollName = name, skill, onRoll }) => {
  const formatBonus = (bonus: number): string => {
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  };

  const getProficiencyIcon = () => {
    if (skill.expertise) {
      return <CircleDot className="w-4 h-4 text-accent-ink" />;
    } else if (skill.proficient) {
      return <CheckCircle2 className="w-4 h-4 text-accent-ink" />;
    } else {
      return <Circle className="w-4 h-4 text-ink-muted" />;
    }
  };

  const expression = `1d20${formatBonus(skill.bonus)}`;
  const purpose = checkPurpose(skillNameForRoll(rollName));
  const isClickable = !!onRoll;

  return (
    <div
      className={`flex items-center justify-between py-1 px-2 rounded group ${
        isClickable ? 'cursor-pointer hover:bg-accent/10 select-none [-webkit-touch-callout:none]' : 'hover:bg-ink/5'
      }`}
      onClick={isClickable ? () => onRoll(expression, purpose) : undefined}
      {...(isClickable ? rollTarget(expression, purpose, 'FIFTH_EDITION') : undefined)}
    >
      <div className="flex items-center space-x-2">
        {getProficiencyIcon()}
        <span className="text-sm text-ink-secondary">{name}</span>
      </div>
      <div className="flex items-center gap-1">
        {isClickable && (
          <Dices className="w-3 h-3 text-accent-ink opacity-0 group-hover:opacity-60 [@media(hover:none)]:opacity-60 transition-opacity" />
        )}
        <span className="text-sm font-semibold text-ink min-w-12 text-right">
          {formatBonus(skill.bonus)}
        </span>
      </div>
    </div>
  );
};

/**
 * SkillsList - Displays all skills with proficiency indicators
 */
export const SkillsList: React.FC<SkillsListProps> = ({ skills, passivePerception, customSkills, onRoll }) => {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-2">
      {/* Skills, alphabetical and read down each column, as on the printed
          sheet. A character's stored skills keep whatever order they were
          saved in, so the order is set here. */}
      <div className="md:columns-2 gap-x-4">
        {sortedSkillEntries(skills).map(([key, skill]) => (
          <div key={key} className="break-inside-avoid">
            <SkillRow name={skillName(i18n, key)} rollName={SKILL_NAMES[key] ?? key} skill={skill} onRoll={onRoll} />
          </div>
        ))}
      </div>

      {/* The player's own — separated so it is obvious which are the standard
          eighteen and which this character added. */}
      {customSkills && customSkills.length > 0 && (
        <div className="pt-2 border-t border-ink/10">
          <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide px-2 mb-1">
            {t('sheet5e.yourOwnSkills')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            {customSkills.map((custom, index) => (
              <SkillRow
                key={`${custom.name}-${index}`}
                name={custom.name}
                skill={custom}
                onRoll={onRoll}
              />
            ))}
          </div>
        </div>
      )}

      {/* Passive Perception */}
      {passivePerception !== undefined && (
        <div className="pt-3 border-t border-ink/10">
          <div className="flex items-center justify-between px-2 py-1 bg-accent/10 rounded-sm">
            <span className="text-sm font-semibold text-ink-secondary">
              {t('sheet5e.passivePerception')}
            </span>
            <span className="text-lg font-bold text-accent-ink">
              {passivePerception}
            </span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="pt-3 border-t border-ink/10">
        <div className="flex flex-wrap gap-4 text-xs text-ink-secondary">
          <div className="flex items-center space-x-1">
            <Circle className="w-3 h-3 text-ink-muted" />
            <span>{t('sheet5e.notProficient')}</span>
          </div>
          <div className="flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-accent-ink" />
            <span>{t('sheet5e.proficient')}</span>
          </div>
          <div className="flex items-center space-x-1">
            <CircleDot className="w-3 h-3 text-accent-ink" />
            <span>{t('sheet5e.expertise')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
