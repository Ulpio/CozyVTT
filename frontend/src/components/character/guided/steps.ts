// ============================================
// The guided creation's steps, in order. The wizard reads only this list:
// a later step is added by appending a definition here (and its label under
// guidedCreation.steps in the locales).
// ============================================

import type { ComponentType } from 'react';
import type { Messages } from '@/i18n/locales/en';
import { abilityPickErrors, collectEffects } from '@/utils/guidedCreation/collectEffects';
import { abilitiesComplete, raceComplete, subclassesOf, type StepCheck, type StepProps } from './stepRules';
import { equipmentComplete, equipmentModel, inSkillsStep, spellModel, spellsComplete } from './stepModels';
import RaceStep from './RaceStep';
import ClassStep from './ClassStep';
import SubclassStep from './SubclassStep';
import BackgroundStep from './BackgroundStep';
import AbilitiesStep from './AbilitiesStep';
import SkillsStep from './SkillsStep';
import ClassChoicesStep from './ClassChoicesStep';
import EquipmentStep from './EquipmentStep';
import SpellsStep from './SpellsStep';

export type StepId = keyof Messages['guidedCreation']['steps'];

export interface StepDefinition {
  id: StepId;
  Component: ComponentType<StepProps>;
  /** Next is held until this holds. */
  isComplete: (check: StepCheck) => boolean;
  /** A step that does not apply is left out (the spells step for a non-caster). */
  applies?: (check: StepCheck) => boolean;
}

/** Nothing is left to pick among the choices a step shows. */
const noPending = (check: StepCheck, skillsStep: boolean) =>
  collectEffects(check.choices, check.data).pending.every((p) => inSkillsStep(p) !== skillsStep);

export const STEPS: StepDefinition[] = [
  { id: 'race', Component: RaceStep, isComplete: raceComplete },
  {
    id: 'class',
    Component: ClassStep,
    isComplete: ({ data, choices }) => data.classes.some((c) => c.slug === choices.classSlug),
  },
  {
    id: 'subclass',
    Component: SubclassStep,
    isComplete: ({ data, choices }) => subclassesOf(data, choices.classSlug).some((s) => s.slug === choices.subclassSlug),
  },
  {
    id: 'background',
    Component: BackgroundStep,
    isComplete: ({ data, choices }) => data.backgrounds.some((b) => b.slug === choices.backgroundSlug),
  },
  { id: 'abilities', Component: AbilitiesStep, isComplete: abilitiesComplete },
  { id: 'skills', Component: SkillsStep, isComplete: (check) => noPending(check, true) },
  {
    id: 'classChoices',
    Component: ClassChoicesStep,
    // A half-feat's +1 is owed here too.
    isComplete: (check) => noPending(check, false) && abilityPickErrors(check.choices, check.data, true).length === 0,
  },
  {
    id: 'equipment',
    Component: EquipmentStep,
    isComplete: ({ data, choices }) => {
      const model = equipmentModel(data, choices);
      return !!model && equipmentComplete(model, choices, data);
    },
  },
  {
    id: 'spells',
    Component: SpellsStep,
    applies: ({ data, choices }) => spellModel(data, choices) !== null,
    isComplete: ({ data, choices }) => {
      const model = spellModel(data, choices);
      return !model || spellsComplete(model);
    },
  },
];

/** The steps that apply to these choices, in order. */
export const stepsFor = (check: StepCheck) => STEPS.filter((s) => !s.applies || s.applies(check));
