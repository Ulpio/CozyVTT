import type { Effect, OptionEffect, Requirement } from './types';

/**
 * What a class gains from 1st to 3rd level beyond its compendium data: choices
 * and numbers only. Option names are the short PHB names as the compendium spells
 * them; the UI shows the feature text from the compendium beside them.
 */

const opt = (id: string, name: string, effects: Effect[] = [], requires?: Requirement[]): OptionEffect =>
  requires ? { id, name, effects, requires } : { id, name, effects };

const BLAST: Requirement[] = [{ kind: 'cantrip', slug: 'rajada-mistica' }];

const STYLE: Record<string, OptionEffect> = {
  arquearia: opt('arquearia', 'Arquearia', [{ type: 'attackBonus', attack: 'ranged', toHit: 2 }]),
  defesa: opt('defesa', 'Defesa', [{ type: 'acBonus', amount: 1, whenArmored: true }]),
  duelismo: opt('duelismo', 'Duelismo', [{ type: 'attackBonus', attack: 'oneHandedMelee', damageBonus: 2 }]),
  armasGrandes: opt('combate-com-armas-grandes', 'Combate com Armas Grandes'),
  protecao: opt('protecao', 'Proteção'),
  duasArmas: opt('combate-com-duas-armas', 'Combate com Duas Armas'),
};

const fightingStyle = (options: OptionEffect[]): Effect => ({ type: 'option', id: 'fightingStyle', choose: 1, options });

/** Invocations a 2nd/3rd-level warlock can take (no level prerequisite). */
const INVOCATIONS: OptionEffect[] = [
  opt('armadura-de-sombras', 'Armadura de Sombras', [{ type: 'unarmoredAC', base: 13, abilities: ['dex'] }]),
  opt('explosao-agonizante', 'Explosão Agonizante', [{ type: 'attackBonus', attack: 'eldritchBlast', damage: 'ability' }], BLAST),
  opt('explosao-repulsiva', 'Explosão Repulsiva', [], BLAST),
  opt('idioma-bestial', 'Idioma Bestial'),
  opt('influencia-enganadora', 'Influência Enganadora', [
    { type: 'skill', skill: 'deception' },
    { type: 'skill', skill: 'persuasion' },
  ]),
  opt('lanca-mistica', 'Lança Mística', [], BLAST),
  opt('larapio-dos-cinco-destinos', 'Larápio dos Cinco Destinos'),
  opt('livro-de-segredos-antigos', 'Livro de Segredos Antigos', [], [
    { kind: 'option', id: 'pactBoon', pick: 'pacto-do-tomo' },
  ]),
  opt('mascara-das-muitas-faces', 'Máscara das Muitas Faces'),
  opt('olhar-de-duas-mentes', 'Olhar de Duas Mentes'),
  opt('olhos-do-guardiao-das-runas', 'Olhos do Guardião das Runas'),
  opt('vigor-abissal', 'Vigor Abissal'),
  opt('visao-diabolica', 'Visão Diabólica'),
  opt('visao-mistica', 'Visão Mística'),
  opt('visoes-nas-brumas', 'Visões nas Brumas'),
  opt('voz-do-mestre-das-correntes', 'Voz do Mestre das Correntes', [], [
    { kind: 'option', id: 'pactBoon', pick: 'pacto-da-corrente' },
  ]),
];

const PACT_BOONS: OptionEffect[] = [
  opt('pacto-da-corrente', 'Pacto da Corrente', [{ type: 'alwaysPrepared', slugs: ['convocar-familiar'] }]),
  opt('pacto-da-lamina', 'Pacto da Lâmina', [{ type: 'weaponProficiency', weapon: 'pactWeapon' }]),
  opt('pacto-do-tomo', 'Pacto do Tomo', [{ type: 'cantripChoice', count: 3, list: 'any', ability: 'cha' }]),
];

const METAMAGIC: OptionEffect[] = [
  opt('magia-acelerada', 'Magia Acelerada'),
  opt('magia-aumentada', 'Magia Aumentada'),
  opt('magia-cuidadosa', 'Magia Cuidadosa'),
  opt('magia-distante', 'Magia Distante'),
  opt('magia-duplicada', 'Magia Duplicada'),
  opt('magia-estendida', 'Magia Estendida'),
  opt('magia-potencializada', 'Magia Potencializada'),
  opt('magia-sutil', 'Magia Sutil'),
];

/** The compendium's ranger: a favored enemy type (+2 damage against it is situational). */
const FAVORED_ENEMIES: OptionEffect[] = [
  opt('bestas', 'Bestas'),
  opt('fadas', 'Fadas', [{ type: 'languageChoice', count: 1 }]),
  opt('humanoides', 'Humanoides', [{ type: 'languageChoice', count: 1 }]),
  opt('monstruosidades', 'Monstruosidades', [{ type: 'languageChoice', count: 1 }]),
  opt('mortos-vivos', 'Mortos-Vivos', [{ type: 'languageChoice', count: 1 }]),
];

export const CLASS_EFFECTS: Record<string, Effect[]> = {
  barbaro: [{ type: 'unarmoredAC', base: 10, abilities: ['dex', 'con'] }],
  bardo: [
    { type: 'toolChoice', count: 3, category: 'instrument' },
    { type: 'jackOfAllTrades' },
    { type: 'expertiseChoice', count: 2 },
  ],
  bruxo: [
    { type: 'option', id: 'invocations', choose: 2, options: INVOCATIONS },
    { type: 'option', id: 'pactBoon', choose: 1, options: PACT_BOONS },
  ],
  feiticeiro: [{ type: 'option', id: 'metamagic', choose: 2, options: METAMAGIC }],
  guerreiro: [
    fightingStyle([STYLE.arquearia, STYLE.defesa, STYLE.duelismo, STYLE.armasGrandes, STYLE.protecao, STYLE.duasArmas]),
  ],
  ladino: [{ type: 'expertiseChoice', count: 2, tool: 'ferramentas-de-ladrao' }],
  monge: [
    { type: 'toolChoice', count: 1, category: ['artisanTool', 'instrument'] },
    { type: 'unarmoredAC', base: 10, abilities: ['dex', 'wis'], noShield: true },
    { type: 'attackBonus', attack: 'unarmed', die: '1d4', ability: 'dex' },
    { type: 'attackBonus', attack: 'monkWeapon', ability: 'dex' },
    { type: 'speed', meters: 3, noArmor: true },
  ],
  paladino: [fightingStyle([STYLE.defesa, STYLE.duelismo, STYLE.armasGrandes, STYLE.protecao])],
  patrulheiro: [
    { type: 'option', id: 'favoredEnemy', choose: 1, options: FAVORED_ENEMIES },
    fightingStyle([STYLE.arquearia, STYLE.duasArmas, STYLE.defesa, STYLE.duelismo]),
  ],
};
