// ============================================
// One choice of any kind (skills, languages, tools, an option, expertise,
// the feat, weapons, cantrips or spells), its picks written where the kind
// stores them. Option and feat texts come from the compendium.
// ============================================

import { useTranslation } from 'react-i18next';
import type { Messages } from '@/i18n/locales/en';
import type { CreationData } from '@/utils/guidedCreation/buildSheet';
import type { ChoiceState } from '@/utils/guidedCreation/collectEffects';
import { LANGUAGES } from '@/utils/guidedCreation/languageRules';
import { availableSpells } from '@/utils/guidedCreation/spellRules';
import { SKILL_KEYS, type CreationChoices, type Effect, type SkillKey } from '@/utils/guidedCreation/types';
import { optionTexts } from './optionText';
import { PickGroup, type PickOption } from './parts';
import { picksPatch } from './stepModels';
import SpellPicker from './SpellPicker';

type OptionId = keyof Messages['guidedCreation']['choices']['option'];
type Source = keyof Messages['guidedCreation']['choices']['source'];

const LEVEL = 3;

export interface ChoiceGroupProps {
  state: ChoiceState;
  /** Every choice: background picks share one list, and nested choices name their option. */
  states: ChoiceState[];
  data: CreationData;
  choices: CreationChoices;
  update: (patch: Partial<CreationChoices>) => void;
  /** Languages the character speaks without picking. */
  known: string[];
}

/** The feature texts an option's paragraph can be cut from: race, class, subclass and the picked feat. */
export function featureSources(data: CreationData, choices: CreationChoices): string[] {
  const race = data.races.find((r) => r.slug === choices.raceSlug);
  const subrace = data.subraces.find((s) => s.slug === choices.subraceSlug);
  const cls = data.classes.find((c) => c.slug === choices.classSlug);
  const subclass = data.subclasses.find((s) => s.slug === choices.subclassSlug);
  const feat = data.feats.find((f) => f.slug === choices.optionPicks.feat?.[0]);
  return [
    ...(race?.data.traits ?? []),
    ...(subrace?.data.traits ?? []),
    ...(cls?.data.features ?? []).filter((f) => f.level <= LEVEL),
    ...(subclass?.data.features ?? []).filter((f) => f.level <= LEVEL),
  ]
    .map((n) => n.description)
    .concat(feat?.text ? [feat.text] : []);
}

export default function ChoiceGroup({ state, states, data, choices, update, known }: ChoiceGroupProps) {
  const { t, i18n } = useTranslation();
  const { effect } = state;
  // Each option's paragraph from the feature that lists them (a fighting style, an invocation...).
  const texts =
    effect.type === 'option'
      ? optionTexts(featureSources(data, choices), (state.options ?? []).map((o) => o.name))
      : new Map<string, string>();
  const onChange = (next: string[]) => update(picksPatch(choices, states, state, next));
  const skillName = (id: string) =>
    (SKILL_KEYS as readonly string[]).includes(id) ? t(`guidedCreation.skill.${id as SkillKey}`) : undefined;
  const optionLabel = (id: string) =>
    i18n.exists(`guidedCreation.choices.option.${id}`) ? t(`guidedCreation.choices.option.${id as OptionId}`) : id;

  // Where the choice comes from: the race, the class... or the option it sits under.
  const { scope } = state;
  const sourceOf = () => {
    if (scope.includes('.')) {
      const [optionId, pick] = scope.split('.');
      const parent = states.find((s) => s.id === optionId);
      return `${optionLabel(optionId)}: ${parent?.options?.find((o) => o.id === pick)?.name ?? pick}`;
    }
    return i18n.exists(`guidedCreation.choices.source.${scope}`) ? t(`guidedCreation.choices.source.${scope as Source}`) : scope;
  };
  const source = sourceOf();

  const kindLabel = (e: Effect): string => {
    switch (e.type) {
      case 'option':
        return optionLabel(e.id);
      case 'skillChoice':
        return t(e.orTool ? 'guidedCreation.choices.kind.skillOrTool' : 'guidedCreation.choices.kind.skillChoice');
      case 'languageChoice':
      case 'toolChoice':
      case 'expertiseChoice':
      case 'featChoice':
      case 'weaponChoice':
      case 'cantripChoice':
      case 'spellChoice':
        return t(`guidedCreation.choices.kind.${e.type}`);
      default:
        return e.type;
    }
  };
  const legend = `${kindLabel(effect)} · ${source}`;

  if (effect.type === 'cantripChoice' || effect.type === 'spellChoice') {
    const level = effect.type === 'cantripChoice' ? 0 : effect.level;
    const spells = availableSpells(data.spells, effect.list, level).filter((s) => s.data.level === level);
    return (
      <SpellPicker
        legend={legend}
        spells={spells as typeof data.spells}
        count={state.count}
        picks={state.picks}
        onChange={onChange}
      />
    );
  }

  let options: PickOption[];
  if (effect.type === 'languageChoice') {
    // Languages already spoken, or picked in another choice, are not offered again.
    const taken = new Set([
      ...known,
      ...states.filter((s) => s.kind === 'languageChoice' && s.id !== state.id).flatMap((s) => s.picks),
    ]);
    options = LANGUAGES.filter((l) => !taken.has(l) || state.picks.includes(l)).map((l) => ({ id: l, label: l }));
  } else if (effect.type === 'featChoice') {
    options = (state.options ?? []).map((o) => ({
      id: o.id,
      label: o.name,
      // A feat's text is long: only the picked one's is shown.
      description: state.picks.includes(o.id) ? data.feats.find((f) => f.slug === o.id)?.text || undefined : undefined,
    }));
  } else {
    options = (state.options ?? []).map((o) => ({
      id: o.id,
      label: skillName(o.id) ?? o.name,
      description: effect.type === 'option' ? texts.get(o.name) : undefined,
    }));
  }

  return <PickGroup legend={legend} count={state.count} options={options} picks={state.picks} onChange={onChange} />;
}
