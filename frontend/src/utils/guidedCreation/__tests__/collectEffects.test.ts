import { describe, expect, it } from 'vitest';
import type { BackgroundData, ClassData, FeatData, RaceData, SubclassData, SubraceData } from '../compendiumData';
import { collectEffects, pruneChoices, type RulesData } from '../collectEffects';
import type { CreationChoices, SkillKey } from '../types';

// Invented placeholder entries: just the fields the rules read, no book text.
const cls = (slug: string, choose: number, from: SkillKey[], savingThrows: ClassData['savingThrows']) => ({
  slug,
  name: slug,
  data: {
    hitDie: 8,
    savingThrows,
    proficiencies: { armor: [], weapons: [], tools: [] },
    skills: { choose, from },
    startingEquipment: [],
    subclassLevel: 3,
    features: [],
  } as ClassData,
});

const data: RulesData = {
  races: [
    { slug: 'humano', name: 'Humano', data: { size: 'Médio', speed: 9, traits: [], abilityIncreases: {} } as RaceData },
    { slug: 'elfo', name: 'Elfo', data: { size: 'Médio', speed: 9, traits: [], proficiencies: ['perception'], abilityIncreases: { dex: 2 } } as RaceData },
  ],
  subraces: [
    { slug: 'humano-variante', name: 'Variante', data: { parent: 'humano', traits: [] } as SubraceData },
  ],
  classes: [
    cls('guerreiro', 2, ['athletics', 'perception', 'survival'], ['str', 'con']),
    cls('mago', 2, ['arcana', 'history'], ['int', 'wis']),
    cls('ladino', 4, ['acrobatics', 'stealth', 'deception', 'perception', 'investigation'], ['dex', 'int']),
    cls('feiticeiro', 2, ['arcana', 'deception'], ['con', 'cha']),
  ],
  subclasses: [
    { slug: 'linhagem-draconica', name: 'Linhagem', data: { parent: 'feiticeiro', features: [] } as SubclassData },
    { slug: 'campeao', name: 'Campeão', data: { parent: 'guerreiro', features: [] } as SubclassData },
  ],
  backgrounds: [
    {
      slug: 'acolito',
      name: 'Acólito',
      data: { proficiencies: { skills: ['insight', 'religion'], tools: [] }, equipment: [], feature: { name: 'x', description: 'x' } } as BackgroundData,
    },
  ],
  feats: [
    { slug: 'robusto', name: 'Robusto', data: {} as FeatData },
    { slug: 'alerta', name: 'Alerta', data: {} as FeatData },
  ],
};

const base = (over: Partial<CreationChoices> = {}): CreationChoices => ({
  raceSlug: 'humano',
  classSlug: 'guerreiro',
  subclassSlug: '',
  backgroundSlug: 'acolito',
  method: 'STANDARD_ARRAY',
  baseScores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
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
  details: { name: '' },
  ...over,
});

