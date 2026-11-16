import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@/services/actions.service', () => ({ actionsService: { resolve: h.resolve, list: vi.fn(), undo: vi.fn(), concentration: vi.fn() } }));

import { useActionStore } from '../actionStore';
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
