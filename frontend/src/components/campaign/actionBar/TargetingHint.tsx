// ============================================
// What a picked action waits for, with Cancel: "Choose a target", the count
// of a several-target pick ("2 of 3") and an area's aim, with Confirm for
// what is not sent by a click alone (several targets, and an area aimed by a
// tap). Shown in the action bar (`variant="bar"`) and over the map while the
// bar is not on screen (the compact layout, `variant="sheet"`).
// ============================================

import { useTranslation } from 'react-i18next';
import { useCampaign } from '@/contexts/CampaignContext';
import { useActionStore, targetsNeeded } from '@/stores/actionStore';
import { useGameStore } from '@/stores/gameStore';
import { placeActionArea } from '@/utils/areaGeometry';
import { areaMapOf } from '@/utils/actionTargeting';
import Button from '@/components/ui/Button';

interface TargetingHintProps {
  /** In the bar, an area is placed with a click; in the compact layout, a tap aims it and Confirm casts. */
  variant?: 'bar' | 'sheet';
}

export default function TargetingHint({ variant = 'sheet' }: TargetingHintProps) {
  const { t } = useTranslation();
  const { currentMap } = useCampaign();
  const pending = useActionStore((s) => s.pending);
  const actor = useGameStore((s) => (pending ? s.tokens[pending.actorTokenId] : undefined));
  if (!pending) return null;

  const { option } = pending;
  const targeting = option.targeting;
  const count = targetsNeeded(pending);

  let label: string;
  let ready = false;
  let outOfRange = false;
  if (targeting?.kind === 'multi') {
    label = targeting.distinct ? t('actionBar.targeting.pickTargets', { name: option.name, count }) : t('actionBar.targeting.pickRays', { name: option.name });
    ready = targeting.distinct ? pending.picked.length > 0 : pending.picked.length === count;
  } else if (targeting?.kind === 'area') {
    label = t(variant === 'bar' ? 'actionBar.targeting.aimArea' : 'actionBar.targeting.aimAreaTouch', { name: option.name });
    if (pending.area && actor && currentMap) {
      outOfRange = !placeActionArea(actor, targeting, pending.area, areaMapOf(currentMap)).inRange;
      ready = !outOfRange;
    }
  } else {
    label = t('actionBar.chooseTarget', { name: option.name });
  }
  const confirms = targeting?.kind === 'multi' || targeting?.kind === 'area';

  const body = (
    <>
      <span>{label}</span>
      {targeting?.kind === 'multi' && <span className="font-semibold tabular-nums">{t('actionBar.targeting.pickCount', { picked: pending.picked.length, count })}</span>}
      {outOfRange && <span className="font-semibold text-danger-ink">{t('actionBar.targeting.outOfRange')}</span>}
      {confirms && (
        <Button size="sm" disabled={!ready} onClick={() => void useActionStore.getState().confirmPending()}>{t('actionBar.targeting.confirm')}</Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => useActionStore.getState().cancel()}>{t('actionBar.cancel')}</Button>
    </>
  );

  if (variant === 'bar') {
    return <div role="status" className="flex flex-wrap items-center gap-3 text-sm text-brand-ink">{body}</div>;
  }
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-brand/20 bg-parchment px-3 py-1.5 text-sm text-brand-ink">
      {body}
    </div>
  );
}
