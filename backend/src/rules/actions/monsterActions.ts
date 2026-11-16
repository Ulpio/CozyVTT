import { metresToFeet } from './rangeText';

export interface MonsterAttack {
  kind: 'melee' | 'ranged';
  bonus: number;
  reachFeet?: number;
  normalFeet?: number;
  longFeet?: number;
  damage: { dice: string; type: string }[];
  extraText?: string;
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
    const first = new RegExp(part.source, 'u').exec(after);
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
      const tail = after.slice(end).replace(/^[\s.,;]+/, '').trim();
      if (tail) attack.extraText = tail;
    }
  }
  return attack;
}
