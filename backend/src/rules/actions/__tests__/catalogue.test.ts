import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { characterActions, npcActions, spellcastingModifier, characterLevel, CompendiumSpell, CompendiumWeapon } from '../catalogue';
import { fifthEditionCharacterDataSchema } from '../../../validators/game-systems/fifthEdition.schema';

const SHEETS = resolve(__dirname, '../../../../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets');
const sheet = (name: string) => JSON.parse(readFileSync(resolve(SHEETS, `${name}.json`), 'utf8'));

const weapon = (over: Partial<CompendiumWeapon['data']> = {}): CompendiumWeapon => ({
  slug: 'x',
  name: 'X',
  data: { range: 'melee', damage: { dice: '1d8', type: 'cortante' }, properties: [], ...over },
});
const spell = (data: Partial<CompendiumSpell['data']>, name = 'Magia'): CompendiumSpell => ({
  slug: 'm',
  name,
  data: { level: 0, range: '36 metros', concentration: false, ...data },
});

const spells = new Map<string, CompendiumSpell>([
  ['book-test/raio-de-fogo', spell({ range: '36 metros', mechanics: { attack: 'ranged', damage: [{ dice: '1d10', type: 'fogo' }], scaling: { cantrip: true } } }, 'Raio de Fogo')],
  ['book-test/curar-ferimentos', spell({ level: 1, range: 'Toque', mechanics: { damage: [], healing: '1d8', healingAddsModifier: true, scaling: { perSlot: '1d8' } } }, 'Curar Ferimentos')],
  ['book-test/luz', spell({ range: 'Toque', mechanics: { damage: [] } }, 'Luz')],
  ['book-test/bencao', spell({ level: 1, concentration: true, range: '9 metros' }, 'Bênção')],
]);
const weapons = new Map<string, CompendiumWeapon>([
  ['book-test/espada-longa', weapon({ properties: ['versátil'] })],
]);

