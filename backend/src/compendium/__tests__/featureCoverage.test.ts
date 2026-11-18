/**
 * Every class and subclass feature up to the 5th level has a curated
 * `mechanics.action` the action bar can read: a button, a rider, a passive, or
 * `none` with a reason. Reads the compendium's class data files
 * (materiais/.compendio/data/phb/class.json and subclass.json, git-ignored);
 * skips when absent. Features are found by their action key, so only slugs and
 * numbers are asserted here.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { FeatureActionSchema, type FeatureAction } from '../schemas';
import { atLevel } from '../../rules/actions/features';

const DIR = resolve(__dirname, '../../../../materiais/.compendio/data/phb');
const CLASS_FILE = resolve(DIR, 'class.json');
const SUBCLASS_FILE = resolve(DIR, 'subclass.json');

interface RawFeature {
  name: string;
  level: number;
  mechanics?: { action?: unknown; [key: string]: unknown };
}

interface RawEntry {
  slug: string;
  data: { parent?: string; features?: RawFeature[] };
}

const present = existsSync(CLASS_FILE) && existsSync(SUBCLASS_FILE);
if (!present) console.warn(`featureCoverage: ${DIR} not found (the compendium data is private); skipping.`);

const loadEntries = (): RawEntry[] => [
  ...(JSON.parse(readFileSync(CLASS_FILE, 'utf8')) as RawEntry[]),
  ...(JSON.parse(readFileSync(SUBCLASS_FILE, 'utf8')) as RawEntry[]),
];

/** The parsed action of the feature of `slug` whose action key is `key`. */
function action(slug: string, key: string): FeatureAction {
  const entry = loadEntries().find((e) => e.slug === slug);
  if (!entry) throw new Error(`no class or subclass ${slug}`);
  const found = (entry.data.features ?? [])
    .map((f) => FeatureActionSchema.safeParse(f.mechanics?.action))
    .find((p) => p.success && p.data.key === key);
  if (!found || !found.success) throw new Error(`no feature with action ${key} in ${slug}`);
  return found.data;
}

/** The actions of every feature of `slug` (class or subclass). */
function actions(slug: string): FeatureAction[] {
  const entry = loadEntries().find((e) => e.slug === slug);
  return (entry?.data.features ?? []).map((f) => FeatureActionSchema.safeParse(f.mechanics?.action)).flatMap((p) => (p.success ? [p.data] : []));
}

const pool = (a: FeatureAction, key: string) => a.resources?.find((r) => r.key === key);

