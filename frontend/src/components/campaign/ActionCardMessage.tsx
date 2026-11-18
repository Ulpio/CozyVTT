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
//
// A save card adds the save and its DC, the damage rolled once for all,
// "waiting for N saves" while any is pending, and per target passed or failed
// with the total when the card carries it (a monster's stays with the GM).
// The player whose save it is gets the roll buttons on the target; the GM
// gets Roll the rest, an Undo per target and Undo all.
// ============================================

import { useTranslation } from 'react-i18next';
import { useCampaign } from '@/contexts/CampaignContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGameStore } from '@/stores/gameStore';
import { actionsService } from '@/services/actions.service';
import { actionErrorKey } from '@/utils/actionTargeting';
import Toast, { useToast } from '@/components/Toast';
import { SaveModeButtons, useRollSave } from './actionBar/SavePrompt';
import type {
  ActionAbility,
  ActionAttackResult,
  ActionCard,
  ActionCardTarget,
  ActionCardView,
  ActionDamagePart,
  ActionMaskedName,
  ConcentrationCard,
  PlayerActionCard,
  PlayerActionCardTarget,
  RechargeCard,
} from '@/types/actions';

type Target = ActionCardTarget | PlayerActionCardTarget;

function useDisplayName() {
  // A player's card omits the name of a masked token; the GM's carries both, and reads the real one.
  const { t } = useTranslation();
  return (name: string | undefined, masked: ActionMaskedName | undefined): string =>
    name !== undefined ? name : masked ? t(masked === 'something-invisible' ? 'actionCard.somethingInvisible' : 'actionCard.something') : '';
}

const asGm = (target: Target): ActionCardTarget | null => ('ac' in target ? target : null);

const BUTTON = 'rounded-sm border border-spirit/40 bg-spirit/10 px-2 py-0.5 text-xs font-medium text-spirit-ink hover:bg-spirit/20 disabled:opacity-50';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** How many saves the card still waits for: the player's count is projected, the GM counts them. */
function pendingCount(card: ActionCardView): number {
  if (card.undoneAt) return 0;
  if ('pendingSaves' in card && card.pendingSaves !== undefined) return card.pendingSaves;
  return (card.targets as Target[]).filter((tg) => tg.save?.status === 'pending' && !tg.undoneAt).length;
}