describe('characterActions', () => {
  it('lists a fighter weapon with both grips', () => {
    const out = characterActions(sheet('guerreiro'), spells, weapons);
    const a = out.find((s) => s.option.id === 'attack:0')!;
    expect(a.option).toMatchObject({ name: 'Espada longa', group: 'attack', resolution: 'attack', grips: ['one', 'two'], reach: { kind: 'feet', normal: 5 } });
    expect(a.attackBonus).toBe(5);
    expect(a.damage).toEqual([{ dice: '1d8+3', type: 'cortante' }]);
    expect(a.versatileDamage).toEqual({ dice: '1d10+3', type: 'cortante' });
    const b = out.find((s) => s.option.id === 'attack:1')!;
    expect(b.option.grips).toBeUndefined();
  });

  it('lists a wizard attack cantrip once, as the spell', () => {
    const out = characterActions(sheet('mago'), spells, weapons);
    const s = out.find((x) => x.option.id === 'spell:book-test/raio-de-fogo')!;
    expect(s.option).toMatchObject({ name: 'Raio de Fogo', group: 'spell', resolution: 'attack', spellLevel: 0, reach: { kind: 'feet', normal: 120 } });
    expect(s.attackBonus).toBe(5);
    expect(s.damage).toEqual([{ dice: '1d10', type: 'fogo' }]);
    expect(s.scaling).toEqual({ cantrip: true });
    expect(out.filter((x) => x.option.name.toLowerCase().includes('fogo'))).toHaveLength(1);
    expect(out.find((x) => x.option.id === 'attack:0')).toBeDefined();
    expect(out.find((x) => x.option.id === 'attack:1')).toBeUndefined();
  });

  it('adds the sheet row\'s flat modifier to an attack cantrip it duplicates, keeping the book\'s dice', () => {
    const withRow = (roll: string) => {
      const w = sheet('mago');
      w.attacks.find((a: any) => a.name === 'S raio-de-fogo').damageRoll = roll;
      const found = characterActions(w, spells, weapons).find((x) => x.option.id === 'spell:book-test/raio-de-fogo')!;
      return found.damage;
    };
    expect(withRow('1d10+3')).toEqual([{ dice: '1d10+3', type: 'fogo' }]);
    expect(withRow('1d10 - 1')).toEqual([{ dice: '1d10-1', type: 'fogo' }]);
    expect(withRow('1d10')).toEqual([{ dice: '1d10', type: 'fogo' }]);
    expect(withRow('muito')).toEqual([{ dice: '1d10', type: 'fogo' }]);
  });

  it('lists a healing spell with the modifier flag', () => {
    const c = sheet('clerigo');
    c.spellcasting.spells = [{ level: 1, name: 'Curar Ferimentos', prepared: true, ritual: false, concentration: false, compendiumRef: { bookId: 'book-test', slug: 'curar-ferimentos' } }];
    const s = characterActions(c, spells, weapons).find((x) => x.option.id === 'spell:book-test/curar-ferimentos')!;
    expect(s.option).toMatchObject({ resolution: 'heal', spellLevel: 1, reach: { kind: 'touch' } });
    expect(s.healing).toEqual({ dice: '1d8', addModifier: true });
    expect(s.scaling).toEqual({ perSlot: '1d8' });
  });

  it('lists a spell without attack or healing as a cast, with concentration', () => {
    const c = sheet('clerigo');
    c.spellcasting.spells = [{ level: 1, name: 'Bênção', prepared: true, ritual: false, concentration: true, compendiumRef: { bookId: 'book-test', slug: 'bencao' } }];
    const s = characterActions(c, spells, weapons).find((x) => x.option.id === 'spell:book-test/bencao')!;
    expect(s.option).toMatchObject({ resolution: 'cast', concentration: true });
  });

  it('gives a hand-made melee weapon 5 ft reach', () => {
    const out = characterActions({ attacks: [{ name: 'Clava', attackBonus: 3, damageRoll: '1d4+1' }] } as any, spells, weapons);
    expect(out).toHaveLength(1);
    expect(out[0].option).toMatchObject({ id: 'attack:0', name: 'Clava', reach: { kind: 'feet', normal: 5 } });
    expect(out[0].damage).toEqual([{ dice: '1d4+1', type: undefined }]);
  });

  it('gives a reach weapon 10 ft', () => {
    const out = characterActions({ attacks: [{ name: 'Chicote', attackBonus: 3, damageRoll: '1d4', properties: ['alcance'] }] } as any, spells, weapons);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 10 });
  });

  it('adds extra damage lines that are not the two-handed one', () => {
    const out = characterActions({ attacks: [{ name: 'Espada Flamejante', attackBonus: 6, damageRoll: '1d8+3', damageType: 'cortante', additionalDamage: [{ label: 'Fogo', damageRoll: '1d6', damageType: 'fogo' }, { label: '', damageRoll: '' }] }] } as any, spells, weapons);
    expect(out[0].damage).toEqual([{ dice: '1d8+3', type: 'cortante' }, { dice: '1d6', type: 'fogo' }]);
    expect(out[0].option.grips).toBeUndefined();
  });

  it('adds a thrown option for a thrown weapon, from its compendium range', () => {
    const w = new Map([['book-test/adaga', weapon({ properties: ['acuidade', 'leve', 'arremesso'], normalRange: 6, longRange: 18 })]]);
    const out = characterActions({ attacks: [{ name: 'Adaga', attackBonus: 4, damageRoll: '1d4+2', compendiumRef: { bookId: 'book-test', slug: 'adaga' } }] } as any, spells, w);
    expect(out.map((x) => x.option.id)).toEqual(['attack:0', 'attack:0:thrown']);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 5 });
    expect(out[1].option.reach).toEqual({ kind: 'feet', normal: 20, long: 60 });
    expect(out[1].damage).toEqual(out[0].damage);
  });

  it('reads a ranged weapon range in feet', () => {
    const w = new Map([['book-test/arco', weapon({ range: 'ranged', normalRange: 24, longRange: 96, properties: ['munição'] })]]);
    const out = characterActions({ attacks: [{ name: 'Arco', attackBonus: 4, damageRoll: '1d8', compendiumRef: { bookId: 'book-test', slug: 'arco' } }] } as any, spells, w);
    expect(out).toHaveLength(1);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 80, long: 320 });
  });

  it("reads a hand-made ranged weapon's range from the sheet, in feet", () => {
    const out = characterActions({ attacks: [{ name: 'Funda', attackBonus: 3, damageRoll: '1d4+1', range: 30 }] } as any, spells, weapons);
    expect(out).toHaveLength(1);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 30 });
  });

  it("keeps a hand-made thrown weapon in melee and throws it to the sheet's range", () => {
    const out = characterActions({ attacks: [{ name: 'Lança', attackBonus: 3, damageRoll: '1d6+1', range: 20, properties: ['thrown'] }] } as any, spells, weapons);
    expect(out.map((x) => x.option.id)).toEqual(['attack:0', 'attack:0:thrown']);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 5 });
    expect(out[1].option.reach).toEqual({ kind: 'feet', normal: 20 });
  });

  it('reads the English reach property', () => {
    const out = characterActions({ attacks: [{ name: 'Whip', attackBonus: 3, damageRoll: '1d4', properties: ['Reach'] }] } as any, spells, weapons);
    expect(out[0].option.reach).toEqual({ kind: 'feet', normal: 10 });
  });

  it('lists a spell with no compendium entry as a cast, by its index on the sheet', () => {
    const c = sheet('clerigo');
    c.spellcasting.spells = [
      { level: 1, name: 'Bênção', prepared: true, ritual: false, concentration: true, compendiumRef: { bookId: 'book-test', slug: 'bencao' } },
      { level: 2, name: 'Magia caseira', prepared: true, ritual: false, concentration: true },
    ];
    c.spellcasting.cantrips = [...c.spellcasting.cantrips, 'Truque caseiro'];
    const out = characterActions(c, spells, weapons);
    const s = out.find((x) => x.option.id === 'spell:sheet:1')!;
    expect(s.option).toMatchObject({ name: 'Magia caseira', group: 'spell', resolution: 'cast', spellLevel: 2, concentration: true });
    const cantrip = out.find((x) => x.option.id === `spell:sheet-cantrip:${c.spellcasting.cantrips.length - 1}`)!;
    expect(cantrip.option).toMatchObject({ name: 'Truque caseiro', resolution: 'cast', spellLevel: 0 });
    // A cantrip the sheet already points at a book for is listed once, by its book id.
    expect(out.filter((x) => x.option.name === 'S luz' || x.option.id.startsWith('spell:sheet-cantrip:')).length).toBe(1);
  });

  it('leaves out a spell with no compendium entry that the sheet already lists as an attack', () => {
    const out = characterActions({
      attacks: [{ name: 'Rajada caseira', attackBonus: 5, damageRoll: '1d10' }],
      spellcasting: { cantrips: ['Rajada caseira'], spells: [] },
    } as any, spells, weapons);
    expect(out.map((x) => x.option.id)).toEqual(['attack:0']);
  });

  it('gives a cast spell its compendium text to post', () => {
    const withText = new Map(spells);
    withText.set('book-test/bencao', { ...spells.get('book-test/bencao')!, text: 'Texto inventado da magia.' });
    const c = sheet('clerigo');
    c.spellcasting.spells = [{ level: 1, name: 'Bênção', prepared: true, ritual: false, concentration: true, compendiumRef: { bookId: 'book-test', slug: 'bencao' } }];
    const s = characterActions(c, withText, weapons).find((x) => x.option.id === 'spell:book-test/bencao')!;
    expect(s.description).toBe('Texto inventado da magia.');
  });

  it('keeps an attack with unreadable damage, with no damage', () => {
    const out = characterActions({ attacks: [{ name: 'Golpe', attackBonus: 3, damageRoll: 'muito' }] } as any, spells, weapons);
    expect(out[0].option.id).toBe('attack:0');
    expect(out[0].damage).toEqual([]);
  });

  it('normalises a unicode minus in dice', () => {
    const out = characterActions({ attacks: [{ name: 'Bordão', attackBonus: 0, damageRoll: '1d6\u22121' }] } as any, spells, weapons);
    expect(out[0].damage).toEqual([{ dice: '1d6-1', type: undefined }]);
  });

  it('works on a sheet with no attacks and no spellcasting', () => {
    expect(characterActions({} as any, spells, weapons)).toEqual([]);
  });

  it('all fixture sheets list without throwing and with unique ids', () => {
    for (const n of ['barbaro', 'bardo', 'bruxo', 'clerigo', 'druida', 'feiticeiro', 'guerreiro', 'ladino', 'mago', 'monge', 'paladino', 'patrulheiro']) {
      const ids = characterActions(sheet(n), spells, weapons).map((s) => s.option.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('spellcastingModifier and characterLevel', () => {
  it('reads the ability modifier and level from the sheet', () => {
    const c = sheet('clerigo');
    expect(spellcastingModifier(c)).toBe(Math.floor((c.stats.wisdom.score - 10) / 2));
    expect(characterLevel(c)).toBe(c.level);
  });
  it('is 0 and 1 for a bare sheet', () => {
    expect(spellcastingModifier({} as any)).toBe(0);
    expect(characterLevel({} as any)).toBe(1);
  });
});

describe('schema fields', () => {
  it('accepts concentratingOn, and sheets without it', () => {
    const c = sheet('clerigo');
    expect(fifthEditionCharacterDataSchema.safeParse(c).success).toBe(true);
    const withIt = fifthEditionCharacterDataSchema.safeParse({ ...c, concentratingOn: { name: 'Bênção', compendiumRef: { bookId: 'book-test', slug: 'bencao' } } });
    expect(withIt.success && withIt.data.concentratingOn?.name).toBe('Bênção');
    expect(fifthEditionCharacterDataSchema.safeParse({ ...c, concentratingOn: null }).success).toBe(true);
  });
});

describe('npcActions', () => {
  const goblin = {
    actions: [
      { name: 'Cimitarra', description: 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.' },
      { name: 'Arco Curto', description: 'Ataque à Distância com Arma: +4 para atingir, distância 24/96 m, um alvo. Acerto: 5 (1d6 + 2) de dano perfurante.' },
    ],
    bonusActions: [{ name: 'Fuga Ágil', description: 'O goblin pode usar Desengajar ou Esconder como ação bônus.' }],
  };

  it('lists the goblin attacks as attacks and the rest as posts', () => {
    const out = npcActions(goblin as any);
    expect(out.map((o) => o.option.id)).toEqual(['npc:actions:0', 'npc:actions:1', 'npc:bonusActions:0']);
    expect(out.filter((o) => o.option.resolution === 'attack')).toHaveLength(2);
    expect(out[0]).toMatchObject({ attackBonus: 4, damage: [{ dice: '1d6 + 2', type: 'cortante' }] });
    expect(out[0].option).toMatchObject({ group: 'npc', name: 'Cimitarra', reach: { kind: 'feet', normal: 5 } });
    expect(out[0].option.summary).toBe('+4, 1d6 + 2 cortante');
    expect(out[1].option.reach).toEqual({ kind: 'feet', normal: 80, long: 320 });
    expect(out[2].option.resolution).toBe('post');
    expect(out[2].description).toMatch(/Desengajar/);
  });

  it('handles an empty stat block and reactions', () => {
    expect(npcActions({} as any)).toEqual([]);
    expect(npcActions({ reactions: [{ name: 'Aparar', description: 'Texto.' }] } as any)[0].option.id).toBe('npc:reactions:0');
  });

  it('posts the text of an attack whose damage cannot be read (a net, say)', () => {
    const description = 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (muito) de dano cortante.';
    const out = npcActions({ actions: [{ name: 'X', description }] } as any);
    expect(out[0].option).toMatchObject({ id: 'npc:actions:0', resolution: 'post' });
    expect(out[0].description).toBe(description);
  });
});

const DATA = resolve(__dirname, '../../../../../materiais/.compendio/data/phb');
(existsSync(resolve(DATA, 'spell.json')) ? describe : describe.skip)('real compendium data', () => {
  it('curated healing spells add the modifier', () => {
    const all = JSON.parse(readFileSync(resolve(DATA, 'spell.json'), 'utf8'));
    for (const slug of ['curar-ferimentos', 'palavra-curativa', 'oracao-curativa']) {
      expect(all.find((s: any) => s.slug === slug).data.mechanics.healingAddsModifier).toBe(true);
    }
  });
});
