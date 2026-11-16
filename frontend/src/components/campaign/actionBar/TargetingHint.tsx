// ============================================
// "Choose a target" with Cancel, over the map while an action waits for its
// target and the action bar is not on screen (the compact layout, once the
// sheet has got out of the map's way).
// ============================================

import { useTranslation } from 'react-i18next';
import { useActionStore } from '@/stores/actionStore';
import Button from '@/components/ui/Button';

export default function TargetingHint() {
  const { t } = useTranslation();
  const pending = useActionStore((s) => s.pending);
  if (!pending) return null;
  return (
    <div role="status" className="flex shrink-0 items-center justify-center gap-3 border-t border-brand/20 bg-parchment px-3 py-1.5 text-sm text-brand-ink">
      <span>{t('actionBar.chooseTarget', { name: pending.option.name })}</span>
      <Button size="sm" variant="ghost" onClick={() => useActionStore.getState().cancel()}>{t('actionBar.cancel')}</Button>
    </div>
  );
}
