import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@/services/actions.service', () => ({ actionsService: { resolve: h.resolve, list: vi.fn(), undo: vi.fn(), concentration: vi.fn() } }));

import { useActionStore, targetsNeeded, PICK_EVERY_RAY } from '../actionStore';
import { useGameStore } from '../gameStore';
import type { ActionOption } from '@/types/actions';

const sword: ActionOption = { id: 'weapon:sword', name: 'Sword', group: 'attack', resolution: 'attack', reach: { kind: 'feet', normal: 5 }, grips: ['one', 'two'] };
const light: ActionOption = { id: 'spell:light', name: 'Light', group: 'spell', resolution: 'cast', reach: { kind: 'self' } };

beforeEach(() => {
  h.resolve.mockReset().mockResolvedValue({ ok: true, messageId: 'm1' });
  useActionStore.setState({ pending: null, mode: 'normal', concentrationConfirm: null, lastError: null });
  useGameStore.setState({ tokensMapId: 'map-1' } as never);
});

describe('actionStore', () => {
  it('begin then cancel clears pending', () => {
    useActionStore.getState().begin({ actorTokenId: 'a', option: sword });
    expect(useActionStore.getState().pending?.option.id).toBe('weapon:sword');
    useActionStore.getState().cancel();
    expect(useActionStore.getState().pending).toBeNull();
  });

  it('resolvePending sends exactly the allowed keys and clears pending', async () => {
    useActionStore.getState().begin({ actorTokenId: 'a', option: sword, slotLevel: 2, grip: 'two' });
    useActionStore.getState().setMode('advantage');
    const result = await useActionStore.getState().resolvePending('t1');
    expect(h.resolve).toHaveBeenCalledWith({
      mapId: 'map-1', actorTokenId: 'a', actionId: 'weapon:sword', targetTokenId: 't1', mode: 'advantage', slotLevel: 2, grip: 'two',
    });
    expect(result.ok).toBe(true);
    expect(useActionStore.getState().pending).toBeNull();
  });

  it('a self action resolves at once on begin, with no target', async () => {
    useActionStore.getState().begin({ actorTokenId: 'a', option: light });
    await vi.waitFor(() => expect(h.resolve).toHaveBeenCalledTimes(1));
    expect(h.resolve.mock.calls[0][0].targetTokenId).toBeUndefined();
    expect(useActionStore.getState().pending).toBeNull();
  });

  it('a refusal is recorded for the toast and pending clears', async () => {
    h.resolve.mockResolvedValue({ ok: false, error: 'Out of range' });
    useActionStore.getState().begin({ actorTokenId: 'a', option: sword });
    const r = await useActionStore.getState().resolvePending('t1');
    expect(r).toEqual({ ok: false, error: 'Out of range', code: undefined });
    expect(useActionStore.getState().pending).not.toBeNull();
    expect(useActionStore.getState().lastError?.message).toBe('Out of range');
  });

  it('needs-concentration-confirm keeps the request pending-confirm, and confirm resends with replaceConcentration', async () => {
    h.resolve.mockResolvedValueOnce({ ok: false, error: 'Concentrating', code: 'needs-concentration-confirm' });
    useActionStore.getState().begin({ actorTokenId: 'a', option: sword });
    await useActionStore.getState().resolvePending('t1');
    const confirm = useActionStore.getState().concentrationConfirm;
    expect(confirm?.targetTokenId).toBe('t1');
    expect(useActionStore.getState().lastError).toBeNull();

    h.resolve.mockResolvedValueOnce({ ok: true, messageId: 'm2' });
    await useActionStore.getState().confirmConcentration();
    expect(h.resolve).toHaveBeenLastCalledWith(expect.objectContaining({ replaceConcentration: true, targetTokenId: 't1', actionId: 'weapon:sword' }));
    expect(useActionStore.getState().concentrationConfirm).toBeNull();
  });

  it('cancel clears a concentration confirm', async () => {
    h.resolve.mockResolvedValueOnce({ ok: false, error: 'x', code: 'needs-concentration-confirm' });
    useActionStore.getState().begin({ actorTokenId: 'a', option: sword });
    await useActionStore.getState().resolvePending('t1');
    useActionStore.getState().cancel();
    expect(useActionStore.getState().concentrationConfirm).toBeNull();
  });
});

const scorchingRay: ActionOption = {
  id: 'spell:scorching-ray', name: 'Scorching Ray', group: 'spell', resolution: 'attack', spellLevel: 2,
  reach: { kind: 'feet', normal: 120 }, targeting: { kind: 'multi', count: 3, perSlot: 1, distinct: false },
};
const holdPerson: ActionOption = {
  id: 'spell:hold-person', name: 'Hold Person', group: 'spell', resolution: 'save', spellLevel: 2, saveAbility: 'wis',
  reach: { kind: 'feet', normal: 60 }, targeting: { kind: 'multi', count: 1, perSlot: 1, distinct: true },
};
const burningHands: ActionOption = {
  id: 'spell:burning-hands', name: 'Burning Hands', group: 'spell', resolution: 'save', spellLevel: 1, saveAbility: 'dex',
  reach: { kind: 'self' }, targeting: { kind: 'area', area: { shape: 'cone', sizeFt: 15 }, origin: 'self' },
};
const fireball: ActionOption = {
  id: 'spell:fireball', name: 'Fireball', group: 'spell', resolution: 'save', spellLevel: 3, saveAbility: 'dex',
  reach: { kind: 'feet', normal: 150 }, targeting: { kind: 'area', area: { shape: 'sphere', sizeFt: 20 }, origin: 'point', rangeFeet: 150 },
};

