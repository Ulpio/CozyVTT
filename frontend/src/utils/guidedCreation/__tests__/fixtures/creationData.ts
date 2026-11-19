/**
 * A hand-written `CreationData` covering the twelve classes, for tests.
 *
 * Every description is invented placeholder text, never book text; numbers and
 * slugs are what the rules read. Spells are generic ("magia-1-03") except the
 * slugs the rules name (rajada-mistica, maos-magicas, convocar-familiar).
 */
import type { CreationData, CreationEntry } from '../../buildSheet';
import type {
  ArmorData,
  BackgroundData,
  ClassData,
  EquipmentBundleData,
  EquipmentChoiceData,
  EquipmentItemData,
  FeatureData,
  RaceData,
  SpellData,
  SubclassData,
  SubraceData,
  WeaponData,
} from '../../compendiumData';

const BOOK = 'book-test';
const TEXT = 'Texto de exemplo, inventado para os testes.';

const entry = <T>(slug: string, name: string, data: T, text = TEXT): CreationEntry<T> => ({
  bookId: BOOK,
  slug,
  name,
  data,
  text,
});

const feature = (name: string, level: number, mechanics?: FeatureData['mechanics']): FeatureData => ({
  name,
  description: `${TEXT} (${name})`,
  level,
  ...(mechanics ? { mechanics } : {}),
});

const trait = (name: string) => ({ name, description: `${TEXT} (${name})` });

// --- Items -------------------------------------------------------------------

/** "espada-longa" → "Espada longa": what race proficiency lines are matched against. */
const label = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');

const weapon = (
  slug: string,
  category: WeaponData['category'],
  range: WeaponData['range'],
  dice: string,
  type: string,
  properties: string[] = [],
  extra: Partial<WeaponData> = {},
) => entry<WeaponData>(slug, label(slug), { category, range, damage: { dice, type }, properties, cost: '1 po', weight: 1, ...extra });

const WEAPONS = [
  weapon('espada-longa', 'martial', 'melee', '1d8', 'cortante', ['versátil'], { versatile: '1d10', weight: 1.5 }),
  weapon('machado-grande', 'martial', 'melee', '1d12', 'cortante', ['pesada', 'duas mãos'], { weight: 3.5 }),
  weapon('arco-longo', 'martial', 'ranged', '1d8', 'perfurante', ['munição', 'pesada', 'duas mãos'], { normalRange: 45, longRange: 180, ammunition: 'flechas-20' }),
  weapon('rapieira', 'martial', 'melee', '1d8', 'perfurante', ['acuidade']),
  weapon('espada-curta', 'martial', 'melee', '1d6', 'perfurante', ['acuidade', 'leve']),
  weapon('adaga', 'simple', 'melee', '1d4', 'perfurante', ['acuidade', 'leve', 'arremesso'], { normalRange: 6, longRange: 18, weight: 0.5 }),
  weapon('bordao', 'simple', 'melee', '1d6', 'concussão', ['versátil'], { versatile: '1d8', weight: 2 }),
  weapon('maca', 'simple', 'melee', '1d6', 'concussão', [], { weight: 2 }),
  weapon('dardo', 'simple', 'ranged', '1d4', 'perfurante', ['acuidade', 'arremesso'], { normalRange: 6, longRange: 18, weight: 0.125 }),
  weapon('besta-leve', 'simple', 'ranged', '1d8', 'perfurante', ['munição', 'duas mãos'], { normalRange: 24, longRange: 96, weight: 2.5 }),
  weapon('azagaia', 'simple', 'melee', '1d6', 'perfurante', ['arremesso'], { normalRange: 9, longRange: 36 }),
];

const armor = (slug: string, category: ArmorData['category'], baseAc: number, weight: number, strength?: number) =>
  entry<ArmorData>(slug, `A ${slug}`, {
    category,
    baseAc,
    addDex: category === 'light' || category === 'medium',
    stealthDisadvantage: category === 'heavy',
    cost: '10 po',
    weight,
    ...(strength ? { strength } : {}),
  });

const ARMOR = [
  armor('cota-de-malha', 'heavy', 16, 27.5, 13),
  armor('brunea', 'medium', 14, 22.5),
  armor('couro', 'light', 11, 5),
  armor('escudo', 'shield', 2, 3),
];

