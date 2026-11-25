// ============================================
// The action bar: a strip under the session map from which a player (or the
// GM, for the selected token) picks attacks, spells, items and checks.
//
// The actor's portrait with its own HP and AC on the left, its attacks as
// buttons in the middle with Spells, Items and Checks opening menus, and the
// roll mode (Normal / Advantage / Disadvantage) on the right. Picking an
// attack puts the map in targeting mode (actionStore); a cast spell or a
// monster's posted action resolves at once, with no target. No bar for a
// spectator, for a player with no token on this map, or for the GM with
// nothing selected (useBarActor). Menus open as a row of the bar itself, so
// they are never clipped by the sheet the compact layout shows the bar in.
// ============================================

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCampaign } from '@/contexts/CampaignContext';
import { useGameStore, useCharacterHp } from '@/stores/gameStore';
import { useActionStore } from '@/stores/actionStore';
import { useTableRoll } from '@/hooks/useTableRoll';
import socketClient from '@/services/socket';
import { extractCharacterHp } from '@/utils/characterHp';
import { getCharacterRolls, type CharacterRolls, type RollOption } from '@/utils/characterRolls';
import { buildNpcRolls } from '@/utils/npcRolls';
import { applyRollMode, ROLL_MODES } from '@/utils/rollModes';
import type { ActionOption } from '@/types/actions';
import type { FifthEditionCharacterData, FifthEditionInventoryItem } from '@/types/game-systems';
import ItemIcon from '@/components/character-sheets/fifth-edition/components/ItemIcon';
import { itemCategory } from '@/utils/itemIcons';
import ActionButton, { RechargeButtons } from './ActionButton';
import ActionIcon from './ActionIcon';
import { actionIconFor } from '@/utils/actionIcons';
import FeatureMenu from './FeatureMenu';
import RiderToggles from './RiderToggles';
import TurnStrip from './TurnStrip';
import { gateFor } from './turnGate';
import { actionsService } from '@/services/actions.service';
import ActorSummary from './ActorSummary';
import SpellMenu from './SpellMenu';
import ChecksMenu from './ChecksMenu';
import TargetingHint from './TargetingHint';
import { useBarActorChoice, useActorSheet } from './useBarActor';
import { useActionList } from './useActionOptions';

