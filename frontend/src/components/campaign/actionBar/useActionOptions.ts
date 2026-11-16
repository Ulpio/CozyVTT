// ============================================
// What the actor can do, as the server lists it
//
// Fetched again when the actor token changes or `refreshKey` does (the
// character's sheet updated: a spell learned, a slot spent). An answer for an
// actor no longer shown is dropped.
// ============================================

import { useEffect, useState } from 'react';
import { actionsService } from '@/services/actions.service';
import type { ActionOption } from '@/types/actions';

export function useActionOptions(mapId: string | null | undefined, actorTokenId: string | null, refreshKey: string | number | undefined): ActionOption[] {
  const [answer, setAnswer] = useState<{ key: string; options: ActionOption[] } | null>(null);
  const key = `${mapId}:${actorTokenId}`;

  useEffect(() => {
    if (!mapId || !actorTokenId) return;
    let live = true;
    actionsService.list(mapId, actorTokenId)
      .then((options) => { if (live) setAnswer({ key, options }); })
      .catch(() => { if (live) setAnswer({ key, options: [] }); });
    return () => { live = false; };
  }, [mapId, actorTokenId, key, refreshKey]);

  return answer && answer.key === key ? answer.options : [];
}