describe('actionStore: several targets', () => {
  it('a Scorching Ray at slot 3 needs 4 picks and sends them, a repeat included', async () => {
    const store = useActionStore.getState();
    store.begin({ actorTokenId: 'a', option: scorchingRay, slotLevel: 3 });
    expect(targetsNeeded(useActionStore.getState().pending!)).toBe(4);
    for (const id of ['t1', 't2', 't1']) store.pickTarget(id);
    expect(h.resolve).not.toHaveBeenCalled();

    const early = await store.confirmPending();
    expect(early.ok).toBe(false);
    expect(h.resolve).not.toHaveBeenCalled();
    expect(useActionStore.getState().lastError?.message).toBe(PICK_EVERY_RAY);

    store.pickTarget('t3');
    store.pickTarget('t4'); // a fifth ray is not there to aim
    expect(useActionStore.getState().pending?.picked).toEqual(['t1', 't2', 't1', 't3']);
    const sent = await store.confirmPending();
    expect(sent.ok).toBe(true);
    expect(h.resolve).toHaveBeenCalledWith({
      mapId: 'map-1', actorTokenId: 'a', actionId: 'spell:scorching-ray', targetTokenIds: ['t1', 't2', 't1', 't3'], mode: 'normal', slotLevel: 3,
    });
    expect(useActionStore.getState().pending).toBeNull();
  });

  it('Hold Person picks different creatures: a second click on one takes it off', async () => {
    const store = useActionStore.getState();
    store.begin({ actorTokenId: 'a', option: holdPerson, slotLevel: 4 });
    expect(targetsNeeded(useActionStore.getState().pending!)).toBe(3);
    store.pickTarget('t1');
    store.pickTarget('t2');
    store.pickTarget('t1');
    expect(useActionStore.getState().pending?.picked).toEqual(['t2']);
    await store.confirmPending();
    expect(h.resolve.mock.calls[0][0].targetTokenIds).toEqual(['t2']);
  });

  it('a multi pick sends one to the count, never none', async () => {
    const store = useActionStore.getState();
    store.begin({ actorTokenId: 'a', option: holdPerson, slotLevel: 2 });
    expect((await store.confirmPending()).ok).toBe(false);
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it('the last pick can be taken back', () => {
    const store = useActionStore.getState();
    store.begin({ actorTokenId: 'a', option: scorchingRay, slotLevel: 2 });
    store.pickTarget('t1');
    store.pickTarget('t2');
    store.unpickLast();
    expect(useActionStore.getState().pending?.picked).toEqual(['t1']);
  });
});

describe('actionStore: areas', () => {
  it('a self area waits to be aimed instead of resolving at once', () => {
    useActionStore.getState().begin({ actorTokenId: 'a', option: burningHands, slotLevel: 1 });
    expect(h.resolve).not.toHaveBeenCalled();
    expect(useActionStore.getState().pending?.area).toBeNull();
  });

  it('a cone from the caster sends where it is aimed and no target ids', async () => {
    const store = useActionStore.getState();
    store.begin({ actorTokenId: 'a', option: burningHands, slotLevel: 1 });
    await store.placeArea({ x: 300, y: 125 });
    expect(h.resolve).toHaveBeenCalledWith({
      mapId: 'map-1', actorTokenId: 'a', actionId: 'spell:burning-hands', area: { anchor: { x: 300, y: 125 }, aim: { x: 300, y: 125 } }, mode: 'normal', slotLevel: 1,
    });
  });

  it('a sphere at a point is aimed (a tap), then confirmed', async () => {
    const store = useActionStore.getState();
    store.begin({ actorTokenId: 'a', option: fireball, slotLevel: 3 });
    expect((await store.confirmPending()).ok).toBe(false); // nothing aimed yet
    store.setAreaAim({ x: 510, y: 520 });
    expect(useActionStore.getState().pending?.area).toEqual({ anchor: { x: 510, y: 520 } });
    expect(h.resolve).not.toHaveBeenCalled();
    await store.confirmPending();
    const request = h.resolve.mock.calls[0][0];
    expect(request.area).toEqual({ anchor: { x: 510, y: 520 } });
    expect(request.targetTokenIds).toBeUndefined();
    expect(request.targetTokenId).toBeUndefined();
  });

  it('a refused area keeps the aim, to try another spot', async () => {
    h.resolve.mockResolvedValue({ ok: false, error: 'Out of range' });
    const store = useActionStore.getState();
    store.begin({ actorTokenId: 'a', option: burningHands, slotLevel: 1 });
    await store.placeArea({ x: 300, y: 125 });
    expect(useActionStore.getState().pending?.option.id).toBe('spell:burning-hands');
  });
});