type Menu = 'spells' | 'items' | 'swap' | 'checks' | 'features' | 'common';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function ActionBar() {
  const { t } = useTranslation();
  const { campaign, currentMap, userRole } = useCampaign();
  const { actor, candidates, choose } = useBarActorChoice();
  const characterId = actor?.kind === 'character' ? actor.token.characterId : null;
  const sheet = useActorSheet(characterId);
  // Listed again when the sheet changes, or the token's spent recharges do (the GM's copy of the map carries them).
  // A player is never sent the spent mark, so a bar with a recharge on it is listed again whenever the token comes again.
  const spentKey = (actor?.token.rechargeSpent ?? []).join(',');
  // The fight's turn and spend come with `initiative.state`: the bar is listed again when they change.
  const combatKey = useGameStore((s) => (s.combat.active ? `${s.combat.currentTokenId}|${s.combat.round}|${JSON.stringify(s.combat.spend)}` : ''));
  const { options, combat } = useActionList(currentMap?.id, actor?.token.id ?? null, `${sheet?.updatedAt ?? ''}|${spentKey}|${combatKey}`, actor?.token);
  const characterHp = useCharacterHp();
  const mode = useActionStore((s) => s.mode);
  const pending = useActionStore((s) => s.pending);
  const tableRoll = useTableRoll(socketClient);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [gripFor, setGripFor] = useState<ActionOption | null>(null);
  const [swapping, setSwapping] = useState(false);
  const swapPending = useRef(false);
  // The bar is the page's only reader of the selection here; kept to re-render on it.
  useGameStore((s) => s.selectedTokenId);

  if (!actor) return null;
  const { token } = actor;
  const gameSystem = campaign?.gameSystem ?? null;
  const sheetData = sheet?.data as FifthEditionCharacterData | undefined;

  const hp = actor.kind === 'npc'
    ? token.hp
    : (characterId ? characterHp[characterId] : undefined) ?? (sheet ? extractCharacterHp(sheet.gameSystem, sheet.data as unknown as Record<string, unknown>) : null);
  const ac = actor.kind === 'npc' ? (token.statBlock?.ac ?? null) : (sheetData?.armorClass ?? null);

  const attacks = options.filter((o) => o.group === 'attack' || o.group === 'npc');
  const features = options.filter((o) => o.group === 'feature');
  const commons = options.filter((o) => o.group === 'common');
  const spells = options.filter((o) => o.group === 'spell');
  const rolls: CharacterRolls | null = actor.kind === 'npc'
    ? buildNpcRolls(token.statBlock, gameSystem)
    : sheet ? getCharacterRolls(sheet.gameSystem, sheet.data) : null;

  /** Pick an action: an attack or a heal waits for a target on the map; the rest resolve at once. */
  const run = (option: ActionOption, extra: { slotLevel?: number; grip?: 'one' | 'two'; amount?: number } = {}) => {
    const store = useActionStore.getState();
    store.begin({ actorTokenId: token.id, option, ...extra });
    if (option.reach?.kind !== 'self' && (option.resolution === 'cast' || option.resolution === 'post')) void store.resolvePending();
    setMenu(null);
    setGripFor(null);
  };

  const pick = (option: ActionOption) => {
    if (option.grips?.includes('one') && option.grips.includes('two')) setGripFor(option);
    else run(option);
  };

  const roll = (option: RollOption) => {
    const { expression, purpose } = option.supportsAdvantage ? applyRollMode(option.expression, option.purpose, mode, gameSystem) : option;
    void tableRoll({ expression, purpose, characterName: token.name });
    setMenu(null);
  };

  const toggle = (next: Menu) => { setMenu(menu === next ? null : next); setGripFor(null); };

  /** The GM rolls a spent recharge (a d6 posted to the chat) or brings it back by hand; the map sent again lists the bar anew. */
  const recharge = async (option: ActionOption, how: 'roll' | 'reset') => {
    if (!currentMap) return;
    const answer = how === 'roll'
      ? await actionsService.recharge(currentMap.id, token.id, option.id)
      : await actionsService.rechargeReset(currentMap.id, token.id, option.id);
    if (!answer.ok) useActionStore.getState().report(answer.error ?? '');
  };

  const faithful = campaign?.detailLevel !== 'FLEXIBLE';
  const inventory = sheetData?.inventory ?? [];

  /**
   * The ammunition left for a weapon, from the stack the next shot is taken
   * from (the server's rule, actionResolver/ammunition.ts): of the non-empty
   * stacks of that kind, the one in the ammo slot, else the first in the
   * backpack, else the first.
   */
  const ammoLeft = (slug: string) => {
    const ofKind = inventory.filter((i) => i.compendiumRef?.slug === slug && (i.quantity ?? 1) > 0);
    const stack = ofKind.find((i) => i.slot === 'ammo') ?? ofKind.find((i) => i.slot === undefined) ?? ofKind[0];
    return stack ? (stack.quantity ?? 1) : 0;
  };
  const label = (option: ActionOption) => (faithful && option.ammunition ? t('actionBar.withAmmo', { name: option.name, count: ammoLeft(option.ammunition.slug) }) : option.name);

  const isWeapon = (item: FifthEditionInventoryItem) => { const c = itemCategory(item); return c === 'meleeWeapon' || c === 'rangedWeapon'; };
  const inHand = inventory.filter((i) => i.id && (i.slot === 'main' || i.slot === 'off' || i.slot === 'both') && isWeapon(i));
  const inPack = inventory.filter((i) => i.id && i.slot === undefined && isWeapon(i));

  /** One request at a time. A two-handed weapon goes to both hands: the item's own text says so, else the server's refusal does. */
  const swap = async (item: FifthEditionInventoryItem, stow: boolean) => {
    if (swapPending.current || !characterId || !item.id) return;
    swapPending.current = true;
    setSwapping(true);
    try {
      const send = (slot: 'main' | 'both' | null) => socketClient.equipItem({ characterId, itemId: item.id as string, slot });
      const twoHanded = /duas m[aã]os|two-handed/i.test(item.notes ?? '');
      let answer = await send(stow ? null : twoHanded ? 'both' : 'main');
      if (!answer.ok && !stow && !twoHanded && answer.error === 'Esse item não vai nesse espaço.') answer = await send('both');
      if (answer.ok) setMenu(null);
      else useActionStore.getState().report(answer.error ?? '');
    } finally {
      swapPending.current = false;
      setSwapping(false);
    }
  };

  const items = inventory.map((item) => ({ item, action: attacks.find((o) => o.group === 'attack' && sameName(o.name, item.name)) }));


  return (
    <section aria-label={t('actionBar.label')} className="shrink-0 space-y-2 border-t border-moss-green/20 bg-parchment/40 px-3 py-2">
      {combat && <TurnStrip combat={combat} />}
      {pending && <TargetingHint variant="bar" />}
      {pending && pending.actorTokenId === token.id && pending.option.riders && pending.option.riders.length > 0 && (
        <RiderToggles riders={pending.option.riders} slots={sheetData?.spellcasting?.slots} combat={combat} />
      )}

      {gripFor && (
        <div role="group" aria-label={t('actionBar.grip')} className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-ink-muted">{gripFor.name}</span>
          <ActionButton menu onClick={() => run(gripFor, { grip: 'one' })}>{t('actionBar.gripOne')}</ActionButton>
          <ActionButton menu onClick={() => run(gripFor, { grip: 'two' })}>{t('actionBar.gripTwo')}</ActionButton>
        </div>
      )}

      {menu && (
        <div role="group" aria-label={t(`actionBar.menus.${menu}`)} className="max-h-48 overflow-y-auto rounded-cozy border border-moss-green/20 bg-paper/60 p-2">
          {menu === 'spells' && <SpellMenu spells={spells} slots={sheetData?.spellcasting?.slots} gate={(o) => gateFor(o, combat, t)} onCast={(option, slotLevel) => run(option, slotLevel !== undefined ? { slotLevel } : {})} />}
          {menu === 'checks' && <ChecksMenu rolls={rolls} onRoll={roll} />}
          {menu === 'features' && <FeatureMenu features={features} combat={combat} onUse={(option, amount) => run(option, amount !== undefined ? { amount } : {})} />}
          {menu === 'common' && (
            <div className="flex flex-wrap gap-1.5">
              {commons.map((option) => <ActionButton key={option.id} menu disabled={gateFor(option, combat, t) !== undefined} title={gateFor(option, combat, t)} onClick={() => run(option)}><span className="flex items-center gap-1.5"><ActionIcon icon={actionIconFor(option)} /><span className="truncate">{option.name}</span></span></ActionButton>)}
            </div>
          )}
          {menu === 'swap' && (inHand.length + inPack.length === 0 ? <p className="text-sm text-ink-muted">{t('actionBar.swapNone')}</p> : (
            <div className="space-y-2">
              {inHand.length > 0 && <SwapRow title={t('actionBar.swapHands')} items={inHand} hint={t('actionBar.stowHint')} busy={swapping} onPick={(item) => void swap(item, true)} />}
              {inPack.length > 0 && <SwapRow title={t('actionBar.swapBackpack')} items={inPack} busy={swapping} onPick={(item) => void swap(item, false)} />}
            </div>
          ))}
          {menu === 'items' && (items.length === 0 ? <p className="text-sm text-ink-muted">{t('actionBar.noItems')}</p> : (
            <div className="flex flex-wrap gap-1.5">
              {items.map(({ item, action }, index) => (
                <ActionButton key={index} menu disabled={!action} detail={action ? undefined : t('actionBar.itemWithoutAction')} onClick={() => action && pick(action)}><span className="flex items-center gap-1.5"><ItemIcon item={item} size={24} /><span className="truncate">{item.name}</span>{(item.quantity ?? 1) > 1 && <span className="text-ink-muted">×{item.quantity}</span>}</span></ActionButton>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ActorSummary token={token} hp={hp ? { current: hp.current, max: hp.max } : null} ac={ac} candidates={candidates} onChoose={choose} restFor={characterId ? { characterId, hitDice: sheetData?.hitDice, con: sheetData?.stats?.constitution?.modifier ?? 0 } : undefined} />

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {options.length === 0 && <p className="text-sm text-ink-muted">{t('actionBar.noActions')}</p>}
          {attacks.map((option) => option.recharge?.spent ? (
            <RechargeButtons key={option.id} option={option} isGm={userRole === 'GM'} onRoll={() => void recharge(option, 'roll')} onReset={() => void recharge(option, 'reset')} />
          ) : (
            <ActionButton key={option.id} detail={option.summary} pressed={pending?.option.id === option.id} disabled={gateFor(option, combat, t) !== undefined} title={gateFor(option, combat, t)} onClick={() => pick(option)}>{label(option)}</ActionButton>
          ))}
          {features.length > 0 && <ActionButton menu pressed={menu === 'features'} onClick={() => toggle('features')}>{t('actionBar.menus.features')}</ActionButton>}
          {commons.length > 0 && <ActionButton menu pressed={menu === 'common'} onClick={() => toggle('common')}>{t('actionBar.menus.common')}</ActionButton>}
          {spells.length > 0 && <ActionButton menu pressed={menu === 'spells'} onClick={() => toggle('spells')}>{t('actionBar.menus.spells')}</ActionButton>}
          {actor.kind === 'character' && <ActionButton menu pressed={menu === 'items'} onClick={() => toggle('items')}>{t('actionBar.menus.items')}</ActionButton>}
          {actor.kind === 'character' && <ActionButton menu pressed={menu === 'swap'} onClick={() => toggle('swap')}>{t('actionBar.menus.swap')}</ActionButton>}
          <ActionButton menu pressed={menu === 'checks'} onClick={() => toggle('checks')}>{t('actionBar.menus.checks')}</ActionButton>
        </div>

        <div role="radiogroup" aria-label={t('actionBar.mode.label')} className="flex overflow-hidden rounded-cozy border border-moss-green/30">
          {ROLL_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => useActionStore.getState().setMode(m)}
              className={`min-h-9 px-3 text-sm transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${mode === m ? 'bg-brand/20 font-semibold text-brand-ink' : 'text-ink-muted hover:bg-moss-green/10'}`}
            >
              {t(`actionBar.mode.${m}`)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A row of weapons the swap menu offers: pressing one sends the change; the buttons wait for the answer. */
function SwapRow({ title, items, hint, busy, onPick }: { title: string; items: FifthEditionInventoryItem[]; hint?: string; busy: boolean; onPick: (item: FifthEditionInventoryItem) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-ink-muted">{title}</span>
      {items.map((item) => (
        <ActionButton key={item.id} menu disabled={busy} title={hint} onClick={() => onPick(item)}>
          <span className="flex items-center gap-1.5"><ItemIcon item={item} size={24} /><span className="truncate">{item.name}</span></span>
        </ActionButton>
      ))}
    </div>
  );
}