export default function ActionCardMessage({ messageId, card }: { messageId: string; card: ActionCardView }) {
  const { t } = useTranslation();
  const name = useDisplayName();
  const { userRole, campaign } = useCampaign();
  const { user } = useAuth();
  const tokens = useGameStore((s) => s.tokens);
  const { toast, showToast, hideToast } = useToast();
  const saves = useRollSave();
  const isGm = userRole === 'GM';
  const gmCard = isGm ? (card as ActionCard) : null;
  const undone = card.undoneAt !== undefined;
  const targets = card.targets as Target[];
  const perTarget = isGm && targets.length > 1;

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
  const undoTarget = async (tokenId: string) => {
    const answer = await actionsService.undoTarget(messageId, tokenId);
    if (!answer.ok) refused(answer.error);
  };
  const rollTheRest = async () => {
    const answer = await actionsService.saveRemaining(messageId);
    if (!answer.ok) refused(answer.error);
  };
  const concentrate = async (tokenId: string) => {
    const answer = await actionsService.concentration(messageId, tokenId);
    if (!answer.ok) refused(answer.error);
  };

  const actor = name(card.actor.name, card.actor.maskedName);
  const targetNames = targets.map((tg) => name(tg.name, tg.maskedName)).join(', ');
  const header = targetNames
    ? t('actionCard.header', { actor, targets: targetNames, action: card.actionName })
    : t('actionCard.headerNoTarget', { actor, action: card.actionName });

  const modeWord = card.mode === 'normal' ? null
    : card.mode === 'disadvantage' && card.disadvantageReason === 'long-range' ? t('actionCard.disadvantageLongRange')
    : t(`actionCard.${card.mode}`);

  // A rider's line (Sneak Attack) is named, with the dice it rolled: the breakdown's "2d6: 3+2".
  const damageText = (parts: ActionDamagePart[]) => parts.map((d) => (d.label
    ? t('actionCard.riderPart', { label: d.label, dice: d.breakdown.split(':')[0].trim(), total: d.total, type: d.type ?? '' })
    : t('actionCard.damagePart', { total: d.total, type: d.type ?? '' })).trim()).join(', ');
  const abilityName = (ability: ActionAbility) => t(`guidedCreation.ability.${ability}`);
  const waiting = pendingCount(card);

  const attackLine = (attack: ActionAttackResult, gm: ActionCardTarget | null, key?: number) => (
    <p key={key}>
      {t('actionCard.attack', { total: attack.total, dice: attack.d20s.join(', ') })}
      {' · '}
      <span className="font-medium">{attack.critical ? t('actionCard.critical') : attack.hit ? t('actionCard.hit') : t('actionCard.miss')}</span>
      {modeWord && <> · <span>{modeWord}</span></>}
      {gm && <> · <span>{t('actionCard.againstAc', { ac: gm.ac })}</span></>}
      {gm?.hitChance !== undefined && <> · <span>{t('actionCard.chance', { chance: Math.round(gm.hitChance * 100) })}</span></>}
    </p>
  );

  /** "Mara: saved (17: 9, 14, advantage)"; the GM also reads the bonus, a player a monster's result alone. */
  const saveLine = (tg: Target, label: string) => {
    const save = tg.save;
    if (!save) return null;
    if (save.status === 'pending') return <p>{t('actionCard.saveWaiting', { name: label })}</p>;
    const result = save.success ? t('actionCard.saved') : t('actionCard.failed');
    const detail: string[] = [];
    if (save.d20s) detail.push(save.d20s.join(', '));
    if (save.mode && save.mode !== 'normal') detail.push(t(`actionCard.${save.mode}`));
    if ('bonus' in save) detail.push(signed(save.bonus));
    if (save.total === undefined) return <p>{t('actionCard.saveResult', { name: label, result })}</p>;
    return <p>{t('actionCard.saveResultDetail', { name: label, result, detail: [String(save.total), detail.join(', ')].filter(Boolean).join(': ') })}</p>;
  };

  return (
    <div className="space-y-1 text-sm text-spirit-ink">
      <p className="font-semibold">{header}</p>
      {card.save && (
        <p>
          {t('actionCard.save', { ability: abilityName(card.save.ability), dc: card.save.dc })}
          {card.save.halfOnSave && <> · {t('actionCard.halfOnSave')}</>}
        </p>
      )}
      {card.damageRoll && card.damageRoll.length > 0 && <p>{t('actionCard.damageRoll', { parts: damageText(card.damageRoll) })}</p>}
      {waiting > 0 && <p className="font-medium">{t('actionCard.waitingSaves', { count: waiting })}</p>}
      {targets.map((tg) => {
        const gm = asGm(tg);
        const label = name(tg.name, tg.maskedName);
        const targetUndone = tg.undoneAt !== undefined;
        const hp = 'hp' in tg ? tg.hp : gm && gm.hpMax > 0 ? { current: gm.hpAfter, max: gm.hpMax, temp: gm.temp } : undefined;
        const state = 'state' in tg ? tg.state : undefined;
        const dc = tg.concentrationCheckDc;
        const canRoll = dc !== undefined && !tg.concentrationRolledAt && !undone && !targetUndone && (isGm || isMine(tg.tokenId));
        const yourSave = !isGm && !undone && !targetUndone && 'yourSave' in tg && tg.yourSave === true && tg.save?.status === 'pending';
        return (
          <div key={tg.tokenId} className="space-y-0.5">
            {tg.rays !== undefined && tg.rays > 1 && <p className="text-xs opacity-80">{t('actionCard.rays', { count: tg.rays })}</p>}
            {tg.attacks && tg.attacks.length > 0
              ? tg.attacks.map((attack, i) => attackLine(attack, gm, i))
              : tg.attack && attackLine(tg.attack, gm)}
            {saveLine(tg, label)}
            {gm?.save?.advantageReason === 'magic-resistance' && <p className="text-xs opacity-80">{t('actionCard.magicResistance')}</p>}
            {yourSave && tg.save && (
              <div role="group" aria-label={t('actionCard.saveGroup', { name: label, ability: abilityName(tg.save.ability), dc: tg.save.dc })} className="flex flex-wrap gap-1.5">
                <SaveModeButtons disabled={saves.isRolling(messageId, tg.tokenId)} onRoll={(mode) => void saves.roll(messageId, tg.tokenId, mode)} />
              </div>
            )}
            {tg.damage && tg.damage.length > 0 && <p>{t('actionCard.damage', { parts: damageText(tg.damage) })}</p>}
            {tg.healing !== undefined && <p>{t('actionCard.healing', { amount: tg.healing })}</p>}
            {hp ? (
              <p>{hp.temp ? t('actionCard.targetHpTemp', { name: label, current: hp.current, max: hp.max, temp: hp.temp }) : t('actionCard.targetHp', { name: label, current: hp.current, max: hp.max })}</p>
            ) : state ? (
              <p>{t('actionCard.targetState', { name: label, state: t(`actionCard.states.${state}`) })}</p>
            ) : null}
            {gm && gm.hpMax > 0 && <p className="text-xs opacity-80">{t('actionCard.hpChange', { before: gm.hpBefore, after: gm.hpAfter })}</p>}
            {targetUndone && !undone && <p className="text-xs italic">{t('actionCard.targetUndone', { name: label })}</p>}
            {canRoll && (
              <button type="button" className={BUTTON} onClick={() => void concentrate(tg.tokenId)}>
                {t('actionCard.concentration', { dc })}
              </button>
            )}
            {perTarget && !undone && !targetUndone && (
              <button type="button" className={BUTTON} aria-label={t('actionCard.undoTarget', { name: label })} onClick={() => void undoTarget(tg.tokenId)}>
                {t('actionCard.undo')}
              </button>
            )}
          </div>
        );
      })}
      {card.selfHealing !== undefined && <p>{t('actionCard.selfHealing', { name: actor, amount: card.selfHealing })}</p>}
      {card.ridersUnused && card.ridersUnused.length > 0 && <p className="text-xs opacity-80">{t('actionCard.ridersUnused', { names: card.ridersUnused.join(', ') })}</p>}
      {gmCard?.extraText && <p className="text-xs opacity-80">{gmCard.extraText}</p>}
      {card.extraText && !gmCard && <p className="text-xs opacity-80">{(card as PlayerActionCard).extraText}</p>}
      {undone ? (
        <p className="text-xs italic">{card.undoPartial ? t('actionCard.undonePartial') : t('actionCard.undone')}</p>
      ) : (
        isGm && (
          <div className="flex flex-wrap gap-1.5">
            {waiting > 0 && <button type="button" className={BUTTON} onClick={() => void rollTheRest()}>{t('actionCard.rollTheRest')}</button>}
            <button type="button" className={BUTTON} onClick={() => void undo()}>{perTarget ? t('actionCard.undoAll') : t('actionCard.undo')}</button>
          </div>
        )
      )}
      <Toast message={toast.message} type={toast.type} show={toast.show} onClose={hideToast} />
      {saves.toastElement}
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

/** A recharge roll's own small line ("Dragon: recharge of Fire Breath (5–6): 6, recharged"). */
export function RechargeLine({ card }: { card: RechargeCard }) {
  const { t } = useTranslation();
  const name = useDisplayName();
  return (
    <>
      {t('actionCard.rechargeLine', {
        name: name(card.name, card.maskedName),
        action: card.actionName,
        range: card.min < 6 ? `${card.min}–6` : '6',
        d6: card.d6,
        result: card.recharged ? t('actionCard.recharged') : t('actionCard.stillSpent'),
      })}
    </>
  );
}
