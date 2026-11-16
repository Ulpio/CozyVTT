import { ActionCard, ActionCardTarget, PlayerActionCard, monsterState, projectActionCard, Viewer } from '../actionCard';

const gm: Viewer = { role: 'GM', userId: 'gm1' };
const bob: Viewer = { role: 'PLAYER', userId: 'bob' };
const ann: Viewer = { role: 'PLAYER', userId: 'ann' };
const spec: Viewer = { role: 'SPECTATOR', userId: 'spec' };

function goblin(over: Partial<ActionCardTarget> = {}): ActionCardTarget {
  return {
    tokenId: 't-gob', name: 'Goblin Boss', isCharacter: false, showHpBar: false,
    ac: 15, hitChance: 0.55, hpBefore: 12, hpAfter: 4, hpMax: 12,
    attack: { d20s: [14], natural: 14, total: 19, hit: true, critical: false },
    damage: [{ total: 8, type: 'slashing', breakdown: '1d8+4' }],
    concentrationCheckDc: 10,
    ...over,
  };
}

function card(targets: ActionCardTarget[] = [goblin()], over: Partial<ActionCard> = {}): ActionCard {
  return {
    kind: 'action',
    actor: { tokenId: 't-pc', name: 'Aria', userId: 'bob' },
    actionName: 'Longsword', mode: 'normal', targets,
    extraText: 'secret GM note',
    undo: { hp: [{ tokenId: 't-gob', before: { current: 12, temp: 0 }, after: { current: 4, temp: 0 } }] },
    ...over,
  };
}

function keys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); keys(v, out); }
  }
  return out;
}

describe('monsterState', () => {
  it('maps hit points to a state', () => {
    expect(monsterState(7, 7)).toBe('unharmed');
    expect(monsterState(4, 7)).toBe('wounded');
    expect(monsterState(3, 7)).toBe('badly-wounded');
    expect(monsterState(0, 7)).toBe('down');
  });
});

describe('projectActionCard', () => {
  it('gives the GM the card unchanged', () => {
    const c = card();
    expect(projectActionCard(c, gm)).toEqual(c);
  });

  it('never leaks secret keys to a player', () => {
    for (const v of [bob, ann, spec]) {
      const k = keys(projectActionCard(card([goblin({ showHpBar: true })]), v));
      for (const secret of ['ac', 'hitChance', 'hpBefore', 'hpAfter', 'undo', 'ownerUserId', 'showHpBar']) {
        expect(k.has(secret)).toBe(false);
      }
    }
  });

  it('shows a state, not HP, for a hidden monster', () => {
    const p: any = projectActionCard(card(), bob);
    expect(p.targets[0].hp).toBeUndefined();
    expect(p.targets[0].state).toBe('badly-wounded');
    expect(p.targets[0].attack.hit).toBe(true);
  });

  it('shows HP when the GM turned the bar on', () => {
    const p: any = projectActionCard(card([goblin({ showHpBar: true, temp: 2 })]), bob);
    expect(p.targets[0].hp).toEqual({ current: 4, max: 12, temp: 2 });
    expect(p.targets[0].state).toBeUndefined();
  });

  it('shows a masked target only as a state, even with its bar on', () => {
    for (const maskedName of ['something', 'something-invisible'] as const) {
      const p: any = projectActionCard(card([goblin({ showHpBar: true, maskedName })]), bob);
      expect(p.targets[0].hp).toBeUndefined();
      expect(p.targets[0].state).toBe('badly-wounded');
    }
    const statue: any = projectActionCard(card([goblin({ showHpBar: true, maskedName: 'something', hpMax: 0, hpAfter: 0 })]), bob);
    expect(statue.targets[0].hp).toBeUndefined();
    expect(statue.targets[0].state).toBeUndefined();
  });

  it('shows a character HP to its owner only, unless the bar is on', () => {
    const pc = goblin({ tokenId: 't-pc2', name: 'Cleo', isCharacter: true, ownerUserId: 'ann', ac: 18 });
    const c = card([pc]);
    expect((projectActionCard(c, ann) as any).targets[0].hp).toEqual({ current: 4, max: 12 });
    const other: any = projectActionCard(c, bob);
    expect(other.targets[0].hp).toBeUndefined();
    expect(other.targets[0].state).toBe('badly-wounded');
    expect((projectActionCard(c, spec) as any).targets[0].hp).toBeUndefined();
    const bar: any = projectActionCard(card([{ ...pc, showHpBar: true }]), bob);
    expect(bar.targets[0].hp).toEqual({ current: 4, max: 12 });
  });

  it('shows neither HP nor a state for a target with no hit points tracked', () => {
    const statue = goblin({ hpBefore: 0, hpAfter: 0, hpMax: 0, showHpBar: true });
    for (const viewer of [bob, ann, spec]) {
      const t = (projectActionCard(card([statue]), viewer) as PlayerActionCard).targets[0];
      expect(t.hp).toBeUndefined();
      expect(t.state).toBeUndefined();
    }
    expect(projectActionCard(card([statue]), gm)).toEqual(card([statue]));
  });

  it('masks names', () => {
    const c = card([goblin({ maskedName: 'something' })], {
      actor: { tokenId: 't-npc', name: 'Lich King', maskedName: 'something-invisible' },
    });
    const p: any = projectActionCard(c, bob);
    expect(p.actor.maskedName).toBe('something-invisible');
    expect(p.targets[0].maskedName).toBe('something');
    expect(JSON.stringify(p)).not.toContain('Lich King');
    expect(JSON.stringify(p)).not.toContain('Goblin Boss');
  });

  it('keeps extraText for a character actor but drops it for a GM NPC', () => {
    expect((projectActionCard(card(), bob) as any).extraText).toBe('secret GM note');
    const npc = card([goblin()], { actor: { tokenId: 't-npc', name: 'Orc' } });
    expect('extraText' in (projectActionCard(npc, bob) as any)).toBe(false);
  });

  it('passes undone state through to players', () => {
    const p: any = projectActionCard(card([goblin()], { undoneAt: '2026-01-01T00:00:00Z', undoPartial: true }), bob);
    expect(p.undoneAt).toBe('2026-01-01T00:00:00Z');
    expect(p.undoPartial).toBe(true);
    expect(p.undo).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const c = card();
    const snap = JSON.parse(JSON.stringify(c));
    projectActionCard(c, bob);
    expect(c).toEqual(snap);
  });
});
