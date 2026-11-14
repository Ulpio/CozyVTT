/**
 * Monsters from the Monster Manual's extracted text (pdftotext, no layout).
 *
 * A stat block is: the name in capitals; a type line ("Humanoide Pequeno
 * (goblinoide), neutro e mau"); "Classe de Armadura … Pontos de Vida …
 * Deslocamento …"; the six scores ("FOR 8 (–1)"); the properties (Testes de
 * Resistência, Perícias, damage and condition lines, Sentidos, Idiomas,
 * Nível de Desafio), often several on one line; the traits ("Nome. texto");
 * and the sections AÇÕES, REAÇÕES and AÇÕES LENDÁRIAS. A monster's lore comes
 * before its block under a heading with the same name, with no type line.
 *
 * The block is kept as the creature library's stat block (NpcStatBlock), with
 * the saves and skills under the keys the 5e rules use (str, perception…).
 */

import type { RawMonster } from '../types';
import { isTitle, lines, nextFilled, paragraphs, titleCase } from './text';

const TYPE_LINE = /^\p{Lu}[\p{L}-]+(?: [\p{L}-]+)? (Miúd[oa]|Pequen[oa]|Médi[oa]|Grande|Enorme|Imens[oa])\b.*,\s*\S/u;
const SECTIONS: Record<string, 'actions' | 'reactions' | 'legendaryActions'> = {
  'AÇÕES': 'actions',
  'REAÇÕES': 'reactions',
  'AÇÕES LENDÁRIAS': 'legendaryActions',
};

const ABILITIES: [string, keyof Abilities][] = [
  ['FOR', 'str'],
  ['DES', 'dex'],
  ['CON', 'con'],
  ['INT', 'int'],
  ['SAB', 'wis'],
  ['CAR', 'cha'],
];
type Abilities = { str: number; dex: number; con: number; int: number; wis: number; cha: number };

const SAVE_KEYS: Record<string, keyof Abilities> = { for: 'str', des: 'dex', con: 'con', int: 'int', sab: 'wis', car: 'cha' };

const SKILL_KEYS: Record<string, string> = {
  acrobacia: 'acrobatics',
  'adestrar animais': 'animalHandling',
  arcanismo: 'arcana',
  atletismo: 'athletics',
  'atuação': 'performance',
  'enganação': 'deception',
  furtividade: 'stealth',
  'história': 'history',
  'intimidação': 'intimidation',
  'intuição': 'insight',
  'investigação': 'investigation',
  medicina: 'medicine',
  natureza: 'nature',
  'percepção': 'perception',
  'persuasão': 'persuasion',
  'prestidigitação': 'sleightOfHand',
  'religião': 'religion',
  'sobrevivência': 'survival',
};

const LABELS = [
  'Testes de Resistência',
  'Perícias',
  'Vulnerabilidade a Dano',
  'Resistência a Dano',
  'Imunidade a Dano',
  'Imunidade a Condição',
  'Sentidos',
  'Idiomas',
  'Nível de Desafio',
] as const;
type Label = (typeof LABELS)[number];

/** A modifier as the books write it, with a hyphen, an en dash or a minus sign. */
function modifier(text: string): number {
  return Number(text.replace(/[–−]/g, '-'));
}

/** "Des +5, Con +9" or "Percepção +3, Furtividade +4", with names mapped to keys. */
function bonuses(text: string, keys: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const match of text.matchAll(/([\p{L} ]+?)\s*([+\-–−]\d+)/gu)) {
    const name = match[1].trim().toLowerCase();
    out[keys[name] ?? name] = modifier(match[2]);
  }
  return out;
}

/** Each labelled property's value, from a properties text that may run several onto one line. */
function properties(text: string): Partial<Record<Label, string>> {
  const pattern = new RegExp(`(${LABELS.join('|')})\\s`, 'g');
  const found = [...text.matchAll(pattern)];
  const out: Partial<Record<Label, string>> = {};
  found.forEach((match, i) => {
    const start = match.index! + match[0].length;
    const end = i + 1 < found.length ? found[i + 1].index! : text.length;
    out[match[1] as Label] = text.slice(start, end).trim();
  });
  return out;
}

/** "Nome. texto" paragraphs as named entries; a paragraph without a name goes on the one before. */
function named(paras: string[], firstName?: string): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = [];
  for (const para of paras) {
    const match = /^([^.]{1,80})\.\s+(.*)$/s.exec(para);
    if (match && /^\p{Lu}/u.test(match[1])) {
      out.push({ name: match[1].trim(), description: match[2].trim() });
    } else if (out.length > 0) {
      out[out.length - 1].description += ` ${para}`;
    } else {
      out.push({ name: firstName ?? 'Notas', description: para });
    }
  }
  return out;
}

