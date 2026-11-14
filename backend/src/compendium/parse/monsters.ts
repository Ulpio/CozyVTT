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

// "Humanoide Pequeno (goblinoide), neutro e mau" or "Besta pequena, imparcial":
// a type, its size (any case), what a swarm is made of ("de bestas Miúdas"),
// an optional note in parentheses, a comma, the alignment. Nothing else may
// sit between the size and the comma, so an action such as
// "Machado Grande. Ataque…" is not taken for a type line.
const TYPE_LINE =
  /^\p{Lu}[\p{L}-]+(?: [\p{L}-]+)? ([Mm]iúd[oa]|[Pp]equen[oa]|[Mm]édi[oa]|[Gg]rande|[Ee]norme|[Ii]mens[oa])(?: de [\p{L} ]+)?(?: \([^)]*\))?,\s*\S/u;
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

/** A section heading ("AÇÕES", or "Ações" as some blocks write it), whatever its case. */
function section(line: string): 'actions' | 'reactions' | 'legendaryActions' | undefined {
  return SECTIONS[line.trim().toUpperCase()];
}

/** The index of the last line before `from` that is not blank. */
function previousFilled(all: string[], from: number): number {
  let i = from;
  while (i >= 0 && all[i].trim() === '') i--;
  return i;
}

/** A line that can be a block's name: short, starting with a letter, not a sentence. */
function isName(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && trimmed.length <= 60 && /^\p{L}/u.test(trimmed) && !/[.:;]$/.test(trimmed);
}

export function parseMonsters(text: string): { monsters: RawMonster[]; unrecognized: string[] } {
  const all = lines(text);
  const monsters: RawMonster[] = [];
  const unrecognized: string[] = [];

  // A block is anchored on its type line followed by its Armor Class line;
  // its name is the line before, in capitals or not ("Orog").
  const anchors: { titleAt: number; typeAt: number; acAt: number }[] = [];
  for (let typeAt = 0; typeAt < all.length; typeAt++) {
    if (!TYPE_LINE.test(all[typeAt].trim())) continue;
    const titleAt = previousFilled(all, typeAt - 1);
    if (titleAt < 0) continue;
    const acAt = nextFilled(all, typeAt + 1);
    const hasAc = acAt < all.length && all[acAt].trim().startsWith('Classe de Armadura');
    if (!hasAc) {
      // A title, a type line and no stat block: worth a look.
      if (isTitle(all[titleAt])) unrecognized.push(all[titleAt].trim());
      continue;
    }
    if (!isName(all[titleAt])) {
      unrecognized.push(`(no name) ${all[typeAt].trim()}`);
      continue;
    }
    anchors.push({ titleAt, typeAt, acAt });
  }

  for (let a = 0; a < anchors.length; a++) {
    const { titleAt, typeAt, acAt } = anchors[a];

    // The block runs to the next block's name, or to the next title that is
    // not one of its sections, whichever comes first.
    const nextBlock = anchors[a + 1]?.titleAt ?? all.length;
    let end = acAt + 1;
    while (end < nextBlock && !(isTitle(all[end]) && !section(all[end]))) end++;
    const block = all.slice(acAt, end);

    // The header ends with the challenge rating, or with a score the page put
    // after it (CAR below the properties, in some blocks), whichever is last
    // before the first section.
    const firstSection = block.findIndex((line) => section(line));
    const beforeSections = firstSection === -1 ? block.length : firstSection;
    const crAt = block.findIndex((line) => line.includes('Nível de Desafio'));
    let headEnd = crAt;
    block.slice(0, beforeSections).forEach((line, k) => {
      if (/^(FOR|DES|CON|INT|SAB|CAR) \d+ \(/.test(line.trim())) headEnd = Math.max(headEnd, k);
    });
    const head = block
      .slice(0, headEnd + 1)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');

    const abilities = {} as Abilities;
    const attributeModifiers = {} as Abilities;
    let rest = head;
    for (const [label, key] of ABILITIES) {
      const pattern = new RegExp(`\\b${label} (\\d+) \\(([+\\-–−]?\\d+)\\)`);
      const match = pattern.exec(head);
      if (match) {
        abilities[key] = Number(match[1]);
        attributeModifiers[key] = modifier(match[2]);
        rest = rest.replace(pattern, ' ');
      }
    }
    rest = rest.replace(/\s+/g, ' ');

    const ac = Number(/Classe de Armadura (\d+)/.exec(rest)?.[1]);
    const hpMatch = /Pontos de Vida (\d+)(?: \(([^)]+)\))?/.exec(rest);
    const speed = new RegExp(`Deslocamento (.*?)(?= (?:${LABELS.join('|')})\\s|$)`).exec(rest)?.[1].trim() ?? '';
    const props = properties(rest);
    const crMatch = /^(\S+)(?: \(([\d.,]+) XP\))?/.exec(props['Nível de Desafio'] ?? '');

    // Traits until the first section; then each section's entries.
    const sections: Record<string, string[]> = { traits: [], actions: [], reactions: [], legendaryActions: [] };
    let current = 'traits';
    for (const line of block.slice(headEnd + 1)) {
      const heading = section(line);
      if (heading) current = heading;
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

    const title = all[titleAt].trim();
    const name = isTitle(title) ? titleCase(title) : title;
    monsters.push({ name, creatureType, alignment, challengeRating, statBlock });
  }
  return { monsters, unrecognized };
}
