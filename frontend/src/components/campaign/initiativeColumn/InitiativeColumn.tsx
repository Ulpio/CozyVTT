import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronsLeft, ChevronsRight, ChevronRight } from 'lucide-react';
import { useCombatState } from '@/stores/gameStore';
import { useCampaign } from '@/contexts/CampaignContext';
import { optionalStorage } from '@/utils/optionalStorage';
import { initiativeRows, type InitiativeRow } from './rows';

const STORAGE_KEY = 'mesa.initiativeColumn.collapsed';

interface InitiativeColumnProps {
  compact: boolean;
  onRowClick?: (row: InitiativeRow) => void;
  /** Pixels from the map's top, under the toolbar band; null keeps a default place. */
  top?: number | null;
}

function Portrait({ row }: { row: InitiativeRow }) {
  return row.imageUrl ? (
    <img src={row.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover border border-moss-green/30" />
  ) : (
    <span
      aria-hidden="true"
      className="h-8 w-8 shrink-0 rounded-full border border-moss-green/30 bg-soft-cream flex items-center justify-center text-sm font-semibold text-brand-ink"
    >
      {row.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * The initiative order as a column at the map's left edge: who is up, in
 * order, with the value each rolled. Read only; initiative is edited in the
 * Initiative tab. Mounted over the map by the campaign page, so both layouts
 * show it.
 */
export default function InitiativeColumn({ compact, onRowClick, top = null }: InitiativeColumnProps) {
  const { t } = useTranslation();
  const combat = useCombatState();
  const { userRole } = useCampaign();
  // The stored choice, or null: then the layout decides, so a switch between
  // compact and desktop applies the new one's default.
  const [choice, setChoice] = useState<boolean | null>(() => {
    const stored = optionalStorage.getItem(STORAGE_KEY);
    return stored === null ? null : stored === '1';
  });
  const collapsed = choice ?? compact;

  if (!combat.active) return null;
  const rows = initiativeRows(combat, { isGM: userRole === 'GM' });

  const toggle = () => {
    optionalStorage.setItem(STORAGE_KEY, collapsed ? '0' : '1');
    setChoice(!collapsed);
  };

  return (
    <section
      role="region"
      aria-label={t('initiativeColumn.label')}
      style={top === null ? undefined : { top }}
      className={`absolute left-2 ${top === null ? 'top-14' : ''} z-20 flex max-h-[calc(100%-8rem)] flex-col rounded-xl border border-moss-green/30 bg-parchment/95 shadow-lg backdrop-blur-xs ${collapsed ? 'w-14' : 'w-44'}`}
    >
      <div className={`flex items-center gap-1 px-2 py-1 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && <span className="text-xs font-semibold text-brand-ink">{t('initiativeColumn.round', { round: combat.round })}</span>}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('initiativeColumn.expand') : t('initiativeColumn.collapse')}
          title={collapsed ? t('initiativeColumn.expand') : t('initiativeColumn.collapse')}
          className="rounded-sm p-1 text-stone-gray hover:text-brand-ink focus-visible:ring-2 focus-visible:ring-brand outline-hidden"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden="true" /> : <ChevronsLeft className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-1 pb-1">
        {rows.map((row) => (
          <li key={row.tokenId}>
            <button
              type="button"
              onClick={() => onRowClick?.(row)}
              aria-current={row.current ? 'true' : undefined}
              aria-label={collapsed ? t('initiativeColumn.collapsedRow', { name: row.name, value: row.value }) : undefined}
              title={collapsed ? row.name : undefined}
              className={`flex w-full items-center gap-2 rounded-lg border px-1.5 py-1 text-left hover:bg-soft-cream focus-visible:ring-2 focus-visible:ring-brand outline-hidden ${
                row.current ? 'border-brand bg-soft-cream' : 'border-transparent'
              } ${collapsed ? 'flex-col gap-0.5' : ''}`}
            >
              {row.current && <ChevronRight className="h-4 w-4 shrink-0 text-brand-ink" aria-hidden="true" />}
              <Portrait row={row} />
              {collapsed ? (
                <span className="text-sm font-bold text-brand-ink">{row.value}</span>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-brand-ink">{row.name}</span>
                    {row.hp && (
                      <span
                        role="meter"
                        aria-label={t('initiativeColumn.hp', { name: row.name, current: row.hp.current, max: row.hp.max })}
                        aria-valuemin={0}
                        aria-valuemax={row.hp.max}
                        aria-valuenow={Math.min(row.hp.current, row.hp.max)}
                        className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-stone-gray/30"
                      >
                        <span
                          className="block h-full bg-moss-green"
                          style={{ width: `${row.hp.max > 0 ? Math.max(0, Math.min(100, (row.hp.current / row.hp.max) * 100)) : 0}%` }}
                        />
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-lg font-bold text-brand-ink">{row.value}</span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
