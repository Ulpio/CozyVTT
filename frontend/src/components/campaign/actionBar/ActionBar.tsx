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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCampaign } from '@/contexts/CampaignContext';
import { useGameStore, useCharacterHp } from '@/stores/gameStore';
import { useActionStore } from '@/stores/actionStore';
import { useTableRoll } from '@/hooks/useTableRoll';
import socketClient from '@/services/socket';
import Button from '@/components/ui/Button';
import { extractCharacterHp } from '@/utils/characterHp';
import { getCharacterRolls, type CharacterRolls, type RollOption } from '@/utils/characterRolls';
import { buildNpcRolls } from '@/utils/npcRolls';
import { applyRollMode, ROLL_MODES } from '@/utils/rollModes';
import type { ActionOption } from '@/types/actions';
import type { FifthEditionCharacterData } from '@/types/game-systems';
import ActionButton from './ActionButton';
import ActorSummary from './ActorSummary';
import SpellMenu from './SpellMenu';
import ChecksMenu from './ChecksMenu';
import { useBarActorChoice, useActorSheet } from './useBarActor';
import { useActionOptions } from './useActionOptions';

type Menu = 'spells' | 'items' | 'checks';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function ActionBar() {
  const { t } = useTranslation();
  const { campaign, currentMap } = useCampaign();
  const { actor, candidates, choose } = useBarActorChoice();
  const characterId = actor?.kind === 'character' ? actor.token.characterId : null;
  const sheet = useActorSheet(characterId);
  const options = useActionOptions(currentMap?.id, actor?.token.id ?? null, sheet?.updatedAt);
  const characterHp = useCharacterHp();
  const mode = useActionStore((s) => s.mode);
  const pending = useActionStore((s) => s.pending);
  const tableRoll = useTableRoll(socketClient);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [gripFor, setGripFor] = useState<ActionOption | null>(null);
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

  const attacks = options.filter((o) => o.group !== 'spell');
  const spells = options.filter((o) => o.group === 'spell');
  const rolls: CharacterRolls | null = actor.kind === 'npc'
    ? buildNpcRolls(token.statBlock, gameSystem)
    : sheet ? getCharacterRolls(sheet.gameSystem, sheet.data) : null;

  /** Pick an action: an attack or a heal waits for a target on the map; the rest resolve at once. */
  const run = (option: ActionOption, extra: { slotLevel?: number; grip?: 'one' | 'two' } = {}) => {
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

  const items = (sheetData?.inventory ?? []).map((item) => ({ item, action: attacks.find((o) => o.group === 'attack' && sameName(o.name, item.name)) }));


  return (
    <section aria-label={t('actionBar.label')} className="shrink-0 space-y-2 border-t border-moss-green/20 bg-parchment/40 px-3 py-2">
      {pending && (
        <div className="flex items-center gap-3 text-sm text-brand-ink" role="status">
          <span>{t('actionBar.chooseTarget', { name: pending.option.name })}</span>
          <Button size="sm" variant="ghost" onClick={() => useActionStore.getState().cancel()}>{t('actionBar.cancel')}</Button>
        </div>
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
          {menu === 'spells' && <SpellMenu spells={spells} slots={sheetData?.spellcasting?.slots} onCast={(option, slotLevel) => run(option, slotLevel !== undefined ? { slotLevel } : {})} />}
          {menu === 'checks' && <ChecksMenu rolls={rolls} onRoll={roll} />}
          {menu === 'items' && (items.length === 0 ? <p className="text-sm text-ink-muted">{t('actionBar.noItems')}</p> : (
            <div className="flex flex-wrap gap-1.5">
              {items.map(({ item, action }, index) => (
                <ActionButton key={index} menu disabled={!action} detail={action ? undefined : t('actionBar.itemWithoutAction')} onClick={() => action && pick(action)}>{item.name}</ActionButton>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ActorSummary token={token} hp={hp ? { current: hp.current, max: hp.max } : null} ac={ac} candidates={candidates} onChoose={choose} />

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {options.length === 0 && <p className="text-sm text-ink-muted">{t('actionBar.noActions')}</p>}
          {attacks.map((option) => (
            <ActionButton key={option.id} detail={option.summary} pressed={pending?.option.id === option.id} onClick={() => pick(option)}>{option.name}</ActionButton>
          ))}
          {spells.length > 0 && <ActionButton menu pressed={menu === 'spells'} onClick={() => toggle('spells')}>{t('actionBar.menus.spells')}</ActionButton>}
          {actor.kind === 'character' && <ActionButton menu pressed={menu === 'items'} onClick={() => toggle('items')}>{t('actionBar.menus.items')}</ActionButton>}
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