const TOOLS = [
  entry('ferramentas-de-ladrao', 'Ferramentas de ladrão', { weight: 0.5 }),
  entry('kit-de-disfarce', 'Kit de disfarce', { weight: 1.5 }),
  entry('kit-de-herbalismo', 'Kit de herbalismo', { weight: 1.5 }),
  entry('alaude', 'Alaúde', { weight: 1 }),
  entry('flauta', 'Flauta', { weight: 0.5 }),
  entry('lira', 'Lira', { weight: 1 }),
  entry('tambor', 'Tambor', { weight: 1.5 }),
  entry('ferramentas-de-ferreiro', 'Ferramentas de ferreiro', { weight: 4 }),
  entry('kit-de-jogo-conjunto-de-dados', 'Kit de jogo: conjunto de dados', {}),
];

const GEAR = [
  entry('flechas-20', 'Flechas (20)', { weight: 0.5 }),
  entry('racoes-de-viagem-1-dia', 'Rações de viagem (1 dia)', { weight: 1 }),
  entry('aljava-flechas', 'G flechas', { weight: 0.5 }), entry('simbolo-sagrado', 'G simbolo', { weight: 0.5 })];
const PACKS = [
  entry('pacote-de-explorador', 'Pacote de Explorador', {
    items: [
      { ref: { type: 'gear', slug: 'racoes-de-viagem-1-dia' }, quantity: 10 },
      { name: 'Corda de cânhamo', quantity: 1 },
    ],
  }),
  entry('pacote-de-aventureiro', 'P aventureiro', {}), entry('pacote-de-estudioso', 'P estudioso', {})];

// --- Equipment helpers --------------------------------------------------------

const ref = (type: 'weapon' | 'armor' | 'gear' | 'tool' | 'pack', slug: string, quantity = 1): EquipmentItemData => ({
  ref: { type, slug },
  quantity,
});
const bundle = (items: EquipmentItemData[], gp?: number): EquipmentBundleData => (gp ? { items, gp } : { items });
const choice = (...options: EquipmentBundleData[]): EquipmentChoiceData => ({ options });
const fixed = (...items: EquipmentItemData[]): EquipmentChoiceData => choice(bundle(items));

// --- Spells -------------------------------------------------------------------

const ALL_LISTS = ['bardo', 'bruxo', 'clerigo', 'druida', 'feiticeiro', 'mago', 'paladino', 'patrulheiro'];

const spell = (
  slug: string,
  level: number,
  classes: string[],
  over: Partial<SpellData> = {},
): CreationEntry<SpellData> =>
  entry(slug, `S ${slug}`, {
    level,
    school: 'evocação',
    castingTime: '1 ação',
    range: '18 metros',
    components: { v: true, s: true, m: false },
    duration: 'Instantânea',
    concentration: false,
    ritual: false,
    classes,
    ...over,
  });

const attackCantrip = (slug: string, classes: string[], dice: string, type: string) =>
  spell(slug, 0, classes, { mechanics: { attack: 'ranged', damage: [{ dice, type }] } });

const SCHOOLS = ['encantamento', 'ilusão', 'evocação', 'abjuração'];

const SPELLS: CreationEntry<SpellData>[] = [
  attackCantrip('rajada-mistica', ['bruxo'], '1d10', 'energia'),
  attackCantrip('raio-de-fogo', ['feiticeiro', 'mago'], '1d10', 'fogo'),
  attackCantrip('produzir-chamas', ['druida'], '1d8', 'fogo'),
  spell('maos-magicas', 0, ['bardo', 'bruxo', 'feiticeiro', 'mago']),
  spell('luz', 0, ['bardo', 'clerigo', 'feiticeiro', 'mago']),
  spell('prestidigitacao', 0, ['bardo', 'bruxo', 'feiticeiro', 'mago']),
  spell('mensagem', 0, ['bardo', 'feiticeiro', 'mago']),
  spell('chama-sagrada', 0, ['clerigo']),
  spell('orientacao', 0, ['clerigo', 'druida']),
  spell('resistencia', 0, ['clerigo', 'druida']),
  spell('arte-druidica', 0, ['druida']),
  spell('toque-arrepiante', 0, ['bruxo', 'feiticeiro', 'mago'], { mechanics: { attack: 'ranged', damage: [{ dice: '1d8', type: 'necrótico' }] } }),
  // Twelve 1st-level spells on every list, in rotating schools.
  ...Array.from({ length: 12 }, (_, i) =>
    spell(`magia-1-${String(i + 1).padStart(2, '0')}`, 1, ALL_LISTS, {
      school: SCHOOLS[i % SCHOOLS.length],
      ritual: i % 5 === 0,
      concentration: i % 3 === 0,
    }),
  ),
  spell('magia-2-01', 2, ALL_LISTS, { concentration: true }),
  spell('magia-2-02', 2, ALL_LISTS, { school: 'ilusão' }),
  spell('magia-3-01', 3, ALL_LISTS),
  spell('convocar-familiar', 1, ['mago'], { ritual: true, school: 'conjuração' }),
  // Subclass lists only.
  spell('patrono-1', 1, []),
  spell('patrono-2', 2, []),
];

