import type { AreaSpec } from '../../utils/areaGeometry';
import { metresToFeet } from './rangeText';

export interface MonsterAttack {
  kind: 'melee' | 'ranged';
  bonus: number;
  reachFeet?: number;
  normalFeet?: number;
  longFeet?: number;
  damage: { dice: string; type: string }[];
  extraText?: string;
  /** A saving throw the hit forces on the target (a poison rider, a knock-prone). */
  onHitSave?: SaveEffect;
}

const NUM = '(\\d+(?:[.,]\\d+)?)';
const toNum = (s: string) => parseFloat(s.replace(',', '.'));

/**
 * Reads a monster action in the book's Portuguese shape ("Ataque Corpo-a-Corpo
 * com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de
 * dano cortante.") into data the resolver can roll. Text that is not an attack
 * gives null. Tolerates the book's typos ("Corpoa-Corpo", a missing "Ataque").
 */
export function parseMonsterAction(description: string): MonsterAttack | null {
  const hit = description.match(/^\s*((?:Ataque\s+)?(?:Corpo|[àa]\s+Dist)[^:]*):\s*([+\-\u2212\u2013]?\s*\d+)\s+para atingir\b([^]*)$/i);
  if (!hit) return null;
  const header = hit[1];
  const bonus = parseInt(hit[2].replace(/\s/g, '').replace(/[−–]/g, '-'), 10);
  const isMelee = /corpo/i.test(header);
  const isRanged = /dist[âa]ncia/i.test(header);
  if (!isMelee && !isRanged) return null;

  const rest = hit[3];
  const acerto = rest.search(/\bAcerto:/);
  const reachPart = acerto >= 0 ? rest.slice(0, acerto) : rest;

  const attack: MonsterAttack = { kind: isMelee ? 'melee' : 'ranged', bonus, damage: [] };

  const reach = reachPart.match(new RegExp(`alcance\\s+${NUM}\\s*m\\b`, 'i'));
  if (reach) attack.reachFeet = metresToFeet(toNum(reach[1]));
  const range = reachPart.match(new RegExp(`dist[âa]ncia\\s+${NUM}(?:\\s*/\\s*${NUM})?\\s*m\\b`, 'i'));
  if (range) {
    attack.normalFeet = metresToFeet(toNum(range[1]));
    if (range[2]) attack.longFeet = metresToFeet(toNum(range[2]));
  }

  if (acerto >= 0) {
    const after = rest.slice(acerto + 'Acerto:'.length);
    const part = new RegExp(`${NUM}(?:\\s*\\(([^)]+)\\))?\\s+(?:de\\s+)?dano(?:\\s+(?:de|do|da))?\\s+([\\p{L}-]+)`, 'uy');
    let first = new RegExp(part.source, 'u').exec(after);
    // A damage figure that only follows the save is the save's, not the hit's.
    const saveAt = SAVE_RE.exec(after)?.index;
    if (first && saveAt !== undefined && saveAt < first.index) first = null;
    let tail = '';
    if (first) {
      let end = first.index;
      let m: RegExpExecArray | null = first;
      const next = new RegExp(`\\s*(?:,\\s*)?(?:mais|e)\\s+${part.source}`, 'uy');
      while (m) {
        const typeWord = m[3];
        attack.damage.push({ dice: (m[2] ?? m[1]).trim(), type: /^(um|uma)$/i.test(typeWord) ? 'variável' : typeWord });
        end = m.index + m[0].length;
        next.lastIndex = end;
        const n = next.exec(after);
        m = n;
      }
      tail = after.slice(end).replace(/^[\s.,;]+/, '').trim();
    } else if (saveAt !== undefined) {
      tail = after.replace(/^[\s.,;]+/, '').trim();
    }
    const rider = tail ? readSave(tail) : null;
    if (rider) {
      attack.onHitSave = rider;
      // What precedes the save sentence stays as the attack's own rider text.
      const before = tail.slice(0, SAVE_RE.exec(tail)!.index);
      const cut = before.lastIndexOf('. ');
      const own = cut >= 0 ? before.slice(0, cut + 1).trim() : '';
      if (own) attack.extraText = own;
    } else if (tail && first) attack.extraText = tail;
  }
  return attack;
}

