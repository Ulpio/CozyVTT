// ============================================
// A bar action's card in the chat
//
// Drawn from the message's metadata, never from its Portuguese content: the
// header "Actor → Target · Action", each target's attack, damage and healing,
// then its hit points (or its state word, or nothing when no hit points are
// tracked). The GM's card also has AC, hit chance, HP before and after, the
// monster's extra text and Undo; a player's has none of them. The viewer's role
// decides which, not which fields arrived. A target's owner and the GM may roll
// its concentration check, once.
// ============================================

import { useTranslation } from 'react-i18next';
import { useCampaign } from '@/contexts/CampaignContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGameStore } from '@/stores/gameStore';
import { actionsService } from '@/services/actions.service';
import { actionErrorKey } from '@/utils/actionTargeting';
import Toast, { useToast } from '@/components/Toast';
import type { ActionCard, ActionCardTarget, ActionCardView, ActionMaskedName, ConcentrationCard, PlayerActionCardTarget } from '@/types/actions';

type Target = ActionCardTarget | PlayerActionCardTarget;

function useDisplayName() {
  // A player's card omits the name of a masked token; the GM's carries both, and reads the real one.
  const { t } = useTranslation();
  return (name: string | undefined, masked: ActionMaskedName | undefined): string =>
    name !== undefined ? name : masked ? t(masked === 'something-invisible' ? 'actionCard.somethingInvisible' : 'actionCard.something') : '';
}

const asGm = (target: Target): ActionCardTarget | null => ('ac' in target ? target : null);

const BUTTON = 'rounded-sm border border-spirit/40 bg-spirit/10 px-2 py-0.5 text-xs font-medium text-spirit-ink hover:bg-spirit/20 disabled:opacity-50';

export default function ActionCardMessage({ messageId, card }: { messageId: string; card: ActionCardView }) {
  const { t } = useTranslation();
  const name = useDisplayName();
  const { userRole, campaign } = useCampaign();
  const { user } = useAuth();
  const tokens = useGameStore((s) => s.tokens);
  const { toast, showToast, hideToast } = useToast();
  const isGm = userRole === 'GM';
  const gmCard = isGm ? (card as ActionCard) : null;
  const undone = card.undoneAt !== undefined;

  const mine = new Set((campaign?.characters ?? []).filter((c) => c.userId === user?.id).map((c) => c.id));
  const isMine = (tokenId: string) => {
    const characterId = tokens[tokenId]?.characterId;
    return !!characterId && mine.has(characterId);
  };

  const refused = (error: string | undefined) => showToast(t(actionErrorKey(error)), 'error');
  const undo = async () => {
    const answer = await actionsService.undo(messageId);
    if (!answer.ok) refused(answer.error);
  };
  const concentrate = async (tokenId: string) => {
    const answer = await actionsService.concentration(messageId, tokenId);
    if (!answer.ok) refused(answer.error);
  };

  const actor = name(card.actor.name, card.actor.maskedName);
  const targetNames = card.targets.map((tg) => name(tg.name, tg.maskedName)).join(', ');
  const header = targetNames
    ? t('actionCard.header', { actor, targets: targetNames, action: card.actionName })
    : t('actionCard.headerNoTarget', { actor, action: card.actionName });

  const modeWord = card.mode === 'normal' ? null
    : card.mode === 'disadvantage' && card.disadvantageReason === 'long-range' ? t('actionCard.disadvantageLongRange')
    : t(`actionCard.${card.mode}`);

  return (
    <div className="space-y-1 text-sm text-spirit-ink">
      <p className="font-semibold">{header}</p>
      {card.targets.map((tg) => {
        const gm = asGm(tg);
        const label = name(tg.name, tg.maskedName);
        const hp = 'hp' in tg ? tg.hp : gm && gm.hpMax > 0 ? { current: gm.hpAfter, max: gm.hpMax, temp: gm.temp } : undefined;
        const state = 'state' in tg ? tg.state : undefined;
        const dc = tg.concentrationCheckDc;
        const canRoll = dc !== undefined && !tg.concentrationRolledAt && !undone && (isGm || isMine(tg.tokenId));
        return (
          <div key={tg.tokenId} className="space-y-0.5">
            {tg.attack && (
              <p>
                {t('actionCard.attack', { total: tg.attack.total, dice: tg.attack.d20s.join(', ') })}
                {' · '}
                <span className="font-medium">{tg.attack.critical ? t('actionCard.critical') : tg.attack.hit ? t('actionCard.hit') : t('actionCard.miss')}</span>
                {modeWord && <> · <span>{modeWord}</span></>}
                {gm && <> · <span>{t('actionCard.againstAc', { ac: gm.ac })}</span></>}
                {gm?.hitChance !== undefined && <> · <span>{t('actionCard.chance', { chance: Math.round(gm.hitChance * 100) })}</span></>}
              </p>
            )}
            {tg.damage && tg.damage.length > 0 && (
              <p>{t('actionCard.damage', { parts: tg.damage.map((d) => t('actionCard.damagePart', { total: d.total, type: d.type ?? '' }).trim()).join(', ') })}</p>
            )}
            {tg.healing !== undefined && <p>{t('actionCard.healing', { amount: tg.healing })}</p>}
            {hp ? (
              <p>{hp.temp ? t('actionCard.targetHpTemp', { name: label, current: hp.current, max: hp.max, temp: hp.temp }) : t('actionCard.targetHp', { name: label, current: hp.current, max: hp.max })}</p>
            ) : state ? (
              <p>{t('actionCard.targetState', { name: label, state: t(`actionCard.states.${state}`) })}</p>
            ) : null}
            {gm && gm.hpMax > 0 && <p className="text-xs opacity-80">{t('actionCard.hpChange', { before: gm.hpBefore, after: gm.hpAfter })}</p>}
            {canRoll && (
              <button type="button" className={BUTTON} onClick={() => void concentrate(tg.tokenId)}>
                {t('actionCard.concentration', { dc })}
              </button>
            )}
          </div>
        );
      })}
      {gmCard?.extraText && <p className="text-xs opacity-80">{gmCard.extraText}</p>}
      {card.extraText && !gmCard && <p className="text-xs opacity-80">{card.extraText}</p>}
      {undone ? (
        <p className="text-xs italic">{card.undoPartial ? t('actionCard.undonePartial') : t('actionCard.undone')}</p>
      ) : (
        isGm && <button type="button" className={BUTTON} onClick={() => void undo()}>{t('actionCard.undo')}</button>
      )}
      <Toast message={toast.message} type={toast.type} show={toast.show} onClose={hideToast} />
    </div>
  );
}

/** A concentration roll's own small line. */
export function ConcentrationLine({ card }: { card: ConcentrationCard }) {
  const { t } = useTranslation();
  const name = useDisplayName();
  return (
    <>
      {t('actionCard.concentrationLine', {
        name: name(card.name, card.maskedName),
        dc: card.dc,
        total: card.total,
        result: card.kept ? t('actionCard.keeps') : t('actionCard.loses'),
      })}
    </>
  );
}
