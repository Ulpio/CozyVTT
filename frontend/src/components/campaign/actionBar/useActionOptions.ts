// ============================================
// What the actor can do, as the server lists it
//
// Fetched again when the actor token changes or `refreshKey` does (the
// character's sheet updated: a spell learned, a slot spent). While what is
// listed has a recharge on it, also whenever the token object itself is new
// (the map sent again): a player is never sent the spent mark, so this is how
// their button follows the GM's roll. An answer for an actor no longer shown
// is dropped.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { actionsService } from '@/services/actions.service';
import type { ActionOption } from '@/types/actions';

export function useActionOptions(
  mapId: string | null | undefined,
  actorTokenId: string | null,
  refreshKey: string | number | undefined,
  token?: object,
): ActionOption[] {
  const [answer, setAnswer] = useState<{ key: string; options: ActionOption[] } | null>(null);
  const key = `${mapId}:${actorTokenId}`;
  const options = answer && answer.key === key ? answer.options : [];

  // Counts the token objects seen while a recharge is listed.
  const seen = useRef<{ token: object | undefined; n: number }>({ token, n: 0 });
  if (seen.current.token !== token) {
    seen.current = { token, n: seen.current.n + (options.some((o) => o.recharge) ? 1 : 0) };
  }
  const tokenSeen = seen.current.n;

  useEffect(() => {
    if (!mapId || !actorTokenId) return;
    let live = true;
    actionsService.list(mapId, actorTokenId)
      .then((listed) => { if (live) setAnswer({ key, options: listed.options }); })
      .catch(() => { if (live) setAnswer({ key, options: [] }); });
    return () => { live = false; };
  }, [mapId, actorTokenId, key, refreshKey, tokenSeen]);

  return options;
}
