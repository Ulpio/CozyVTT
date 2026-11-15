// ============================================
// The player's saved ability roll for this scope (campaign or none). The
// server keeps it from the moment it is rolled, so reopening the wizard
// shows the same roll; there is no way to roll again.
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/services/api';
import type { AbilityRollDto } from '@/types';
import { errorSummary } from '@/utils/errors';

export interface AbilityRollState {
  roll: AbilityRollDto | null;
  /** Looking for a saved roll. */
  loading: boolean;
  rolling: boolean;
  failed: boolean;
  /** Rolls on the server, once; afterwards it returns the saved roll. */
  rollOnce: () => Promise<AbilityRollDto | null>;
}

export function useAbilityRoll(campaignId?: string): AbilityRollState {
  const [roll, setRoll] = useState<AbilityRollDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.getAbilityRoll(campaignId).then(
      (saved) => {
        if (live) setRoll(saved);
      },
      (err) => console.error('Failed to look for a saved ability roll:', errorSummary(err)),
    ).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [campaignId]);

  const rollOnce = useCallback(async () => {
    if (roll) return roll;
    if (busy.current) return null;
    busy.current = true;
    setRolling(true);
    setFailed(false);
    try {
      const made = await api.rollAbilities(campaignId);
      setRoll(made);
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

  return { roll, loading, rolling, failed, rollOnce };
}
