/**
 * Renders one guided-creation step on the `CREATION_DATA` fixture with the
 * real choices reducer, and a Next button held by the step's own completeness
 * check, as the wizard does.
 */
import { render, screen } from '@testing-library/react';
import type { Campaign } from '@/types';
import { CREATION_DATA } from '@/utils/guidedCreation/__tests__/fixtures/creationData';
import type { CreationChoices } from '@/utils/guidedCreation/types';
import { STEPS, type StepId } from '../steps';
import type { AbilityRollState } from '../useAbilityRoll';
import { emptyChoices, useCreationState } from '../useCreationState';

const NO_ROLL: AbilityRollState = {
  roll: null,
  known: true,
  loading: false,
  lookupFailed: false,
  retry: () => {},
  rolling: false,
  failed: false,
  rollOnce: async () => null,
};

/** Standard array, STR first: 15 14 13 12 10 8. */
export const BASE_SCORES = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

export interface Harness {
  choices: () => CreationChoices;
}

function StepHarness({ id, initial, campaign, out }: { id: StepId; initial: Partial<CreationChoices>; campaign?: Campaign; out: Harness }) {
  const { choices, dispatch } = useCreationState(CREATION_DATA, () => ({
    ...emptyChoices('STANDARD_ARRAY'),
    baseScores: BASE_SCORES,
    ...initial,
  }));
  out.choices = () => choices;
  const step = STEPS.find((s) => s.id === id)!;
  const complete = step.isComplete({ data: CREATION_DATA, choices, campaign, roll: null, rollKnown: true });
  return (
    <>
      <step.Component
        data={CREATION_DATA}
        choices={choices}
        update={(patch) => dispatch({ type: 'update', patch })}
        campaign={campaign}
        roll={NO_ROLL}
      />
      <button type="button" disabled={!complete}>
        Next
      </button>
    </>
  );
}

export function renderStep(id: StepId, initial: Partial<CreationChoices>, campaign?: Campaign): Harness {
  const out: Harness = { choices: () => ({}) as CreationChoices };
  render(<StepHarness id={id} initial={initial} campaign={campaign} out={out} />);
  return out;
}

export const nextButton = () => screen.getByRole('button', { name: 'Next' });
