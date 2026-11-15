import { describe, expect, it } from 'vitest';
import phbSlugs from './fixtures/phbSlugs.json';
import { CLASS_EFFECTS } from '../classRules';
import { SUBCLASS_EFFECTS } from '../subclassRules';
import { FEAT_EFFECTS, FEAT_REQUIRES } from '../featRules';
import { TOOL_CATEGORIES } from '../toolRules';
import type { Effect } from '../types';

const optionOf = (effects: Effect[], id: string) =>
  effects.find((e): e is Extract<Effect, { type: 'option' }> => e.type === 'option' && e.id === id);

/** Every option effect, nested ones included. */
function allOptions(effects: Effect[]): Extract<Effect, { type: 'option' }>[] {
  return effects.flatMap((e) =>
    e.type === 'option' ? [e, ...allOptions(e.options.flatMap((o) => o.effects))] : [],
  );
}

describe('class, subclass and feat tables', () => {
  it('keys every table by a real PHB slug', () => {
    for (const k of Object.keys(CLASS_EFFECTS)) expect(phbSlugs.class).toContain(k);
    for (const k of Object.keys(SUBCLASS_EFFECTS)) expect(phbSlugs.subclass).toContain(k);
    for (const k of Object.keys(FEAT_EFFECTS)) expect(phbSlugs.feat).toContain(k);
    for (const k of Object.keys(FEAT_REQUIRES)) expect(phbSlugs.feat).toContain(k);
    for (const slug of Object.values(TOOL_CATEGORIES).flat()) expect(phbSlugs.tool).toContain(slug);
  });

  it('points always-prepared spells at real spell slugs', () => {
    const tables = [CLASS_EFFECTS, SUBCLASS_EFFECTS, FEAT_EFFECTS].flatMap((t) => Object.values(t));
    const slugs = allOptions(tables.flat())
      .flatMap((o) => o.options.flatMap((x) => x.effects))
      .concat(tables.flat())
      .flatMap((e) => (e.type === 'alwaysPrepared' ? e.slugs : []));
    expect(slugs.length).toBeGreaterThan(0);
    for (const s of slugs) expect(phbSlugs.spell).toContain(s);
  });

  it('gives options unique ids and names', () => {
    const tables = [CLASS_EFFECTS, SUBCLASS_EFFECTS, FEAT_EFFECTS].flatMap((t) => Object.values(t));
    for (const o of allOptions(tables.flat())) {
      expect(new Set(o.options.map((x) => x.id)).size).toBe(o.options.length);
      expect(new Set(o.options.map((x) => x.name)).size).toBe(o.options.length);
      expect(o.choose).toBeLessThanOrEqual(o.options.length);
    }
  });

  it('offers the fighting styles of each class', () => {
    const ids = (cls: string) => optionOf(CLASS_EFFECTS[cls], 'fightingStyle')?.options.map((o) => o.id);
    expect(ids('guerreiro')).toHaveLength(6);
    expect(ids('paladino')).toEqual(['defesa', 'duelismo', 'combate-com-armas-grandes', 'protecao']);
    expect(ids('patrulheiro')).toEqual(['arquearia', 'combate-com-duas-armas', 'defesa', 'duelismo']);
    const defense = optionOf(CLASS_EFFECTS.guerreiro, 'fightingStyle')?.options.find((o) => o.id === 'defesa');
    expect(defense?.effects).toEqual([{ type: 'acBonus', amount: 1, whenArmored: true }]);
    const archery = optionOf(CLASS_EFFECTS.guerreiro, 'fightingStyle')?.options.find((o) => o.id === 'arquearia');
    expect(archery?.effects).toEqual([{ type: 'attackBonus', attack: 'ranged', toHit: 2 }]);
  });

  it('has the class numbers up to 3rd level', () => {
    expect(CLASS_EFFECTS.ladino).toContainEqual({ type: 'expertiseChoice', count: 2, tool: 'ferramentas-de-ladrao' });
    expect(CLASS_EFFECTS.bardo).toContainEqual({ type: 'expertiseChoice', count: 2 });
    expect(CLASS_EFFECTS.bardo).toContainEqual({ type: 'jackOfAllTrades' });
    expect(optionOf(CLASS_EFFECTS.bruxo, 'invocations')?.choose).toBe(2);
    expect(optionOf(CLASS_EFFECTS.bruxo, 'pactBoon')?.choose).toBe(1);
    expect(optionOf(CLASS_EFFECTS.feiticeiro, 'metamagic')?.choose).toBe(2);
    expect(optionOf(CLASS_EFFECTS.patrulheiro, 'favoredEnemy')?.choose).toBe(1);
    const agonizing = optionOf(CLASS_EFFECTS.bruxo, 'invocations')?.options.find((o) => o.id === 'explosao-agonizante');
    expect(agonizing?.effects).toEqual([{ type: 'attackBonus', attack: 'eldritchBlast', damage: 'ability' }]);
  });

  it('keeps the monk unarmored defense off with a shield, but not the barbarian one', () => {
    expect(CLASS_EFFECTS.monge).toContainEqual({ type: 'unarmoredAC', base: 10, abilities: ['dex', 'wis'], noShield: true });
    expect(CLASS_EFFECTS.monge).toContainEqual({ type: 'attackBonus', attack: 'unarmed', die: '1d4', ability: 'dex' });
    expect(CLASS_EFFECTS.monge).toContainEqual({ type: 'speed', meters: 3, noArmor: true });
    expect(CLASS_EFFECTS.barbaro).toContainEqual({ type: 'unarmoredAC', base: 10, abilities: ['dex', 'con'] });
  });

  it('has the subclass numbers up to 3rd level', () => {
    expect(SUBCLASS_EFFECTS['linhagem-draconica']).toContainEqual({ type: 'hpPerLevel', amount: 1 });
    expect(SUBCLASS_EFFECTS['linhagem-draconica']).toContainEqual({ type: 'unarmoredAC', base: 13, abilities: ['dex'] });
    expect(SUBCLASS_EFFECTS['dominio-da-vida']).toContainEqual({ type: 'armorProficiency', armor: 'heavy' });
    expect(SUBCLASS_EFFECTS['dominio-da-tempestade']).toContainEqual({ type: 'armorProficiency', armor: 'heavy' });
    expect(SUBCLASS_EFFECTS['dominio-do-conhecimento']).toEqual([
      { type: 'languageChoice', count: 2 },
      { type: 'skillChoice', count: 2, from: ['arcana', 'history', 'nature', 'religion'], expertise: true },
    ]);
    expect(SUBCLASS_EFFECTS.assassino).toEqual([
      { type: 'tool', tool: 'kit-de-disfarce' },
      { type: 'tool', tool: 'kit-de-venenos' },
    ]);
    expect(SUBCLASS_EFFECTS['colegio-do-conhecimento']).toEqual([{ type: 'skillChoice', count: 3 }]);
    expect(optionOf(SUBCLASS_EFFECTS['mestre-de-batalha'], 'maneuvers')?.choose).toBe(3);
    expect(SUBCLASS_EFFECTS['mestre-de-batalha']).toContainEqual({ type: 'toolChoice', count: 1, category: 'artisanTool' });
    expect(optionOf(SUBCLASS_EFFECTS['circulo-da-terra'], 'landTerrain')?.options).toHaveLength(8);
    expect(optionOf(SUBCLASS_EFFECTS['caminho-dos-quatro-elementos'], 'elementalDiscipline')?.choose).toBe(1);
  });

  it('has the feat numbers', () => {
    expect(FEAT_EFFECTS.robusto).toEqual([{ type: 'hpPerLevel', amount: 2 }]);
    expect(FEAT_EFFECTS.alerta).toEqual([{ type: 'initiative', amount: 5 }]);
    expect(FEAT_EFFECTS.mobilidade).toEqual([{ type: 'speed', meters: 3 }]);
    expect(FEAT_EFFECTS.observador).toContainEqual({ type: 'passivePerception', amount: 5 });
    expect(optionOf(FEAT_EFFECTS.resiliente, 'resilientAbility')?.options.find((o) => o.id === 'con')?.effects).toEqual([
      { type: 'ability', ability: 'con', amount: 1 },
      { type: 'save', ability: 'con' },
    ]);
    const half = [
      'atleta', 'ator', 'especialista-em-briga', 'maestria-em-armadura-pesada', 'mente-afiada', 'mestre-de-armas',
      'observador', 'poliglota', 'protecao-leve', 'protecao-moderada', 'protecao-pesada', 'resiliente', 'resistente',
    ];
    const plusOne = (effects: Effect[]): boolean =>
      effects.some(
        (e) =>
          (e.type === 'ability' && e.amount === 1) ||
          (e.type === 'abilityChoice' && e.amount === 1) ||
          (e.type === 'option' && e.options.every((o) => plusOne(o.effects))),
      );
    for (const slug of half) expect(plusOne(FEAT_EFFECTS[slug]), slug).toBe(true);
  });

  it('has the feat prerequisites and the other numbers', () => {
    expect(FEAT_EFFECTS['maestria-em-armadura-media']).toEqual([{ type: 'mediumArmorMaxDex', max: 3 }]);
    expect(FEAT_EFFECTS['mestre-de-armas']).toContainEqual({ type: 'weaponChoice', count: 4 });
    expect(optionOf(FEAT_EFFECTS['atirador-de-magia'], 'spellSniperClass')?.options).toHaveLength(6);
    expect(FEAT_REQUIRES['maestria-em-armadura-pesada']).toEqual([{ kind: 'armor', armor: 'heavy' }]);
    expect(FEAT_REQUIRES.imobilizador).toEqual([{ kind: 'score', abilities: ['str'], min: 13 }]);
    expect(FEAT_REQUIRES['conjurador-de-guerra']).toEqual([{ kind: 'spellcasting' }]);
  });

  it('gives invocations their prerequisites', () => {
    const req = (id: string) => optionOf(CLASS_EFFECTS.bruxo, 'invocations')?.options.find((o) => o.id === id)?.requires;
    expect(req('explosao-agonizante')).toEqual([{ kind: 'cantrip', slug: 'rajada-mistica' }]);
    expect(req('lanca-mistica')).toEqual([{ kind: 'cantrip', slug: 'rajada-mistica' }]);
    expect(req('livro-de-segredos-antigos')).toEqual([{ kind: 'option', id: 'pactBoon', pick: 'pacto-do-tomo' }]);
    expect(req('voz-do-mestre-das-correntes')).toEqual([{ kind: 'option', id: 'pactBoon', pick: 'pacto-da-corrente' }]);
    expect(req('visao-diabolica')).toBeUndefined();
  });
});
