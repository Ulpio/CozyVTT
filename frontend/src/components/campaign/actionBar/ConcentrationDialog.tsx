// ============================================
// The concentration question: the server holds a cast back until the caster
// agrees to drop what they hold. Its own component, mounted by the table
// arrangements outside the compact layout's sheet, so it shows whether or
// not the bar is on screen when the answer comes.
// ============================================

import { useTranslation } from 'react-i18next';
import { useActionStore } from '@/stores/actionStore';
import { useGameStore } from '@/stores/gameStore';
import { useCampaign } from '@/contexts/CampaignContext';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { FifthEditionCharacterData } from '@/types/game-systems';
import { useActorSheet } from './useBarActor';
import { useActionOptions } from './useActionOptions';

export default function ConcentrationDialog() {
  const { t } = useTranslation();
  const { currentMap } = useCampaign();
  const request = useActionStore((s) => s.concentrationConfirm);
  const actor = useGameStore((s) => (request ? s.tokens[request.actorTokenId] : undefined));
  const sheet = useActorSheet(request ? (actor?.characterId ?? null) : null);
  const options = useActionOptions(currentMap?.id, request ? request.actorTokenId : null, sheet?.updatedAt);
  const next = options.find((o) => o.id === request?.actionId)?.name ?? '';
  const current = (sheet?.data as FifthEditionCharacterData | undefined)?.concentratingOn?.name ?? t('actionBar.concentration.anotherSpell');
  const cancel = () => useActionStore.getState().cancel();

  return (
    <Modal
      open={request !== null}
      onClose={cancel}
      title={t('actionBar.concentration.title')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={cancel}>{t('actionBar.concentration.keep')}</Button>
          <Button onClick={() => void useActionStore.getState().confirmConcentration()}>{t('actionBar.concentration.replace')}</Button>
        </>
      }
    >
      <p className="text-sm text-ink">{t('actionBar.concentration.body', { current, next })}</p>
    </Modal>
  );
}
