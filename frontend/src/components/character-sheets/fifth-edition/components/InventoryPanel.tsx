/**
 * The 5E sheet's inventory: four body slots over a backpack grid.
 *
 * The slots say what the character holds, wears and shoots; the grid holds
 * the rest. Clicking an item opens its detail with what the viewer may do
 * (equip, stow, open a pack) and dragging an item to a slot or back does the
 * same. Every change is sent to the server, which holds the hand rules, the
 * AC and the fight's costs; its refusal is shown here as it comes.
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { useOptionalWebSocket } from '@/contexts/WebSocketContext';
import { useCombatState } from '@/stores/gameStore';
import { carryingCapacity } from '@/utils/rules/fifthEdition';
import { itemCategory } from '@/utils/itemIcons';
import type { InventorySlot } from '@/utils/inventory';
import type { FifthEditionInventoryItem as InventoryItem, FifthEditionCurrency as Currency } from '@/types/game-systems';
import ItemIcon from './ItemIcon';

interface InventoryPanelProps {
  characterId: string;
  inventory?: InventoryItem[];
  currency?: Currency;
  strengthScore?: number;
  ammoToRecover?: Record<string, number>;
  detailLevel?: 'FAITHFUL' | 'FLEXIBLE';
  /** The viewer is the character's owner or the GM: only they get the actions. */
  canAct?: boolean;
}

const DRAG_TYPE = 'text/plain';

const isPack = (item: InventoryItem) => /^pacote-/.test(item.compendiumRef?.slug ?? '') || /^pacote\b/i.test(item.name.trim());

/** The slots worth offering for an item; the server is the authority and refuses the rest. */
function slotsFor(item: InventoryItem): InventorySlot[] {
  switch (itemCategory(item)) {
    case 'meleeWeapon':
    case 'rangedWeapon':
      // The item's own text says two-handed (the action bar reads it the same way); the server puts a two-hander dropped on a hand in both.
      return /duas m[aã]os|two-handed/i.test(item.notes ?? '') ? ['both'] : ['main', 'off', 'both'];
    case 'shield':
      return ['off'];
    case 'armor':
      return ['armor'];
    case 'ammo':
      return ['ammo'];
    default:
      return item.equippable ? ['main', 'off'] : [];
  }
}

const kg = (lb: number) => Math.round((lb / 2) * 100) / 100;