// ---------------------------------------------------------------------------
// Saving throws: breath weapons, save-only actions, riders on attacks.
// ---------------------------------------------------------------------------

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface SaveEffect {
  ability: Ability;
  dc: number;
  damage: { dice: string; type: string }[];
  halfOnSave: boolean;
  /** Condition or follow-up text the numbers above do not capture. */
  extraText?: string;
}

export interface MonsterSaveAction {
  save: SaveEffect;
  area?: AreaSpec;
  origin: 'self';
  targets: 'one' | 'many';
  rangeFeet?: number;
  recharge?: { min: number };
}

const ABILITY_BY_WORD: Record<string, Ability> = {
  forca: 'str',
  destreza: 'dex',
  constituicao: 'con',
  inteligencia: 'int',
  sabedoria: 'wis',
  carisma: 'cha',
};

const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const SAVE_RE = /teste\s+de\s+resist[êe]ncia\s+de\s+(For[çc]a|Destreza|Constitui[çc][ãa]o|Intelig[êe]ncia|Sabedoria|Carisma)\s+CD\s+(\d+)/i;
const DAMAGE_PART = String.raw`${NUM}(?:\s*\(([^)]+)\))?\s+(?:de\s+)?dano(?:\s+(?:de|do|da))?\s+([\p{L}-]+)`;
const SENTENCE_END = /\.(?:\s|$)/;

/** Index just past the sentence that contains `index`. */
function sentenceEnd(text: string, index: number): number {
  const m = SENTENCE_END.exec(text.slice(index));
  return m ? index + m.index + m[0].length : text.length;
}

function readDamage(region: string): { parts: { dice: string; type: string }[]; end: number } {
  const first = new RegExp(DAMAGE_PART, 'u').exec(region);
  const parts: { dice: string; type: string }[] = [];
  if (!first) return { parts, end: 0 };
  const next = new RegExp(String.raw`\s*(?:,\s*)?(?:mais|e)\s+${DAMAGE_PART}`, 'uy');
  let m: RegExpExecArray | null = first;
  let end = first.index;
  while (m) {
    parts.push({ dice: (m[2] ?? m[1]).trim(), type: /^(um|uma)$/i.test(m[3]) ? 'variável' : m[3] });
    end = m.index + m[0].length;
    next.lastIndex = end;
    m = next.exec(region);
  }
  return { parts, end };
}

/**
 * Reads "teste de resistência de Destreza CD 21" and the damage it deals on a
 * failure ("sofrendo 63 (18d6) de dano de fogo se falhar, ou metade desse dano
 * se obtiver sucesso"). Text with no such save gives null.
 */
function readSave(text: string): SaveEffect | null {
  const m = SAVE_RE.exec(text);
  if (!m) return null;
  const save: SaveEffect = { ability: ABILITY_BY_WORD[plain(m[1])], dc: parseInt(m[2], 10), damage: [], halfOnSave: false };
  const afterAt = m.index + m[0].length;
  let regionEnd = sentenceEnd(text, afterAt);
  let dmg = readDamage(text.slice(afterAt, regionEnd));
  if (dmg.parts.length === 0) {
    // "Se falhar, um alvo sofre 13 (2d8) de dano ..." in the following sentence.
    const nextEnd = sentenceEnd(text, regionEnd);
    const next = text.slice(regionEnd, nextEnd);
    if (/^\s*(?:(?:Se|Em caso de|Caso)\s+(?:o alvo\s+|a criatura\s+|ele\s+|ela\s+)?(?:falh|fracass)|(?:A criatura|O alvo|Ela|Ele)\s+sofre)/i.test(next)) {
      const d = readDamage(next);
      if (d.parts.length > 0) {
        dmg = d;
        regionEnd = nextEnd;
      }
    }
  }
  let rest: string;
  if (dmg.parts.length > 0) {
    save.damage = dmg.parts;
    // "ou metade desse dano" in the damage sentence, or "Se obtiver sucesso, … metade do dano" after it.
    save.halfOnSave =
      /metade/i.test(text.slice(afterAt, regionEnd)) ||
      /(?:^|\.\s+)(?:Se|Caso|Com um|Em caso de)\b[^.]*(?:sucesso|bem sucedid)[^.]*\bmetade\b/i.test(text.slice(regionEnd));
    rest = text.slice(regionEnd);
  } else {
    // No damage: the condition is the effect, so keep the sentence the save sits in.
    const before = text.slice(0, m.index);
    const cut = Math.max(before.lastIndexOf('. '), -1);
    rest = text.slice(cut + 1);
  }
  const extra = rest.replace(/^[\s.,;]+/, '').trim();
  if (extra) save.extraText = extra;
  return save;
}