(present ? describe : describe.skip)('class feature mechanics coverage', () => {
  it('gives every class and subclass feature up to the 5th level an action the schema accepts', () => {
    const entries = loadEntries();
    expect(entries.length).toBeGreaterThan(40);
    const missing: string[] = [];
    const invalid: string[] = [];
    for (const entry of entries) {
      for (const feature of entry.data.features ?? []) {
        if (feature.level > 5) continue;
        const raw = feature.mechanics?.action;
        if (raw === undefined) missing.push(`${entry.slug} L${feature.level}`);
        else if (!FeatureActionSchema.safeParse(raw).success) invalid.push(`${entry.slug} L${feature.level}`);
      }
    }
    expect(missing).toEqual([]);
    expect(invalid).toEqual([]);
  });

  it('keeps one key per feature within a class or subclass', () => {
    const dupes: string[] = [];
    for (const entry of loadEntries()) {
      const keys = actions(entry.slug).map((a) => a.key);
      for (const key of new Set(keys)) if (keys.filter((k) => k === key).length > 1) dupes.push(`${entry.slug}/${key}`);
    }
    expect(dupes).toEqual([]);
  });

  it('spends only pools some feature of the class or its subclasses declares', () => {
    const entries = loadEntries();
    const orphans: string[] = [];
    for (const cls of entries.filter((e) => !e.data.parent)) {
      const family = [cls, ...entries.filter((e) => e.data.parent === cls.slug)];
      const declared = new Set(family.flatMap((e) => actions(e.slug).flatMap((a) => (a.resources ?? []).map((r) => r.key))));
      for (const e of family) for (const a of actions(e.slug)) if (a.spends && !declared.has(a.spends.key)) orphans.push(`${e.slug}/${a.key}`);
    }
    expect(orphans).toEqual([]);
  });

  it('reads Rage', () => {
    const a = action('barbaro', 'rage');
    expect(a.kind).toBe('state');
    expect(a.cost).toBe('bonus');
    const rage = pool(a, 'rage')!;
    expect([1, 3, 5].map((l) => atLevel(rage.max as Record<string, number>, l))).toEqual([2, 3, 3]);
    expect(rage.recovers).toBe('long');
    expect(a.spends?.key).toBe('rage');
    expect([1, 3, 5].map((l) => atLevel(a.damageBonus!, l))).toEqual([2, 2, 2]);
    expect(a.filter).toEqual({ melee: true, strength: true });
  });

  it('reads Reckless Attack as a button or a reasoned none', () => {
    expect(['none', 'use']).toContain(action('barbaro', 'reckless-attack').kind);
  });

  it('gives one extra attack at the 5th level to the martial classes', () => {
    for (const slug of ['barbaro', 'guerreiro', 'monge', 'paladino', 'conclave-do-cacador', 'conclave-do-rastreador-subterraneo']) {
      const a = action(slug, 'extra-attack');
      expect([slug, a.kind, a.passive?.extraAttacks]).toEqual([slug, 'passive', 1]);
    }
  });

  it('reads Sneak Attack and Cunning Action', () => {
    const sneak = action('ladino', 'sneak-attack');
    expect(sneak.kind).toBe('addDamage');
    expect(sneak.oncePerTurn).toBe(true);
    expect(sneak.filter).toEqual({ finesseOrRanged: true });
    expect([1, 3, 5].map((l) => atLevel(sneak.dice!, l))).toEqual(['1d6', '2d6', '3d6']);
    const cunning = action('ladino', 'cunning-action');
    expect(cunning.kind).toBe('makeBonus');
    expect([...(cunning.makeBonus ?? [])].sort()).toEqual(['dash', 'disengage', 'hide']);
  });

  it('reads Divine Smite and Lay on Hands', () => {
    const smite = action('paladino', 'divine-smite');
    expect(smite.kind).toBe('addDamage');
    expect(smite.slot).toEqual({ base: '2d8', perSlot: '1d8', maxDice: 5 });
    expect(smite.filter).toEqual({ melee: true });
    const hands = action('paladino', 'lay-on-hands');
    expect(hands.kind).toBe('heal');
    expect(pool(hands, 'lay-on-hands')?.max).toEqual({ perLevel: 5 });
    expect(hands.spends).toEqual({ key: 'lay-on-hands', chosen: true });
  });

  it('reads Second Wind, Action Surge and Improved Critical', () => {
    const wind = action('guerreiro', 'second-wind');
    expect(wind.kind).toBe('heal');
    expect(wind.cost).toBe('bonus');
    expect(atLevel(wind.dice!, 1)).toBe('1d10');
    expect(wind.addClassLevel).toBe(true);
    expect(pool(wind, 'second-wind')?.recovers).toBe('short');
    const surge = action('guerreiro', 'action-surge');
    expect(surge.kind).toBe('extraAction');
    expect(pool(surge, 'action-surge')?.recovers).toBe('short');
    const crit = action('campeao', 'improved-critical');
    expect(crit.kind).toBe('passive');
    expect(crit.passive?.critMin).toBe(19);
  });

  it('reads Ki, Flurry of Blows and Martial Arts', () => {
    const flurry = action('monge', 'flurry-of-blows');
    expect(pool(flurry, 'ki')).toEqual({ key: 'ki', max: 'classLevel', recovers: 'short' });
    expect(flurry.kind).toBe('attacks');
    expect(flurry.cost).toBe('bonus');
    expect(flurry.attacks?.count).toBe(2);
    expect(flurry.attacks?.requiresAttackAction).toBe(true);
    expect(flurry.spends?.key).toBe('ki');
    const arts = action('monge', 'martial-arts');
    expect(arts.kind).toBe('attacks');
    expect(arts.cost).toBe('bonus');
    expect(arts.attacks?.count).toBe(1);
    expect(arts.attacks?.requiresAttackAction).toBe(true);
    expect([1, 4, 5].map((l) => atLevel(arts.attacks!.unarmedDice, l))).toEqual(['1d4', '1d4', '1d6']);
  });

  it('reads Bardic Inspiration', () => {
    const a = action('bardo', 'bardic-inspiration');
    expect(a.kind).toBe('use');
    const p = pool(a, 'bardic-inspiration')!;
    expect(p.max).toEqual({ ability: 'cha', min: 1 });
    expect([1, 4, 5].map((l) => atLevel(p.recovers as Record<string, string>, l))).toEqual(['long', 'long', 'short']);
  });

  it('spends the shared channel-divinity pool on every Channel Divinity option', () => {
    const cleric = loadEntries().filter((e) => e.slug === 'clerigo' || e.data.parent === 'clerigo');
    const options = cleric.flatMap((e) => actions(e.slug)).filter((a) => a.spends?.key === 'channel-divinity');
    expect(options.length).toBeGreaterThanOrEqual(8);
    expect(options.every((a) => a.kind === 'use')).toBe(true);
    const clericPool = actions('clerigo').flatMap((a) => a.resources ?? []).find((r) => r.key === 'channel-divinity')!;
    expect([2, 5, 6].map((l) => atLevel(clericPool.max as Record<string, number>, l))).toEqual([1, 1, 2]);
    expect(clericPool.recovers).toBe('short');
    for (const oath of ['juramento-de-devocao', 'juramento-dos-ancioes', 'juramento-de-vinganca']) {
      const a = actions(oath).find((x) => x.spends?.key === 'channel-divinity')!;
      expect([oath, a.kind, pool(a, 'channel-divinity')?.recovers]).toEqual([oath, 'use', 'short']);
    }
  });

  it('reads Wild Shape, Font of Magic and Arcane Recovery', () => {
    const shape = action('druida', 'wild-shape');
    expect(shape.kind).toBe('use');
    const shapes = pool(shape, 'wild-shape')!;
    expect(atLevel(shapes.max as Record<string, number>, 2)).toBe(2);
    expect(shapes.recovers).toBe('short');
    const font = action('feiticeiro', 'font-of-magic');
    expect(font.kind).toBe('use');
    expect(pool(font, 'sorcery-points')).toEqual({ key: 'sorcery-points', max: 'classLevel', recovers: 'long' });
    const recovery = action('mago', 'arcane-recovery');
    expect(recovery.kind).toBe('none');
    expect(recovery.reason).toBeTruthy();
  });

  it('gives the warlock no button below the 5th level other than what its patrons grant', () => {
    expect(actions('bruxo').every((a) => a.kind === 'none' && a.reason)).toBe(true);
  });

  it('leaves the ranger class features to the table, each with a reason', () => {
    const ranger = actions('patrulheiro');
    expect(ranger.length).toBeGreaterThan(5);
    expect(ranger.every((a) => a.kind === 'none' && a.reason)).toBe(true);
  });

  it('keeps the subclass spell lists next to the action', () => {
    const lists = loadEntries()
      .flatMap((e) => e.data.features ?? [])
      .filter((f) => f.level <= 5 && f.mechanics?.spellsBySpellLevel !== undefined);
    expect(lists.length).toBeGreaterThan(10);
    expect(lists.every((f) => (f.mechanics!.action as FeatureAction | undefined)?.kind === 'none')).toBe(true);
  });
});