// --- Classes ------------------------------------------------------------------

const FULL_SLOTS = [[2], [3], [4, 2]];
const HALF_SLOTS: number[][] = [[], [2], [3]];

const cls = (slug: string, name: string, data: Partial<ClassData> & Pick<ClassData, 'hitDie' | 'savingThrows'>) =>
  entry<ClassData>(slug, name, {
    proficiencies: { armor: [], weapons: [], tools: [] },
    skills: { choose: 2, from: ['athletics', 'perception', 'stealth', 'insight', 'arcana', 'history', 'survival'] },
    startingEquipment: [],
    subclassLevel: 3,
    features: [feature(`${name} 1`, 1), feature(`${name} 2`, 2), feature(`${name} 5`, 5)],
    ...data,
  });

const CLASSES = [
  cls('barbaro', 'Bárbaro', {
    hitDie: 12,
    savingThrows: ['str', 'con'],
    proficiencies: { armor: ['Armaduras leves', 'armaduras médias', 'escudos'], weapons: [], tools: [] },
    skills: { choose: 2, from: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    startingEquipmentChoices: [
      choice(bundle([ref('weapon', 'machado-grande')]), bundle([{ anyOf: 'martialMeleeWeapon', quantity: 1 }])),
      fixed(ref('weapon', 'azagaia', 4), ref('pack', 'pacote-de-aventureiro')),
    ],
  }),
  cls('bardo', 'Bardo', {
    hitDie: 8,
    savingThrows: ['dex', 'cha'],
    proficiencies: { armor: ['Armaduras leves'], weapons: [], tools: ['Três instrumentos à escolha'] },
    skills: { choose: 3, from: ['acrobatics', 'arcana', 'deception', 'history', 'insight', 'performance', 'persuasion', 'stealth'] },
    spellcasting: { ability: 'cha', slots: FULL_SLOTS, cantripsKnown: [2, 2, 2], spellsKnown: [4, 5, 6] },
    startingEquipmentChoices: [
      choice(bundle([ref('weapon', 'rapieira')]), bundle([ref('weapon', 'espada-longa')])),
      choice(bundle([ref('tool', 'alaude')]), bundle([{ anyOf: 'instrument', quantity: 1 }])),
      fixed(ref('armor', 'couro'), ref('weapon', 'adaga')),
    ],
  }),
  cls('bruxo', 'Bruxo', {
    hitDie: 8,
    features: [
      feature('Bruxo 1', 1),
      {
        name: 'Invocações Místicas',
        level: 2,
        description: `${TEXT}\nArmadura de Sombras. Texto inventado A.\nExplosão Agonizante. Texto inventado B.\nIdioma Bestial. Texto inventado C.`,
      },
      feature('Bruxo 5', 5),
    ],
    savingThrows: ['wis', 'cha'],
    proficiencies: { armor: ['Armaduras leves'], weapons: [], tools: [] },
    skills: { choose: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
    spellcasting: { ability: 'cha', slots: [[1], [2], [0, 2]], cantripsKnown: [2, 2, 2], spellsKnown: [2, 3, 4] },
    startingEquipmentChoices: [
      choice(bundle([ref('weapon', 'besta-leve')]), bundle([{ anyOf: 'simpleWeapon', quantity: 1 }])),
      fixed(ref('armor', 'couro'), ref('weapon', 'adaga', 2)),
    ],
  }),
  cls('clerigo', 'Clérigo', {
    hitDie: 8,
    savingThrows: ['wis', 'cha'],
    proficiencies: { armor: ['Armaduras leves', 'armaduras médias', 'escudos'], weapons: [], tools: [] },
    skills: { choose: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    spellcasting: { ability: 'wis', slots: FULL_SLOTS, cantripsKnown: [3, 3, 3] },
    startingEquipmentChoices: [
      choice(bundle([ref('armor', 'brunea')]), bundle([ref('armor', 'couro')]), bundle([ref('armor', 'cota-de-malha')])),
      fixed(ref('weapon', 'maca'), ref('armor', 'escudo'), ref('gear', 'simbolo-sagrado')),
    ],
  }),
  cls('druida', 'Druida', {
    hitDie: 8,
    savingThrows: ['int', 'wis'],
    proficiencies: { armor: ['Armaduras leves', 'armaduras médias', 'escudos'], weapons: [], tools: ['Kit de herbalismo'] },
    skills: { choose: 2, from: ['arcana', 'animalHandling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
    spellcasting: { ability: 'wis', slots: FULL_SLOTS, cantripsKnown: [2, 2, 2] },
    startingEquipmentChoices: [fixed(ref('armor', 'couro'), ref('weapon', 'bordao'))],
  }),
  cls('feiticeiro', 'Feiticeiro', {
    hitDie: 6,
    savingThrows: ['con', 'cha'],
    skills: { choose: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
    spellcasting: { ability: 'cha', slots: FULL_SLOTS, cantripsKnown: [4, 4, 4], spellsKnown: [2, 3, 4] },
    startingEquipmentChoices: [fixed(ref('weapon', 'adaga', 2), ref('weapon', 'dardo', 10))],
  }),
  cls('guerreiro', 'Guerreiro', {
    hitDie: 10,
    features: [
      feature('Guerreiro 1', 1),
      {
        name: 'Estilo de Luta',
        level: 1,
        description: `${TEXT}\nARQUEARIA - Arquearia, texto inventado.\nDEFESA - Defesa, texto inventado.\nDUELISMO - Duelismo, texto inventado.`,
      },
      feature('Guerreiro 2', 2),
      feature('Guerreiro 5', 5),
    ],
    savingThrows: ['str', 'con'],
    proficiencies: { armor: ['Todas as armaduras', 'escudos'], weapons: [], tools: [] },
    skills: { choose: 2, from: ['acrobatics', 'animalHandling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
    startingEquipmentChoices: [
      choice(bundle([ref('armor', 'cota-de-malha')]), bundle([ref('armor', 'couro'), ref('weapon', 'arco-longo'), ref('gear', 'aljava-flechas', 20)])),
      choice(
        bundle([{ anyOf: 'martialWeapon', quantity: 1 }, ref('armor', 'escudo')]),
        bundle([{ anyOf: 'martialWeapon', quantity: 2 }]),
      ),
      fixed(ref('pack', 'pacote-de-aventureiro')),
    ],
  }),
  cls('ladino', 'Ladino', {
    hitDie: 8,
    savingThrows: ['dex', 'int'],
    proficiencies: { armor: ['Armaduras leves'], weapons: [], tools: ['Ferramentas de ladrão'] },
    skills: { choose: 4, from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'sleightOfHand', 'stealth'] },
    startingEquipmentChoices: [
      choice(bundle([ref('weapon', 'rapieira')]), bundle([ref('weapon', 'espada-curta')])),
      fixed(ref('armor', 'couro'), ref('weapon', 'adaga', 2), ref('tool', 'ferramentas-de-ladrao')),
    ],
  }),
  cls('mago', 'Mago', {
    hitDie: 6,
    savingThrows: ['int', 'wis'],
    skills: { choose: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
    spellcasting: { ability: 'int', slots: FULL_SLOTS, cantripsKnown: [3, 3, 3] },
    startingEquipmentChoices: [
      choice(bundle([ref('weapon', 'bordao')]), bundle([ref('weapon', 'adaga')])),
      fixed(ref('pack', 'pacote-de-estudioso')),
    ],
  }),
  cls('monge', 'Monge', {
    hitDie: 8,
    savingThrows: ['str', 'dex'],
    proficiencies: { armor: [], weapons: [], tools: ['Um tipo de ferramenta à escolha'] },
    skills: { choose: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
    startingEquipmentChoices: [
      choice(bundle([ref('weapon', 'espada-curta')]), bundle([{ anyOf: 'simpleWeapon', quantity: 1 }])),
      fixed(ref('weapon', 'dardo', 10)),
    ],
  }),
  cls('paladino', 'Paladino', {
    hitDie: 10,
    savingThrows: ['wis', 'cha'],
    proficiencies: { armor: ['Todas as armaduras', 'escudos'], weapons: [], tools: [] },
    skills: { choose: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
    spellcasting: { ability: 'cha', slots: HALF_SLOTS },
    startingEquipmentChoices: [
      choice(bundle([{ anyOf: 'martialWeapon', quantity: 1 }, ref('armor', 'escudo')]), bundle([{ anyOf: 'martialWeapon', quantity: 2 }])),
      fixed(ref('armor', 'cota-de-malha'), ref('weapon', 'azagaia', 5)),
    ],
  }),
  cls('patrulheiro', 'Patrulheiro', {
    hitDie: 10,
    savingThrows: ['str', 'dex'],
    proficiencies: { armor: ['Armaduras leves', 'armaduras médias', 'escudos'], weapons: [], tools: [] },
    skills: { choose: 3, from: ['animalHandling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
    spellcasting: { ability: 'wis', slots: HALF_SLOTS, spellsKnown: [0, 2, 3] },
    startingEquipmentChoices: [
      choice(bundle([ref('armor', 'brunea')]), bundle([ref('armor', 'couro')])),
      fixed(ref('weapon', 'arco-longo'), ref('gear', 'flechas-20'), ref('weapon', 'espada-curta', 2)),
      fixed(ref('pack', 'pacote-de-explorador')),
    ],
  }),
];

// --- Subclasses ---------------------------------------------------------------

const sub = (slug: string, parent: string, features: FeatureData[] = []) =>
  entry<SubclassData>(slug, `Sub ${slug}`, {
    parent,
    features: [feature(`${slug} 3`, 3), ...features, feature(`${slug} 7`, 7)],
  });

const SUBCLASSES = [
  sub('caminho-do-guerreiro-totemico', 'barbaro'),
  sub('colegio-do-conhecimento', 'bardo'),
  sub('o-corruptor', 'bruxo', [feature('Lista Expandida', 1, { spellsBySpellLevel: { '1': ['patrono-1'], '2': ['patrono-2'], '3': ['magia-3-01'] } })]),
  sub('dominio-da-vida', 'clerigo', [
    feature('Magias de Domínio', 1, { spellsBySpellLevel: { '1': ['magia-1-11', 'magia-1-12'], '2': ['magia-2-01', 'magia-2-02'], '3': ['magia-3-01'] } }),
  ]),
  sub('circulo-da-terra', 'druida', [
    feature('Magias de Círculo', 3, { spellsByTerrain: { floresta: { '2': ['magia-2-02'], '3': ['magia-3-01'] } } }),
  ]),
  sub('linhagem-draconica', 'feiticeiro'),
  sub('campeao', 'guerreiro'),
  sub('cavaleiro-arcano', 'guerreiro'),
  sub('trapaceiro-arcano', 'ladino'),
  sub('escola-de-evocacao', 'mago'),
  sub('caminho-dos-quatro-elementos', 'monge'),
  sub('juramento-de-devocao', 'paladino', [
    feature('Magias de Juramento', 3, { spellsBySpellLevel: { '1': ['magia-1-12'], '3': ['magia-3-01'] } }),
  ]),
  sub('conclave-do-cacador', 'patrulheiro'),
];

// --- Races --------------------------------------------------------------------

const race = (slug: string, name: string, data: Partial<RaceData>) =>
  entry<RaceData>(slug, name, { size: 'Médio', speed: 9, traits: [trait(`${name} traço`)], ...data });
const subrace = (slug: string, name: string, parent: string, data: Partial<SubraceData> = {}) =>
  entry<SubraceData>(slug, name, { parent, traits: [trait(`${name} traço`)], ...data });

const RACES = [
  race('humano', 'Humano', {
    abilityIncreases: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    languages: ['Comum', 'Um idioma à sua escolha'],
  }),
  race('anao', 'Anão', {
    speed: 7.5,
    abilityIncreases: { con: 2 },
    languages: ['Comum', 'Anão'],
    proficiencies: ['machado grande', 'uma ferramenta à escolha entre algumas'],
  }),
  race('elfo', 'Elfo', { abilityIncreases: { dex: 2 }, languages: ['Comum', 'Élfico'], proficiencies: ['perception'] }),
  race('meio-elfo', 'Meio-Elfo', { abilityIncreases: { cha: 2 }, languages: ['Comum', 'Élfico', 'Um idioma à sua escolha'] }),
  race('meio-orc', 'Meio-Orc', { abilityIncreases: { str: 2, con: 1 }, languages: ['Comum', 'Orc'], proficiencies: ['intimidation'] }),
  race('tiefling', 'Tiefling', { abilityIncreases: { cha: 2, int: 1 }, languages: ['Comum', 'Infernal'] }),
  race('draconato', 'Draconato', { abilityIncreases: { str: 2, cha: 1 }, languages: ['Comum', 'Dracônico'] }),
  race('halfling', 'Halfling', { size: 'Pequeno', speed: 7.5, abilityIncreases: { dex: 2 }, languages: ['Comum', 'Halfling'] }),
];

const SUBRACES = [
  subrace('humano-variante', 'Humano Variante', 'humano'),
  subrace('anao-da-colina', 'Anão da Colina', 'anao', { abilityIncreases: { wis: 1 } }),
  subrace('alto-elfo', 'Alto Elfo', 'elfo', {
    abilityIncreases: { int: 1 },
    languages: ['Um idioma à sua escolha'],
    proficiencies: ['espada longa', 'arco longo'],
  }),
  subrace('elfo-da-floresta', 'Elfo da Floresta', 'elfo', {
    abilityIncreases: { wis: 1 },
    speed: 10.5,
    proficiencies: ['espada longa', 'arco longo'],
  }),
  subrace('halfling-pes-leves', 'Pés-Leves', 'halfling', { abilityIncreases: { cha: 1 } }),
];

// --- Backgrounds and feats ----------------------------------------------------

const background = (slug: string, name: string, skills: string[], tools: string[], languages?: number) =>
  entry<BackgroundData>(slug, name, {
    proficiencies: { skills, tools },
    ...(languages ? { languages } : {}),
    equipment: [],
    startingEquipmentChoices: [{ options: [{ items: [], gp: 10 }] }],
    feature: trait(`${name} característica`),
    personality: {
      traits: rows(`${name} traço`, 8),
      ideals: rows(`${name} ideal`, 6),
      bonds: rows(`${name} vínculo`, 6),
      flaws: rows(`${name} defeito`, 6),
    },
  });

/** An invented d8/d6 table: "Soldado ideal 1", "Soldado ideal 2"... */
const rows = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

const BACKGROUNDS = [
  background('acolito', 'Acólito', ['insight', 'religion'], [], 2),
  background('criminoso', 'Criminoso', ['deception', 'stealth'], ['Um tipo de kit de jogo', 'Ferramentas de ladrão']),
  background('soldado', 'Soldado', ['athletics', 'intimidation'], ['Um tipo de kit de jogo', 'Veículos (terrestres)']),
  background('sabio', 'Sábio', ['arcana', 'history'], [], 2),
  background('artista', 'Artista', ['acrobatics', 'performance'], ['Kit de disfarce', 'Um tipo de instrumento musical']),
  background('eremita', 'Eremita', ['medicine', 'religion'], ['Kit de herbalismo'], 1),
  background('forasteiro', 'Forasteiro', ['athletics', 'survival'], ['Um tipo de instrumento musical'], 1),
  background('marinheiro', 'Marinheiro', ['athletics', 'perception'], []),
];

const FEATS = [
  entry('mobilidade', 'Mobilidade', {}),
  entry('alerta', 'Alerta', {}),
  entry('robusto', 'Robusto', {}),
  entry('perito', 'Perito', {}),
  entry('atleta', 'Atleta', {}),
];

export const CREATION_DATA: CreationData = {
  races: RACES,
  subraces: SUBRACES,
  classes: CLASSES,
  subclasses: SUBCLASSES,
  backgrounds: BACKGROUNDS,
  feats: FEATS,
  spells: SPELLS,
  weapons: WEAPONS,
  armor: ARMOR,
  gear: GEAR,
  tools: TOOLS,
  packs: PACKS,
};

export const FIXTURE_BOOK = BOOK;
