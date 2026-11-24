// ============================================
// Session Toolbar — grouped GM tools in the campaign header
// Replaces the row of seven identical labelled pill buttons with
// icon buttons in labelled groups (Content | Ambience | Settings),
// each with a tooltip. The open/close state still lives in
// CampaignPage — this is presentation only.
// ============================================

import {
  Map as MapIcon,
  Swords,
  Skull,
  Stamp,
  Ghost,
  Cloud,
  EyeOff,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { cn } from '@/utils/cn';

export type SessionToolKey =
  | 'maps'
  | 'tokens'
  | 'creatures'
  | 'templates'
  | 'spirit'
  | 'atmosphere'
  | 'secretCheck'
  | 'settings';

export interface ToolDef {
  key: SessionToolKey;
  labelKey: `session.tools.${SessionToolKey}`;
  icon: LucideIcon;
}

// Grouped by intent: campaign content, scene ambience, configuration. The
// compact layout's More lists the same tools in the same order
// (compact/MoreSheet.tsx).
export const TOOL_GROUPS: ToolDef[][] = [
  [
    { key: 'maps', labelKey: 'session.tools.maps', icon: MapIcon },
    { key: 'tokens', labelKey: 'session.tools.tokens', icon: Swords },
    { key: 'creatures', labelKey: 'session.tools.creatures', icon: Skull },
    { key: 'templates', labelKey: 'session.tools.templates', icon: Stamp },
  ],
  [
    { key: 'spirit', labelKey: 'session.tools.spirit', icon: Ghost },
    { key: 'atmosphere', labelKey: 'session.tools.atmosphere', icon: Cloud },
  ],
  [
    { key: 'secretCheck', labelKey: 'session.tools.secretCheck', icon: EyeOff },
    { key: 'settings', labelKey: 'session.tools.settings', icon: Settings },
  ],
];

interface SessionToolbarProps {
  /** Which slide-over panels are currently open (drives the active state). */
  openPanels: Partial<Record<SessionToolKey, boolean>>;
  onOpen: (key: SessionToolKey) => void;
  /** Spirit layer active for the campaign — keeps the purple ring cue. */
  spiritLayerEnabled?: boolean;
}

export default function SessionToolbar({
  openPanels,
  onOpen,
  spiritLayerEnabled = false,
}: SessionToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label={t('session.menus.label')}>
      {TOOL_GROUPS.map((group, groupIndex) => (
        <div key={groupIndex} className="flex items-center gap-1">
          {groupIndex > 0 && <div className="h-6 w-px bg-moss-green/20 mx-1" aria-hidden="true" />}
          {group.map(({ key, labelKey, icon }) => {
            const label = t(labelKey);
            return (
            <Tooltip key={key} content={label} side="bottom">
              <Button
                variant="ghost"
                iconOnly
                icon={icon}
                aria-label={label}
                onClick={() => onOpen(key)}
                className={cn(
                  openPanels[key] && 'bg-accent/15! text-accent-ink!',
                  key === 'spirit' && 'text-spirit-ink',
                  key === 'spirit' && spiritLayerEnabled && 'ring-2 ring-spirit-purple/50'
                )}
              />
            </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