export function InventoryPanel({ characterId, inventory = [], currency, strengthScore, ammoToRecover, detailLevel, canAct = false }: InventoryPanelProps) {
  const { t, i18n } = useTranslation();
  const socket = useOptionalWebSocket()?.socket;
  const inFight = useCombatState().active;
  const faithful = detailLevel !== 'FLEXIBLE';
  const [openId, setOpenId] = useState<string | null>(null);
  const [report, setReport] = useState<{ text: string; inDetail: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const number = (n: number) => n.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  const mayAct = canAct && !!socket;

  const inSlot = (slot: 'main' | 'off' | 'armor' | 'ammo') =>
    inventory.find((i) => i.slot === slot || (i.slot === 'both' && (slot === 'main' || slot === 'off')));
  const backpack = inventory.filter((i) => i.slot === undefined);
  const opened = inventory.find((i) => i.id !== undefined && i.id === openId);

  // One request at a time: a second click or drop before the answer would send it twice.
  const run = async (send: () => Promise<{ ok: boolean; error?: string; acUnknown?: boolean }>, closeOnDone: boolean, inDetail = true) => {
    if (pending.current || !socket) return;
    pending.current = true;
    setBusy(true);
    setReport(null);
    try {
      const answer = await send();
      if (!answer.ok) setReport({ text: answer.error ?? t('inventoryPanel.failed'), inDetail });
      else if (answer.acUnknown) setReport({ text: t('inventoryPanel.acUnknown'), inDetail });
      else if (closeOnDone) setOpenId(null);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const equip = (itemId: string, slot: InventorySlot | null) => run(() => socket!.equipItem({ characterId, itemId, slot }), true);
  const openPack = (itemId: string) => run(() => socket!.openPack({ characterId, itemId }), true);
  const recover = () => run(() => socket!.recoverAmmo({ characterId }), false, false);

  const dropOn = (slot: InventorySlot | null) => (e: React.DragEvent) => {
    if (!mayAct) return;
    e.preventDefault();
    const itemId = e.dataTransfer.getData(DRAG_TYPE);
    if (itemId) void equip(itemId, slot);
  };
  const allowDrop = (e: React.DragEvent) => {
    if (mayAct) e.preventDefault();
  };
  const draggable = (item: InventoryItem) =>
    mayAct && item.id
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData(DRAG_TYPE, item.id as string);
            e.dataTransfer.effectAllowed = 'move';
          },
        }
      : {};

  const select = (item: InventoryItem) => { setReport(null); setOpenId((current) => (current === item.id ? null : (item.id ?? null))); };

  const toRecover = Object.values(ammoToRecover ?? {}).filter((n) => n > 0);
  const recoverTotal = toRecover.reduce((a, b) => a + b, 0);
  const recoverHalf = toRecover.reduce((a, b) => a + Math.floor(b / 2), 0);
  const showRecover = mayAct && faithful && !inFight && recoverTotal > 0;

  const totalLb = inventory.reduce((sum, i) => sum + (i.weight ?? 0) * (i.quantity ?? 1), 0);
  const attunedCount = inventory.filter((i) => i.attuned).length;
  const detailActions = opened && mayAct ? slotsFor(opened).filter((s) => s !== opened.slot) : [];

  const tile = 'relative flex shrink-0 items-center justify-center rounded-md border border-[#5a5040] bg-[#2f2a22]';
  const slotBox = (key: 'main' | 'off' | 'armor' | 'ammo') => {
    const item = inSlot(key);
    const dim = item?.slot === 'both' && key === 'off';
    return (
      <div key={key} role="group" aria-label={t(`inventoryPanel.slots.${key}`)} onDragOver={allowDrop} onDrop={dropOn(key)} className="flex w-20 flex-col items-center gap-1 text-center">
        <span className="text-xs text-ink-secondary">{t(`inventoryPanel.slots.${key}`)}</span>
        {item ? (
          <button type="button" aria-label={item.name} onClick={() => select(item)} {...draggable(item)} className={`${tile} h-16 w-16 ${dim ? 'opacity-50' : ''}`}>
            <ItemIcon item={item} size={64} />
            {(item.quantity ?? 1) > 1 && <span className="absolute bottom-0.5 right-1 text-xs font-bold text-[#e8dcc0]">{item.quantity}</span>}
          </button>
        ) : (
          <span className={`${tile} h-16 w-16 border-dashed opacity-60`} />
        )}
        <span className="w-full truncate text-xs text-ink">{item ? item.name : t('inventoryPanel.empty')}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-center gap-3 rounded-lg border border-ink/10 bg-ink/5 p-3">
        {slotBox('main')}
        {slotBox('off')}
        {slotBox('armor')}
        <div className="flex flex-col items-center gap-1">
          {slotBox('ammo')}
          {showRecover && (
            <button type="button" disabled={busy} onClick={() => void recover()} className="max-w-40 rounded-cozy border border-moss-green/30 px-2 py-1 text-xs text-ink-muted hover:bg-moss-green/10">
              {t('inventoryPanel.recover', { half: recoverHalf, total: recoverTotal })}
            </button>
          )}
        </div>
      </div>

      {report && (!opened || !report.inDetail) && <p role="alert" className="rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger-ink">{report.text}</p>}

      <div role="group" aria-label={t('inventoryPanel.backpack')} onDragOver={allowDrop} onDrop={dropOn(null)} className="rounded-lg border border-ink/10 bg-ink/5 p-3">
        <h4 className="mb-2 font-semibold text-ink">{t('inventoryPanel.backpack')}</h4>
        {backpack.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('inventoryPanel.emptyBackpack')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {backpack.map((item, index) => (
              <button key={item.id ?? index} type="button" aria-label={item.name} title={item.name} onClick={() => select(item)} {...draggable(item)} className={`${tile} h-16 w-16`}>
                <ItemIcon item={item} size={64} />
                {(item.quantity ?? 1) > 1 && <span className="absolute bottom-0.5 right-1 text-xs font-bold text-[#e8dcc0]">{item.quantity}</span>}
              </button>
            ))}
          </div>
        )}
        {faithful && strengthScore != null && (
          <div className="mt-3">
            <p className="text-xs text-ink-secondary">
              {t('inventoryPanel.load', { total: number(kg(totalLb)), capacity: number(kg(carryingCapacity(strengthScore).carry)) })}
            </p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/15">
              <div className="h-full bg-moss-green" style={{ width: `${Math.min(100, (totalLb / Math.max(1, carryingCapacity(strengthScore).carry)) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {opened && (
        <div className="space-y-2 rounded-lg border border-ink/20 bg-paper p-3">
          <div className="flex items-center gap-2">
            <ItemIcon item={opened} size={40} />
            <span className="font-semibold text-ink">{t('inventoryPanel.quantity', { count: opened.quantity ?? 1, name: opened.name })}</span>
            <button type="button" onClick={() => { setReport(null); setOpenId(null); }} className="ml-auto text-sm text-ink-muted hover:text-ink">{t('inventoryPanel.close')}</button>
          </div>
          {faithful && opened.weight != null && <p className="text-sm text-ink-secondary">{t('inventoryPanel.weight', { kg: number(kg(opened.weight * (opened.quantity ?? 1))) })}</p>}
          {opened.notes && <p className="text-sm text-ink-muted">{opened.notes}</p>}
          {report?.inDetail && <p role="alert" className="rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger-ink">{report.text}</p>}
          {mayAct && (
            <div className="flex flex-wrap gap-2">
              {detailActions.map((slot) => (
                <button key={slot} type="button" disabled={busy} onClick={() => void equip(opened.id as string, slot)} className="min-h-9 rounded-cozy border border-moss-green/30 px-3 text-sm text-ink hover:bg-moss-green/10">
                  {t(`inventoryPanel.actions.${slot}`)}
                </button>
              ))}
              {opened.slot !== undefined && (
                <button type="button" disabled={busy} onClick={() => void equip(opened.id as string, null)} className="min-h-9 rounded-cozy border border-moss-green/30 px-3 text-sm text-ink hover:bg-moss-green/10">
                  {t('inventoryPanel.actions.stow')}
                </button>
              )}
              {isPack(opened) && (
                <button type="button" disabled={busy} onClick={() => void openPack(opened.id as string)} className="min-h-9 rounded-cozy border border-moss-green/30 px-3 text-sm text-ink hover:bg-moss-green/10">
                  {t('inventoryPanel.actions.openPack')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {attunedCount > 0 && <p className="text-sm text-spirit-ink">{t('inventoryPanel.attunement', { used: attunedCount })}</p>}

      {currency && (
        <div className="rounded-lg border-2 border-ink/20 bg-ink/10 p-4">
          <div className="mb-3 flex items-center space-x-2">
            <Coins className="h-5 w-5 text-ink-secondary" />
            <h4 className="font-semibold text-ink">{t('inventoryPanel.currency')}</h4>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((coin) => (
              <div key={coin} className="text-center">
                <div className="mb-1 text-xs text-ink-muted">{coin.toUpperCase()}</div>
                <div className="text-lg font-bold text-ink">{currency[coin]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryPanel;