const toFeet = (s: string) => metresToFeet(toNum(s));

function readArea(text: string): AreaSpec | undefined {
  const m = (re: RegExp) => re.exec(text);
  let r: RegExpExecArray | null;
  if ((r = m(new RegExp(String.raw`\bcone\s+(?:com\s+|de\s+)?${NUM}\s*metros?`, 'i')))) return { shape: 'cone', sizeFt: toFeet(r[1]) };
  if ((r = m(new RegExp(String.raw`\blinha\s+(?:de\s+\p{L}+\s+)?(?:com\s+|de\s+)?${NUM}\s*metros?(?:\s+de\s+comprimento)?(?:\s+(?:e|por)\s+${NUM}\s*metros?\s+de\s+largura)?`, 'iu')))) {
    const spec: AreaSpec = { shape: 'line', sizeFt: toFeet(r[1]) };
    if (r[2]) spec.widthFt = toFeet(r[2]);
    return spec;
  }
  if ((r = m(new RegExp(String.raw`\besfera\s+(?:com\s+|de\s+)?${NUM}\s*metros?(?:\s+de\s+raio)?`, 'i')))) return { shape: 'sphere', sizeFt: toFeet(r[1]) };
  if ((r = m(new RegExp(String.raw`\bcilindro\s+(?:com\s+|de\s+)?${NUM}\s*metros?(?:\s+de\s+raio)?`, 'i')))) return { shape: 'cylinder', sizeFt: toFeet(r[1]) };
  if ((r = m(new RegExp(String.raw`\bcubo\s+(?:com\s+|de\s+)?${NUM}\s*metros?`, 'i')))) return { shape: 'cube', sizeFt: toFeet(r[1]) };
  if ((r = m(new RegExp(String.raw`\braio\s+de\s+${NUM}\s*metros?`, 'i')))) return { shape: 'sphere', sizeFt: toFeet(r[1]) };
  // "uma nuvem de esporos, com 4,5 metros de raio, estende-se do vrock"
  if ((r = m(new RegExp(String.raw`${NUM}\s*metros?\s+de\s+raio`, 'i')))) return { shape: 'sphere', sizeFt: toFeet(r[1]) };
  return undefined;
}

/** "(Recarrega 5–6)", "(Recarga 5-6)", "(Recarrega 6)" in an action's name. */
export function parseRecharge(name: string): { min: number } | null {
  const m = name.match(/\(\s*Recar(?:rega|ga)\s+(\d)(?:\s*[\u2013\u2014-]\s*\d)?\s*\)/i);
  return m ? { min: parseInt(m[1], 10) } : null;
}

/**
 * Reads a monster action whose point is a saving throw (a breath weapon, an
 * aura of fear): the save, its damage, the area it covers and the recharge in
 * its name. Attacks ("para atingir") and text with no "teste de resistência …
 * CD" give null; a rider on an attack is read by parseMonsterAction.
 */
export function parseMonsterSaveAction(name: string, rawDescription: string): MonsterSaveAction | null {
  if (/para atingir/i.test(rawDescription)) return null;
  // The book data sometimes runs a lair-action list on after the text ("... x O dragão cria ...").
  const description = rawDescription.split(/\s+x\s+(?=[A-ZÀ-Ú])/)[0];
  // A list of several different saves (an eye-ray menu) is not one save.
  const saves = new Set([...description.matchAll(new RegExp(SAVE_RE.source, 'gi'))].map((x) => plain(x[1])));
  if (saves.size > 1) return null;
  const save = readSave(description);
  if (!save) return null;
  const action: MonsterSaveAction = { save, origin: 'self', targets: 'one' };
  const area = readArea(description);
  if (area) action.area = area;
  const range = new RegExp(String.raw`\ba\s+at[ée]\s+${NUM}\s*metros?`, 'i').exec(description);
  if (range) action.rangeFeet = toFeet(range[1]);
  if (area || /\b(?:cada|toda|qualquer)\s+criatura|\btodas?\s+as\s+(?:outras\s+)?criaturas/i.test(description)) action.targets = 'many';
  const recharge = parseRecharge(name);
  if (recharge) action.recharge = recharge;
  return action;
}
