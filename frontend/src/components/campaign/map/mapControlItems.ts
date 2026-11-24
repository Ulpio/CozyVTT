// ============================================
// The map's controls as data, for the compact layout's Map controls sheet.
//
// On the compact layout the band across the top of the map is one row: the
// zoom buttons and their readout, Ping, Draw and Map controls. Map controls
// opens the rest of what the toolbar holds for the viewer as an action
// sheet: Fit to Screen, the grid and its colour, and on a map the ruler and
// its colour and the AoE shape; for the GM also, on a map, Paint where it is
// offered (on a map drawn in CozyVTT or one with no picture), Tools, which
// shows and hides the GM's tool stack (Fog, Walls and Lights), and the spirit
// tokens. Each row says what pressing it does now, since a row has no
// pressed state to show. A colour's row keeps the sheet open, so presses go
// round the colours; the others close it.
//
// The colours' names are the desktop toolbar's too, written once here. Map
// controls' tooltip is made from the rows (mapControlsTitle), so it names
// what the sheet holds for the viewer and no more.
//
// Pure: no React, no DOM.
// ============================================

import { Ghost, Grid3x3, Maximize2, Paintbrush, Palette, Ruler, Wrench, Zap } from 'lucide-react';
import type { MenuAction, MenuItem } from '@/components/ui/menu';
import i18n from '@/i18n';

export type GridColor = 'black' | 'white';
export type RulerColor = 'amber' | 'purple' | 'black';

/** The grid colour button's name and tooltip: the colour it shows now. */
export const gridColorLabel = (color: GridColor) => i18n.t('mapControls.gridColor', { color: i18n.t(`mapControls.colors.${color}`) });

/** The ruler colour button's name and tooltip: the colour it shows now. */
export const rulerColorLabel = (color: RulerColor) =>
  i18n.t('mapControls.rulerColor', { color: i18n.t(`mapControls.colors.${color}`) });

/** What the viewer sees of the map's controls now. */
export interface MapControlsView {
  isGM: boolean;
  /** A map is open, which the ruler and the AoE shape measure on. */
  hasMap: boolean;
  showGrid: boolean;
  gridColor: GridColor;
  showRuler: boolean;
  rulerColor: RulerColor;
  showAoE: boolean;
  /** For the GM: tokens on the spirit plane are drawn. */
  spiritTokensShown: boolean;
  /** For the GM: the tool stack shows. */
  toolsShown: boolean;
  /** For the GM: Paint is offered on this map, or on; null where it is not offered. */
  paint: 'offered' | 'on' | null;
}

/** What each row does. */
export interface MapControlsActions {
  fit: () => void;
  toggleGrid: () => void;
  nextGridColor: () => void;
  toggleRuler: () => void;
  nextRulerColor: () => void;
  toggleAoE: () => void;
  toggleSpiritTokens: () => void;
  toggleTools: () => void;
  togglePaint: () => void;
}

const row = (id: string, label: string, icon: MenuAction['icon'], run: () => void, extra: Partial<MenuAction> = {}): MenuAction => ({
  kind: 'command', id, label, icon, run, ...extra,
});

/** The rows of the Map controls sheet, in order, for what the viewer sees now. */
export function mapControlItems(view: MapControlsView, actions: MapControlsActions): MenuItem[] {
  const items: MenuItem[] = [
    row('fit', i18n.t('mapControls.fit'), Maximize2, actions.fit),
    row('grid', view.showGrid ? i18n.t('mapControls.hideGrid') : i18n.t('mapControls.showGrid'), Grid3x3, actions.toggleGrid),
  ];
  if (view.showGrid) items.push(row('grid-color', gridColorLabel(view.gridColor), Palette, actions.nextGridColor, { keepsOpen: true }));

  if (view.hasMap) {
    items.push({ kind: 'separator', id: 'measuring' });
    items.push(row('ruler', view.showRuler ? i18n.t('mapControls.putRulerAway') : i18n.t('mapControls.ruler'), Ruler, actions.toggleRuler, { title: i18n.t('mapControls.measure') }));
    if (view.showRuler) items.push(row('ruler-color', rulerColorLabel(view.rulerColor), Palette, actions.nextRulerColor, { keepsOpen: true }));
    items.push(row('aoe', view.showAoE ? i18n.t('mapControls.putAoeAway') : i18n.t('mapControls.aoe'), Zap, actions.toggleAoE, { title: i18n.t('mapControls.aoeHint') }));
  }

  if (view.isGM) {
    items.push({ kind: 'separator', id: 'gm' });
    if (view.hasMap && view.paint) {
      items.push(row('paint', view.paint === 'on' ? i18n.t('mapControls.putMapmakerAway') : i18n.t('mapControls.mapmaker'), Paintbrush, actions.togglePaint, { title: i18n.t('mapControls.mapmakerHint') }));
    }
    // The stack is drawn only on a map.
    if (view.hasMap) items.push(row('tools', view.toolsShown ? i18n.t('mapControls.hideTools') : i18n.t('mapControls.showTools'), Wrench, actions.toggleTools, { title: i18n.t('mapControls.toolsHint') }));
    items.push(row('spirit-tokens', view.spiritTokensShown ? i18n.t('mapControls.hideSpirit') : i18n.t('mapControls.showSpirit'), Ghost, actions.toggleSpiritTokens, { tone: 'spirit' }));
  }
  return items;
}

/**
 * The rows Map controls' tooltip names, by id; the name is the locale's
 * `mapControls.topics.<id>`, so it follows the app's language. The colours'
 * rows go with theirs.
 */
const TOPIC_IDS = ['fit', 'grid', 'ruler', 'aoe', 'paint', 'tools', 'spirit-tokens'] as const;
type TopicId = (typeof TOPIC_IDS)[number];
const isTopic = (id: string): id is TopicId => (TOPIC_IDS as readonly string[]).includes(id);

/** Map controls' tooltip: what its rows are about, in their order. */
export function mapControlsTitle(items: MenuItem[]): string {
  const topics = items.flatMap((item) => (item.kind === 'command' && isTopic(item.id) ? [i18n.t(`mapControls.topics.${item.id}`)] : []));
  const list = topics.length > 1
    ? i18n.t('mapControls.and', { head: topics.slice(0, -1).join(', '), last: topics[topics.length - 1] })
    : topics.join('');
  return i18n.t('mapControls.title', { list });
}
