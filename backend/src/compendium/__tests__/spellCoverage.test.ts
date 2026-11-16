/**
 * Every spell of the 3rd to 9th level has `mechanics`, either the numbers the
 * action bar rolls or `castOnly` with a reason. Reads the compendium's spell
 * data file (materiais/.compendio/data/phb/spell.json, git-ignored); skips when
 * absent. Only slugs and numbers are asserted here.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parseAreaText } from '../../rules/actions/areaText';

const FILE = resolve(__dirname, '../../../../materiais/.compendio/data/phb/spell.json');

interface RawSpell {
  slug: string;
  data: { level: number; mechanics?: any };
}

const present = existsSync(FILE);
if (!present) console.warn(`spellCoverage: ${FILE} not found (the compendium data is private); skipping.`);

const load = (): Map<string, RawSpell> => new Map((JSON.parse(readFileSync(FILE, 'utf8')) as RawSpell[]).map((s) => [s.slug, s]));

(present ? describe : describe.skip)('spell mechanics coverage', () => {
  it('gives every 3rd to 9th level spell mechanics or a cast-only reason', () => {
    const spells = [...load().values()].filter((s) => s.data.level >= 3);
    expect(spells.length).toBeGreaterThan(200);
    const missing = spells.filter((s) => !s.data.mechanics).map((s) => s.slug);
    expect(missing).toEqual([]);
    const noReason = spells
      .filter((s) => s.data.mechanics?.castOnly !== undefined && !String(s.data.mechanics.castOnly).trim())
      .map((s) => s.slug);
    expect(noReason).toEqual([]);
  });

  it('parses every area it writes', () => {
    const bad: string[] = [];
    for (const s of load().values()) {
      const area = s.data.mechanics?.area;
      if (area && !parseAreaText(area)) bad.push(s.slug);
    }
    expect(bad).toEqual([]);
  });

  it('reads Fireball', () => {
    const m = load().get('bola-de-fogo')!.data.mechanics;
    expect(m.save).toBe('dex');
    expect(m.halfOnSave).toBe(true);
    expect(m.damage).toEqual([{ dice: '8d6', type: 'fogo' }]);
    expect(parseAreaText(m.area)).toEqual({ shape: 'sphere', sizeFt: 20 });
    expect(m.scaling.perSlot).toBe('1d6');
  });

  it('reads Lightning Bolt as a 100 by 5 ft line', () => {
    const m = load().get('relampago')!.data.mechanics;
    expect(parseAreaText(m.area)).toEqual({ shape: 'line', sizeFt: 100, widthFt: 5 });
  });

  it('reads Hold Person as a save with one more target per slot', () => {
    const m = load().get('imobilizar-pessoa')!.data.mechanics;
    expect(m.save).toBe('wis');
    expect(m.targets).toBe(1);
    expect(m.targetsPerSlot).toBe(1);
    expect(m.damage).toEqual([]);
  });

  it('reads Vampiric Touch as a melee attack that heals half', () => {
    const m = load().get('toque-vampirico')!.data.mechanics;
    expect(m.attack).toBe('melee');
    expect(m.selfHeal).toBe('half-damage');
  });

  it('keeps Meteor Swarm cast-only', () => {
    expect(load().get('chuva-de-meteoros')!.data.mechanics.castOnly).toBeTruthy();
  });

  it('reads the dart and ray spells', () => {
    const spells = load();
    expect(spells.get('rajada-mistica')!.data.mechanics.rays).toEqual({ count: 1, cantripLevels: true });
    expect(spells.get('misseis-magicos')!.data.mechanics.rays).toEqual({ count: 3, perSlot: 1 });
    expect(spells.get('misseis-magicos')!.data.mechanics.autoHit).toBe(true);
    expect(spells.get('raio-ardente')!.data.mechanics.rays).toEqual({ count: 3, perSlot: 1 });
  });

  it('gives Chain Lightning four targets and Mass Cure Wounds six', () => {
    const spells = load();
    expect(spells.get('corrente-de-relampagos')!.data.mechanics.targets).toBe(4);
    const m = spells.get('curar-ferimentos-em-massa')!.data.mechanics;
    expect(m.targets).toBe(6);
    expect(m.healing).toBeTruthy();
    expect(m.area).toBeUndefined();
  });

  it('resolves only what happens at cast time', () => {
    const spells = load();
    expect(spells.get('onda-destrutiva')!.data.mechanics.halfOnSave).toBe(true);
    expect(spells.get('espiritos-guardioes')!.data.mechanics.castOnly).toBeTruthy();
    const killer = spells.get('assassino-fantasmagorico')!.data.mechanics;
    expect(killer.save).toBe('wis');
    expect(killer.damage).toEqual([]);
  });

  it('does not grow Eldritch Blast dice with the level, only its beams', () => {
    expect(load().get('rajada-mistica')!.data.mechanics.scaling?.cantrip).toBeUndefined();
  });

  it('reads Heal as a flat 70 healing', () => {
    const m = load().get('cura-completa')!.data.mechanics;
    expect(m.healing).toBe('70');
    expect(m.scaling.perSlot).toBe('10');
    expect(m.targets).toBe(1);
  });
});
