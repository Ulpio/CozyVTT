// ============================================
// The guided creation's choices. Every change is followed by pruning: picks
// the change made invalid (a subclass of another class, a fighting style the
// new class lacks, racial +1s the new race does not give...) are dropped, the
// rest kept, and what was dropped is reported so the wizard can say so.
// ============================================

import { useReducer, type Dispatch } from 'react';
import type { AbilityScoreMethod } from '@/types';
import { ABILITY_KEYS } from '@/utils/rules/fifthEdition';
import { validateAbilityPicks } from '@/utils/guidedCreation/abilities';
import type { CreationData } from '@/utils/guidedCreation/buildSheet';
import { abilityPicksOf, collectEffects, pruneChoices } from '@/utils/guidedCreation/collectEffects';
import { equipmentChoicesOf } from '@/utils/guidedCreation/equipmentRules';
import type { AbilityKey, CreationChoices } from '@/utils/guidedCreation/types';

export type CreationAction =
  /** Merge these fields into the choices, then prune. */
  | { type: 'update'; patch: Partial<CreationChoices> }
  /** The player has seen the notice. */
  | { type: 'dismissCleared' };

interface State {
  choices: CreationChoices;
  /** What the last changes dropped, as field paths ('subclassSlug', 'optionPicks.fightingStyle'). */
  cleared: string[];
}

export function emptyChoices(method: AbilityScoreMethod = 'POINT_BUY'): CreationChoices {
  return {
    raceSlug: '',
    classSlug: '',
    subclassSlug: '',
    backgroundSlug: '',
    method,
    baseScores: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 8])) as Record<AbilityKey, number>,
    racialChoices: {},
    skillPicks: [],
    expertisePicks: [],
    languagePicks: [],
    toolPicks: [],
    optionPicks: {},
    equipmentPicks: [],
    anyOfPicks: {},
    cantripSlugs: [],
    spellSlugs: [],
    preparedSlugs: [],
    details: { name: '' },
  };
}

const sameList = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Picks that hang on the class, subclass or background but are not the collectEffects rules'. */
function dropDependents(before: CreationChoices, out: CreationChoices, data: CreationData): CreationChoices {
  let next = out;
  if (next.classSlug !== before.classSlug) {
    next = { ...next, equipmentPicks: [], anyOfPicks: {} };
  } else if (next.backgroundSlug !== before.backgroundSlug) {
    // Background equipment choices come after the class's: keep the class's.
    const cls = data.classes.find((c) => c.slug === next.classSlug);
    const kept = cls ? equipmentChoicesOf(cls.data, undefined).length : 0;
    next = {
      ...next,
      equipmentPicks: next.equipmentPicks.slice(0, kept),
      anyOfPicks: Object.fromEntries(Object.entries(next.anyOfPicks).filter(([key]) => Number(key.split('.')[0]) < kept)),
    };
  }
  if (next.classSlug !== before.classSlug || next.subclassSlug !== before.subclassSlug) {
    next = { ...next, cantripSlugs: [], spellSlugs: [], preparedSlugs: [] };
  }
  // Racial +1s the race no longer gives, or no longer allows.
  const stored = next.racialChoices.abilityPicks;
  if (Array.isArray(stored) && stored.some(Boolean)) {
    const { effects } = collectEffects(next, data);
    const errors = validateAbilityPicks(effects, abilityPicksOf(next));
    if (errors.some((e) => e !== 'missingPick')) {
      const { abilityPicks: _dropped, ...rest } = next.racialChoices;
      next = { ...next, racialChoices: rest };
    }
  }
  return next;
}

/** The field paths `after` lost against `before`. */
function clearedBetween(before: CreationChoices, after: CreationChoices): string[] {
  const out: string[] = [];
  if (before.subraceSlug && after.subraceSlug !== before.subraceSlug) out.push('subraceSlug');
  if (before.subclassSlug && after.subclassSlug !== before.subclassSlug) out.push('subclassSlug');
  for (const [key, picks] of Object.entries(before.optionPicks)) {
    if (picks.length && !sameList(picks, after.optionPicks[key])) out.push(`optionPicks.${key}`);
  }
  const lists = [
    'skillPicks',
    'expertisePicks',
    'languagePicks',
    'toolPicks',
    'equipmentPicks',
    'cantripSlugs',
    'spellSlugs',
  ] as const;
  for (const key of lists) {
    if (before[key].length && !sameList(before[key], after[key])) out.push(key);
  }
  if (before.preparedSlugs?.length && !sameList(before.preparedSlugs, after.preparedSlugs)) out.push('preparedSlugs');
  if (Object.keys(before.anyOfPicks).length > Object.keys(after.anyOfPicks).length) out.push('anyOfPicks');
  const picks = before.racialChoices.abilityPicks;
  if (Array.isArray(picks) && picks.some(Boolean) && after.racialChoices.abilityPicks !== picks) {
    out.push('racialChoices.abilityPicks');
  }
  return out;
}

function reduce(state: State, action: CreationAction, data: CreationData | null): State {
  switch (action.type) {
    case 'dismissCleared':
      return state.cleared.length ? { ...state, cleared: [] } : state;
    case 'update': {
      const patched = { ...state.choices, ...action.patch };
      // Before the compendium has loaded every pick would look invalid.
      if (!data) return { ...state, choices: patched };
      const pruned = dropDependents(state.choices, pruneChoices(patched, data), data);
      const cleared = clearedBetween(patched, pruned);
      return { choices: pruned, cleared: cleared.length ? [...new Set([...state.cleared, ...cleared])] : state.cleared };
    }
    default: {
      const unreachable: never = action;
      throw new Error(`Unknown action: ${JSON.stringify(unreachable)}`);
    }
  }
}

export interface CreationState {
  choices: CreationChoices;
  dispatch: Dispatch<CreationAction>;
  /** What changes dropped since the notice was last dismissed. */
  cleared: string[];
}

/** `data` is the loaded compendium; null while it loads (nothing is pruned then). */
export function useCreationState(data: CreationData | null, initial?: () => CreationChoices): CreationState {
  const [state, dispatch] = useReducer(
    (s: State, a: CreationAction) => reduce(s, a, data),
    undefined,
    (): State => ({ choices: initial ? initial() : emptyChoices(), cleared: [] }),
  );
  return { choices: state.choices, dispatch, cleared: state.cleared };
}