describe('collectEffects', () => {
  it('lists an unpicked fighting style with its six options', () => {
    const { pending } = collectEffects(base(), data);
    const style = pending.find((p) => p.id === 'fightingStyle');
    expect(style).toMatchObject({ kind: 'option', count: 1 });
    expect(style?.options).toHaveLength(6);
  });

  it('applies a picked option and drops it from pending', () => {
    const { effects, pending } = collectEffects(base({ optionPicks: { fightingStyle: ['defesa'] } }), data);
    expect(pending.find((p) => p.id === 'fightingStyle')).toBeUndefined();
    expect(effects).toContainEqual({ type: 'acBonus', amount: 1, whenArmored: true });
  });

  it('lists the class skill choice and the class saves', () => {
    const { effects, pending } = collectEffects(base({ skillPicks: ['athletics'] }), data);
    expect(effects).toContainEqual({ type: 'save', ability: 'str' });
    const skills = pending.find((p) => p.kind === 'skillChoice');
    expect(skills?.count).toBe(1);
    expect(skills?.options?.map((o) => o.id)).toEqual(['perception', 'survival']);
  });

  it('offers rogue expertise only among proficient skills', () => {
    const choices = base({ raceSlug: 'elfo', classSlug: 'ladino', skillPicks: ['stealth', 'acrobatics', 'deception', 'investigation'] });
    const expertise = collectEffects(choices, data).pending.find((p) => p.kind === 'expertiseChoice');
    expect(expertise?.count).toBe(2);
    expect(expertise?.options?.map((o) => o.id).sort()).toEqual(
      ['acrobatics', 'deception', 'insight', 'investigation', 'perception', 'religion', 'stealth'].sort(),
    );
    const done = collectEffects({ ...choices, expertisePicks: ['stealth', 'perception'] }, data).pending;
    expect(done.find((p) => p.kind === 'expertiseChoice')).toBeUndefined();
  });

  it('gives the Draconic sorcerer hit points and unarmored AC', () => {
    const { effects } = collectEffects(base({ classSlug: 'feiticeiro', subclassSlug: 'linhagem-draconica' }), data);
    expect(effects).toContainEqual({ type: 'hpPerLevel', amount: 1 });
    expect(effects).toContainEqual({ type: 'unarmoredAC', base: 13, abilities: ['dex'] });
  });

  it('ignores a subclass of another class', () => {
    const { effects } = collectEffects(base({ subclassSlug: 'linhagem-draconica' }), data);
    expect(effects).not.toContainEqual({ type: 'hpPerLevel', amount: 1 });
  });

  it('applies the variant human feat', () => {
    const vh = base({ subraceSlug: 'humano-variante' });
    const before = collectEffects(vh, data).pending.find((p) => p.id === 'feat');
    expect(before).toMatchObject({ kind: 'featChoice', count: 1 });
    expect(before?.options).toEqual([{ id: 'robusto', name: 'Robusto' }, { id: 'alerta', name: 'Alerta' }]);
    const { effects, pending } = collectEffects({ ...vh, optionPicks: { feat: ['robusto'] } }, data);
    expect(effects).toContainEqual({ type: 'hpPerLevel', amount: 2 });
    expect(pending.find((p) => p.id === 'feat')).toBeUndefined();
  });

  it('turns race data into effects', () => {
    const { effects } = collectEffects(base({ raceSlug: 'elfo' }), data);
    expect(effects).toContainEqual({ type: 'ability', ability: 'dex', amount: 2 });
    expect(effects).toContainEqual({ type: 'skill', skill: 'perception' });
    expect(effects).toContainEqual({ type: 'skill', skill: 'religion' });
  });

  it('gives nested choices an id under their option', () => {
    const tome = collectEffects(base({ classSlug: 'bruxo', optionPicks: { pactBoon: ['pacto-do-tomo'] } }), {
      ...data,
      classes: [...data.classes, cls('bruxo', 2, ['arcana'], ['wis', 'cha'])],
    }).pending.find((p) => p.kind === 'cantripChoice');
    expect(tome).toMatchObject({ id: 'pactBoon.pacto-do-tomo:cantripChoice:0', count: 3 });
  });
});

describe('pruneChoices', () => {
  it('drops the fighting style when the class changes to wizard', () => {
    const fighter = base({ optionPicks: { fightingStyle: ['defesa'] }, skillPicks: ['athletics', 'perception'] });
    expect(pruneChoices(fighter, data)).toBe(fighter);
    const wizard = pruneChoices({ ...fighter, classSlug: 'mago' }, data);
    expect(wizard.optionPicks.fightingStyle).toBeUndefined();
    expect(wizard.skillPicks).toEqual([]);
  });

  it('drops a subclass of another class and unknown option ids', () => {
    const out = pruneChoices(base({ subclassSlug: 'linhagem-draconica', optionPicks: { fightingStyle: ['nope'] } }), data);
    expect(out.subclassSlug).toBe('');
    expect(out.optionPicks).toEqual({});
  });

  it('drops expertise in a skill no longer proficient and the feat without the variant', () => {
    const rogue = base({
      raceSlug: 'humano',
      subraceSlug: 'humano-variante',
      classSlug: 'ladino',
      skillPicks: ['stealth', 'acrobatics', 'deception', 'investigation'],
      expertisePicks: ['stealth', 'insight'],
      optionPicks: { feat: ['alerta'] },
    });
    expect(pruneChoices(rogue, data)).toBe(rogue);
    const fighter = pruneChoices({ ...rogue, classSlug: 'guerreiro', subraceSlug: undefined }, data);
    expect(fighter.expertisePicks).toEqual([]);
    expect(fighter.optionPicks.feat).toBeUndefined();
  });
});