export function parseMonsters(text: string): { monsters: RawMonster[]; unrecognized: string[] } {
  const all = lines(text);
  const monsters: RawMonster[] = [];
  const unrecognized: string[] = [];

  for (let i = 0; i < all.length; i++) {
    if (!isTitle(all[i]) || SECTIONS[all[i].trim()]) continue;
    const typeAt = nextFilled(all, i + 1);
    if (typeAt >= all.length || !TYPE_LINE.test(all[typeAt].trim())) continue;
    const acAt = nextFilled(all, typeAt + 1);
    if (acAt >= all.length || !all[acAt].trim().startsWith('Classe de Armadura')) {
      unrecognized.push(all[i].trim());
      continue;
    }

    // The block runs to the next title that is not one of its sections.
    let end = acAt + 1;
    while (end < all.length && !(isTitle(all[end]) && !SECTIONS[all[end].trim()])) end++;
    const block = all.slice(acAt, end);

    // The properties end with the challenge rating.
    const crAt = block.findIndex((line) => line.includes('Nível de Desafio'));
    const head = block
      .slice(0, crAt + 1)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');

    const ac = Number(/Classe de Armadura (\d+)/.exec(head)?.[1]);
    const hpMatch = /Pontos de Vida (\d+)(?: \(([^)]+)\))?/.exec(head);
    const speed = /Deslocamento (.*?)(?= FOR \d|$)/.exec(head)?.[1].trim() ?? '';

    const abilities = {} as Abilities;
    const attributeModifiers = {} as Abilities;
    let afterScores = 0;
    for (const [label, key] of ABILITIES) {
      const match = new RegExp(`\\b${label} (\\d+) \\(([+\\-–−]?\\d+)\\)`).exec(head);
      if (match) {
        abilities[key] = Number(match[1]);
        attributeModifiers[key] = modifier(match[2]);
        afterScores = Math.max(afterScores, match.index + match[0].length);
      }
    }
    const props = properties(head.slice(afterScores));
    const crMatch = /^(\S+)(?: \(([\d.,]+) XP\))?/.exec(props['Nível de Desafio'] ?? '');

    // Traits until the first section; then each section's entries.
    const sections: Record<string, string[]> = { traits: [], actions: [], reactions: [], legendaryActions: [] };
    let current = 'traits';
    for (const line of block.slice(crAt + 1)) {
      const section = SECTIONS[line.trim()];
      if (section) current = section;
      else sections[current].push(line);
    }

    const typeLine = all[typeAt].trim();
    const comma = typeLine.lastIndexOf(',');
    const creatureType = typeLine.slice(0, comma).trim();
    const alignment = typeLine.slice(comma + 1).trim();
    const challengeRating = crMatch?.[1];

    const statBlock: Record<string, unknown> = {
      ac,
      hp: Number(hpMatch?.[1]),
      hpMax: Number(hpMatch?.[1]),
      ...(hpMatch?.[2] ? { hitDice: hpMatch[2].trim() } : {}),
      speed,
      abilities,
      attributeModifiers,
      creatureType,
      alignment,
      ...(challengeRating ? { challengeRating } : {}),
      ...(crMatch?.[2] ? { xp: Number(crMatch[2].replace(/[.,]/g, '')) } : {}),
      ...(props['Testes de Resistência'] ? { savingThrows: bonuses(props['Testes de Resistência'], SAVE_KEYS) } : {}),
      ...(props['Perícias'] ? { skills: bonuses(props['Perícias'], SKILL_KEYS) } : {}),
      ...(props['Vulnerabilidade a Dano'] ? { damageVulnerabilities: props['Vulnerabilidade a Dano'] } : {}),
      ...(props['Resistência a Dano'] ? { damageResistances: props['Resistência a Dano'] } : {}),
      ...(props['Imunidade a Dano'] ? { damageImmunities: props['Imunidade a Dano'] } : {}),
      ...(props['Imunidade a Condição'] ? { conditionImmunities: props['Imunidade a Condição'] } : {}),
      ...(props['Sentidos'] ? { senses: props['Sentidos'] } : {}),
      ...(props['Idiomas'] ? { languages: props['Idiomas'] } : {}),
      traits: named(paragraphs(sections.traits)),
      actions: named(paragraphs(sections.actions)),
    };
    if (sections.reactions.length) statBlock.reactions = named(paragraphs(sections.reactions));
    if (sections.legendaryActions.length) statBlock.legendaryActions = named(paragraphs(sections.legendaryActions), 'Ações Lendárias');

    monsters.push({ name: titleCase(all[i]), creatureType, alignment, challengeRating, statBlock });
    i = end - 1;
  }
  return { monsters, unrecognized };
}
