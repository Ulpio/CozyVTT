// ============================================
// The guided creation's steps, in order. The wizard reads only this list:
// a later step is added by appending a definition here (and its label under
// guidedCreation.steps in the locales).
// ============================================

import type { ComponentType } from 'react';
import type { Messages } from '@/i18n/locales/en';
import { abilitiesComplete, raceComplete, subclassesOf, type StepCheck, type StepProps } from './stepRules';
import RaceStep from './RaceStep';
import ClassStep from './ClassStep';
import SubclassStep from './SubclassStep';
import BackgroundStep from './BackgroundStep';
import AbilitiesStep from './AbilitiesStep';
import ComingSoonStep from './ComingSoonStep';

export type StepId = keyof Messages['guidedCreation']['steps'];

export interface StepDefinition {
  id: StepId;
  Component: ComponentType<StepProps>;
  /** Next is held until this holds. */
  isComplete: (check: StepCheck) => boolean;
}

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
  // Stands in for steps 6 to 11 until they exist.
  { id: 'comingSoon', Component: ComingSoonStep, isComplete: () => false },
];
