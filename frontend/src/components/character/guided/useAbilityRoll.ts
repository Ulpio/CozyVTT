// ============================================
// The player's saved ability roll for this scope (campaign or none). The
// server keeps it from the moment it is rolled, so reopening the wizard
// shows the same roll; there is no way to roll again. Once a roll exists the
// wizard uses it and no other method (ledger ruling), so until the lookup has
// answered nothing else may be chosen.
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/services/api';
import type { AbilityRollDto } from '@/types';
import { errorSummary } from '@/utils/errors';

export interface AbilityRollState {
  roll: AbilityRollDto | null;
  /** The server has answered whether a roll is saved. */
  known: boolean;
  /** Looking for a saved roll. */
  loading: boolean;
  /** The lookup failed; `retry` asks again. */
  lookupFailed: boolean;
  retry: () => void;
  rolling: boolean;
  failed: boolean;
  /** Rolls on the server, once; afterwards it returns the saved roll. */
  rollOnce: () => Promise<AbilityRollDto | null>;
}

export function useAbilityRoll(campaignId?: string): AbilityRollState {
  const [roll, setRoll] = useState<AbilityRollDto | null>(null);
  const [known, setKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLookupFailed(false);
    api
      .getAbilityRoll(campaignId)
      .then(
        (saved) => {
          if (!live) return;
          setRoll(saved);
          setKnown(true);
        },
        (err) => {
          console.error('Failed to look for a saved ability roll:', errorSummary(err));
          if (live) setLookupFailed(true);
        },
      )
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [campaignId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const rollOnce = useCallback(async () => {
    if (roll) return roll;
    if (busy.current) return null;
    busy.current = true;
    setRolling(true);
    setFailed(false);
    try {
      const made = await api.rollAbilities(campaignId);
      setRoll(made);
      setKnown(true);
      return made;
    } catch (err) {
      console.error('Failed to roll ability scores:', errorSummary(err));
      setFailed(true);
      return null;
    } finally {
      busy.current = false;
      setRolling(false);
    }
  }, [campaignId, roll]);

  return { roll, known, loading, lookupFailed, retry, rolling, failed, rollOnce };
}
