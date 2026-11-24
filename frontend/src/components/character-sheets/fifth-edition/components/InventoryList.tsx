/**
 * InventoryList Component
 *
 * Displays character inventory items and currency.
 * Updated: Added attunement slots tracker and better attunement display
 */

import React from 'react';
import { Package, Coins, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { FifthEditionInventoryItem as InventoryItem, FifthEditionCurrency as Currency } from '@/types/game-systems';
import { carryingCapacity } from '@/utils/rules/fifthEdition';

interface InventoryListProps {
  inventory?: InventoryItem[];
  currency?: Currency;
  /** The character's Strength score, which sets what they can carry. */
  strengthScore?: number;
  /**
   * Weight, total weight and carrying capacity are shown (default). Off in a
   * Flexible campaign, which does not track them; the weights stay on the sheet.
   */
  showWeight?: boolean;
}

/**
 * CurrencyDisplay - Shows character's money
 */
const CurrencyDisplay: React.FC<{ currency: Currency }> = ({ currency }) => {
  const { t } = useTranslation();
  const coins = [
    { label: t('inventoryPanel.coinShort.pp'), value: currency.pp },
    { label: t('inventoryPanel.coinShort.gp'), value: currency.gp },
    { label: t('inventoryPanel.coinShort.ep'), value: currency.ep },
    { label: t('inventoryPanel.coinShort.sp'), value: currency.sp },
    { label: t('inventoryPanel.coinShort.cp'), value: currency.cp },
  ];

  return (
    <div className="p-4 bg-ink/10 border-2 border-ink/20 rounded-lg">
      <div className="flex items-center space-x-2 mb-3">
        <Coins className="w-5 h-5 text-ink-secondary" />
        <h4 className="font-semibold text-ink">{t('sheet5e.currency')}</h4>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {coins.map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-xs text-ink-muted mb-1">{label}</div>
            <div className="text-lg font-bold text-ink">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * InventoryItem Row
 */
const InventoryItemRow: React.FC<{ item: InventoryItem; showWeight: boolean }> = ({ item, showWeight }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between p-2 hover:bg-ink/5 rounded-sm border-b border-ink/10 last:border-0">
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <Package className="w-4 h-4 text-ink-muted" />
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="font-medium text-ink">{item.name}</span>
              {item.equipped && (
                <span className="px-1.5 py-0.5 text-xs bg-success/15 text-success-ink rounded-sm border border-success/30">
                  {t('sheet5e.equipped')}
                </span>
              )}
              {item.attuned && (
                <span className="px-1.5 py-0.5 text-xs bg-spirit/15 text-spirit-ink rounded-sm border border-spirit/30 flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  {t('sheet5e.attuned')}
                </span>
              )}
              {item.requiresAttunement && !item.attuned && (
                <span className="px-1.5 py-0.5 text-xs bg-warning/15 text-warning-ink rounded-sm border border-warning/30">
                  {t('sheet5e.requiresAttunement')}
                </span>
              )}
            </div>
            {item.notes && (
              <div className="text-xs text-ink-muted mt-1">{item.notes}</div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4 text-sm text-ink-secondary">
        <div className="text-right">
          <div className="text-xs text-ink-muted">{t('sheet5e.quantityShort')}</div>
          <div>{item.quantity ?? '—'}</div>
        </div>
        {showWeight && (
          <div className="text-right">
            <div className="text-xs text-ink-muted">{t('sheet5e.weightShort')}</div>
            <div>{item.weight != null ? `${item.weight} lb` : '—'}</div>
          </div>
        )}
        <div className="text-right">
          <div className="text-xs text-ink-muted">{t('sheet5e.value')}</div>
          <div>{item.value != null ? `${item.value} gp` : '—'}</div>
        </div>
      </div>
    </div>
  );
};

/**
 * InventoryList - Displays inventory and currency
 */
export const InventoryList: React.FC<InventoryListProps> = ({ inventory, currency, strengthScore, showWeight = true }) => {
  const { t } = useTranslation();
  // The schema lets an item go without either: one with no weight weighs
  // nothing, and one with no quantity is one item.
  const totalWeight = inventory?.reduce((sum, item) => sum + (item.weight ?? 0) * (item.quantity ?? 1), 0) ?? 0;

  // Calculate attunement slots (5E max: 3 attuned items)
  const attunedItems = inventory?.filter(item => item.attuned) || [];
  const attunedCount = attunedItems.length;
  const maxAttunement = 3;

  return (
    <div className="space-y-4">
      {/* Currency */}
      {currency && <CurrencyDisplay currency={currency} />}

      {/* Attunement Slots Tracker */}
      {inventory && inventory.some(item => item.requiresAttunement || item.attuned) && (
        <div className="p-4 bg-spirit/10 border-2 border-spirit/30 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Star className="w-5 h-5 text-spirit-ink" />
              <h4 className="font-semibold text-ink">{t('sheet5e.attunementSlots')}</h4>
            </div>
            <span className={`text-lg font-bold ${attunedCount >= maxAttunement ? 'text-danger-ink' : 'text-spirit-ink'}`}>
              {attunedCount} / {maxAttunement}
            </span>
          </div>
          <div className="flex space-x-2">
            {Array.from({ length: maxAttunement }).map((_, idx) => (
              <div
                key={idx}
                className={`flex-1 h-2 rounded-full ${
                  idx < attunedCount
                    ? 'bg-spirit'
                    : 'bg-ink/15'
                }`}
              />
            ))}
          </div>
          {attunedItems.length > 0 && (
            <div className="mt-3 text-xs text-spirit-ink">
              <span className="font-medium">{t('sheet5e.attunedTo')}</span>{' '}
              {attunedItems.map(item => item.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Inventory Items */}
      <div className="bg-ink/5 border border-ink/10 rounded-lg overflow-hidden">
        <div className="p-3 bg-ink/10 border-b border-ink/10">
          <div className="flex flex-wrap items-center justify-between gap-x-4 sm:flex-nowrap">
            <h4 className="font-semibold text-ink">{t('sheet5e.equipmentAndItems')}</h4>
            {showWeight && (
              <span className="text-sm text-ink-secondary">
                {t('sheet5e.totalWeight')}{' '}<span className="font-semibold">{totalWeight.toFixed(1)} lb</span>
              </span>
            )}
          </div>
          {showWeight && strengthScore != null && (
            <div className="mt-1 text-right text-xs text-ink-secondary">
              {t('sheet5e.carryingCapacity', { carry: carryingCapacity(strengthScore).carry, pushDragLift: carryingCapacity(strengthScore).pushDragLift })}
            </div>
          )}
        </div>
        <div className="divide-y divide-ink/10">
          {inventory && inventory.length > 0 ? (
            inventory.map((item, index) => (
              <InventoryItemRow key={index} item={item} showWeight={showWeight} />
            ))
          ) : (
            <div className="p-8 text-center text-ink-muted">
              {t('sheet5e.noItems')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
