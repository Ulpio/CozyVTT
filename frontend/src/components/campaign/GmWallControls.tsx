/**
 * GmWallControls
 * GM-only wall segment drawing tool controls panel.
 * Supports wall type selection, snap-to-grid, delete mode,
 * custom wall color, split mode, erase brush, brush paint tool,
 * and inline type picker for selected segments.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { WallType } from '@/types/walls';
import { useTranslation } from 'react-i18next';
import { wallStrokeColor } from './map/layers/drawWalls';

export type WallToolMode = 'wall-draw' | 'wall-select' | 'wall-split' | 'wall-erase' | 'wall-polygon' | 'wall-brush' | null;

export const WALL_PRESET_COLORS = [
  { labelKey: 'gmWalls.colors.orange', value: '#f97316' },
  { labelKey: 'gmWalls.colors.white', value: '#ffffff' },
  { labelKey: 'gmWalls.colors.yellow', value: '#facc15' },
  { labelKey: 'gmWalls.colors.cyan', value: '#22d3ee' },
  { labelKey: 'gmWalls.colors.red', value: '#ef4444' },
  { labelKey: 'gmWalls.colors.green', value: '#4ade80' },
] as const;

export interface GmWallControlsProps {
  wallMode: WallToolMode;
  onWallModeChange: (mode: WallToolMode) => void;
  onCollapse?: () => void;
  wallType: WallType;
  onWallTypeChange: (type: WallType) => void;
  snapToGrid: boolean;
  onSnapToGridChange: (snap: boolean) => void;
  snapToEndpoint: boolean;
  onSnapToEndpointChange: (snap: boolean) => void;
  wallCount: number;
  onClearAll: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  wallColor: string;
  onWallColorChange: (color: string) => void;
  selectedSegmentType?: WallType | null;
  onSelectedTypeChange?: (type: WallType) => void;
  /** How many walls the Select tool holds, of whatever types. */
  selectedCount?: number;
  onDeleteSelected?: () => void;
  /** A click or a box adds to the selection, as Shift does. */
  addToSelection?: boolean;
  onAddToSelectionChange?: (on: boolean) => void;
  /** A line is being drawn: Done ends it, as a double-click or Esc does. */
  lineInProgress?: boolean;
  onFinishLine?: () => void;
  /** Corners placed of a polygon not yet closed. */
  polygonCorners?: number;
  /** Close the polygon, as a double-click does; Cancel drops it, as Esc does. */
  onClosePolygon?: () => void;
  onDropPolygon?: () => void;
  selectedEndpoint?: { x: number; y: number } | null;
  onMergeEndpoint?: () => void;
  brushSize?: number;
  onBrushSizeChange?: (v: number) => void;
}

/** A chip of the selected type: the border and the swatch carry the colour the map draws it in. */
const WALL_CHIP_ON = 'bg-brand/15 text-ink';

const WALL_TYPE_KEYS = {
  'wall':        'gmWalls.types.wall',
  'door-closed': 'gmWalls.types.doorClosed',
  'door-open':   'gmWalls.types.doorOpen',
  'door-locked': 'gmWalls.types.doorLocked',
  'window':      'gmWalls.types.window',
} as const satisfies Record<WallType, string>;

const ALL_WALL_TYPES: WallType[] = ['wall', 'door-closed', 'door-open', 'door-locked', 'window'];

/** Done, which ends a line or closes a polygon. */
const FINISH_BUTTON = 'touch-target px-2 py-1.5 rounded text-xs font-medium transition-colors border bg-success/25 text-success-ink border-success/50 hover:bg-success/35 disabled:opacity-40 disabled:cursor-not-allowed';

export default function GmWallControls({
  wallMode,
  onWallModeChange,
  wallType,
  onWallTypeChange,
  snapToGrid,
  onSnapToGridChange,
  snapToEndpoint,
  onSnapToEndpointChange,
  wallCount,
  onClearAll,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  wallColor,
  onWallColorChange,
  selectedSegmentType,
  onSelectedTypeChange,
  selectedCount = 0,
  onDeleteSelected,
  addToSelection = false,
  onAddToSelectionChange,
  lineInProgress = false,
  onFinishLine,
  polygonCorners = 0,
  onClosePolygon,
  onDropPolygon,
  selectedEndpoint,
  onMergeEndpoint,
  brushSize = 20,
  onBrushSizeChange,
  onCollapse,
}: GmWallControlsProps) {
  const { t } = useTranslation();
  const tr = t; // `t` is a wall type inside the chip loops
  const [confirmClear, setConfirmClear] = useState(false);
  // Done, and Cancel for a polygon, come in under the mode buttons as the
  // first point is placed. The stack is capped and scrolls on a short
  // screen, which left them out of sight; each time they appear they are
  // brought into view, and left alone while they stay.
  const finishing = (wallMode === 'wall-draw' && lineInProgress && !!onFinishLine) || (wallMode === 'wall-polygon' && polygonCorners > 0);
  const finishRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (finishing) finishRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [finishing]);
  // Folded away to begin with, like the other map tools: a GM arriving at the
  // table wants to see the map, not three open panels over it.
  const [collapsed, setCollapsed] = useState(true);
  const bodyId = useId();

  const handleClearAll = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setConfirmClear(false);
    onClearAll();
  };

  const toggleMode = (mode: WallToolMode) => {
    onWallModeChange(wallMode === mode ? null : mode);
  };

  return (
    <div className="flex flex-col gap-0 bg-surface/95 rounded-lg border border-moss-green/25 min-w-[200px] overflow-hidden">
      {/* Header with collapse toggle */}
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="w-full flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-moss-green/10 select-none"
        onClick={() => {
          const next = !collapsed;
          setCollapsed(next);
          if (next) onCollapse?.();
        }}
      >
        <span className="text-xs text-brand-ink font-medium uppercase tracking-wide">
          {t('gmWalls.title')}
          {wallCount > 0 && (
            <>{' '}<span className="text-ink-muted normal-case">({wallCount})</span></>
          )}
        </span>
        <span className="text-ink-muted text-xs" aria-hidden="true">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div id={bodyId} className="flex flex-col gap-2 p-2 pt-1">
          {/* Mode buttons: Draw / Select / Split / Erase */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => toggleMode('wall-draw')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-draw'
                  ? 'bg-warning/25 text-warning-ink border-warning/50'
                  : 'bg-surface-light/60 text-ink border-moss-green/30 hover:bg-moss-green/10'
              }`}
              title={t('gmWalls.drawHint')}
              aria-label={t('gmWalls.drawLabel')}
            >
              ✏️ {t('gmWalls.draw')}
            </button>
            <button
              onClick={() => toggleMode('wall-select')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-select'
                  ? 'bg-info/25 text-info-ink border-info/50'
                  : 'bg-surface-light/60 text-ink border-moss-green/30 hover:bg-moss-green/10'
              }`}
              title={t('gmWalls.selectHint')}
              aria-label={t('gmWalls.selectLabel')}
            >
              ↗ {t('gmWalls.select')}
            </button>
            <button
              onClick={() => toggleMode('wall-split')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-split'
                  ? 'bg-warning/25 text-warning-ink border-warning/50'
                  : 'bg-surface-light/60 text-ink border-moss-green/30 hover:bg-moss-green/10'
              }`}
              title={t('gmWalls.splitHint')}
              aria-label={t('gmWalls.splitLabel')}
            >
              ✂ {t('gmWalls.split')}
            </button>
            <button
              onClick={() => toggleMode('wall-erase')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-erase'
                  ? 'bg-danger/25 text-danger-ink border-danger/50'
                  : 'bg-surface-light/60 text-ink border-moss-green/30 hover:bg-moss-green/10'
              }`}
              title={t('gmWalls.eraseHint')}
              aria-label={t('gmWalls.eraseLabel')}
            >
              🗑 {t('gmWalls.erase')}
            </button>
          </div>
          {/* Polygon + Brush mode */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => toggleMode('wall-polygon')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-polygon'
                  ? 'bg-success/25 text-success-ink border-success/50'
                  : 'bg-surface-light/60 text-ink border-moss-green/30 hover:bg-moss-green/10'
              }`}
              title={t('gmWalls.polygonHint')}
              aria-label={t('gmWalls.polygonLabel')}
            >
              ⬡ {t('gmWalls.polygon')}
            </button>
            <button
              onClick={() => toggleMode('wall-brush')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-brush'
                  ? 'bg-success/25 text-success-ink border-success/50'
                  : 'bg-surface-light/60 text-ink border-moss-green/30 hover:bg-moss-green/10'
              }`}
              title={t('gmWalls.brushHint')}
              aria-label={t('gmWalls.brushLabel')}
            >
              🖌 {t('gmWalls.brush')}
            </button>
          </div>

          {/* What a double-click or Esc ends, as buttons: a finger or a pen
              has no Esc, and a double tap is easy to miss. A line's walls
              are sent click by click, so only a polygon has anything to
              cancel. These and the controls below are named by what they
              show, so a voice command finds them; the longer wording is
              the tooltip. */}
          {wallMode === 'wall-draw' && lineInProgress && onFinishLine && (
            <div ref={finishRef}>
              <button
                type="button"
                onClick={onFinishLine}
                className={`w-full ${FINISH_BUTTON}`}
                title={t('gmWalls.finishLineHint')}
              >
                {t('gmWalls.done')}
              </button>
            </div>
          )}
          {wallMode === 'wall-polygon' && polygonCorners > 0 && (
            <div ref={finishRef} className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={onClosePolygon}
                disabled={polygonCorners < 3}
                className={FINISH_BUTTON}
                title={polygonCorners < 3 ? t('gmWalls.closeNeedsThree') : t('gmWalls.closeHint')}
              >
                {t('gmWalls.done')}
              </button>
              <button
                type="button"
                onClick={onDropPolygon}
                className="touch-target px-2 py-1.5 rounded text-xs font-medium transition-colors border bg-surface-light/60 text-ink border-moss-green/30 hover:bg-moss-green/10"
                title={t('gmWalls.dropHint')}
              >
                {t('gmWalls.cancel')}
              </button>
            </div>
          )}

          {/* Brush size slider (brush mode) */}
          {wallMode === 'wall-brush' && onBrushSizeChange && (
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-xs text-ink-muted px-1">
                <span>{t('gmWalls.brushSize')}</span>
                <span>{brushSize}px</span>
              </div>
              <input
                type="range"
                min={8}
                max={60}
                step={2}
                value={brushSize}
                onChange={(e) => onBrushSizeChange(Number(e.target.value))}
                className="w-full accent-success"
                aria-label={t('gmWalls.brushSizeLabel')}
              />
            </div>
          )}

          {/* The selection: its type, when it is all one, and Delete, for
              any selection, as the Delete key. */}
          {wallMode === 'wall-select' && selectedCount > 0 && (
            <div className="flex flex-col gap-1 pt-1 border-t border-info/30">
              {selectedSegmentType != null && (
                <>
                  <span className="text-xs text-info-ink px-1">{t('gmWalls.changeType')}</span>
                  <div className="grid grid-cols-2 gap-1">
                    {ALL_WALL_TYPES.map((t) => (
                      <button
                        key={t}
                        onClick={() => onSelectedTypeChange?.(t)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                          selectedSegmentType === t
                            ? WALL_CHIP_ON
                            : 'bg-surface-light/60 text-ink-muted border-moss-green/30 hover:bg-moss-green/10'
                        }`}
                        aria-label={tr('gmWalls.setType', { type: tr(WALL_TYPE_KEYS[t]) })}
                        style={{ borderColor: wallStrokeColor(t, wallColor) }}
                      >
                        <span data-wall-swatch aria-hidden="true" className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: wallStrokeColor(t, wallColor) }} />
                        {tr(WALL_TYPE_KEYS[t])}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                onClick={onDeleteSelected}
                className="w-full touch-target px-2 py-1 mt-0.5 rounded-sm text-xs font-medium bg-danger/25 text-danger-ink border border-danger/40 hover:bg-danger/35 transition-colors"
                title={selectedCount === 1 ? t('gmWalls.deleteOneHint') : t('gmWalls.deleteManyHint', { count: selectedCount })}
              >
                {selectedCount === 1 ? t('gmWalls.deleteOne') : t('gmWalls.deleteMany', { count: selectedCount })}
              </button>
            </div>
          )}

          {/* Shift's adding to the selection, for a finger or a pen. */}
          {wallMode === 'wall-select' && onAddToSelectionChange && (
            <label className="flex items-center gap-2 px-1 cursor-pointer touch-target" title={t('gmWalls.addToSelectionHint')}>
              <input
                type="checkbox"
                checked={addToSelection}
                onChange={(e) => onAddToSelectionChange(e.target.checked)}
                className="accent-info"
              />
              <span className="text-xs text-ink">{t('gmWalls.addToSelection')}</span>
            </label>
          )}

          {/* Selected endpoint — merge option (wall-select mode, endpoint clicked) */}
          {wallMode === 'wall-select' && selectedEndpoint != null && selectedSegmentType == null && (
            <div className="flex flex-col gap-1 pt-1 border-t border-info/30">
              <span className="text-xs text-info-ink px-1">{t('gmWalls.selectedPoint')}</span>
              <button
                onClick={onMergeEndpoint}
                className="w-full px-2 py-1 rounded-sm text-xs font-medium bg-info/25 text-info-ink border border-info/40 hover:bg-info/35 transition-colors"
                aria-label={t('gmWalls.mergeLabel')}
              >
                {t('gmWalls.mergePoint')}
              </button>
              <span className="text-[10px] text-ink px-1">{t('gmWalls.mergeHelp')}</span>
            </div>
          )}

          {/* Wall type selector (draw, polygon, brush modes) */}
          {(wallMode === 'wall-draw' || wallMode === 'wall-polygon' || wallMode === 'wall-brush') && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted px-1">{t('gmWalls.drawType')}</span>
              <div className="grid grid-cols-2 gap-1">
                {ALL_WALL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => onWallTypeChange(t)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                      wallType === t
                        ? WALL_CHIP_ON
                        : 'bg-surface-light/60 text-ink-muted border-moss-green/30 hover:bg-moss-green/10'
                    }`}
                    aria-label={tr('gmWalls.wallType', { type: tr(WALL_TYPE_KEYS[t]) })}
                    style={{ borderColor: wallStrokeColor(t, wallColor) }}
                  >
                    <span data-wall-swatch aria-hidden="true" className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: wallStrokeColor(t, wallColor) }} />
                    {tr(WALL_TYPE_KEYS[t])}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Undo / Redo buttons */}
          {(onUndo || onRedo) && (
            <div className="flex gap-1">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="flex-1 px-2 py-1 rounded-sm text-xs font-medium bg-surface-light/60 text-ink border border-moss-green/30 hover:bg-moss-green/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('gmWalls.undoHint')}
                aria-label={t('gmWalls.undoLabel')}
              >
                {t('gmWalls.undo')}
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="flex-1 px-2 py-1 rounded-sm text-xs font-medium bg-surface-light/60 text-ink border border-moss-green/30 hover:bg-moss-green/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('gmWalls.redoHint')}
                aria-label={t('gmWalls.redoLabel')}
              >
                {t('gmWalls.redo')}
              </button>
            </div>
          )}

          {/* Wall color picker */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted px-1">{t('gmWalls.wallColor')}</span>
            <div className="flex gap-1 flex-wrap px-1">
              {WALL_PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => onWallColorChange(c.value)}
                  title={t(c.labelKey)}
                  className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.value,
                    borderColor: wallColor === c.value ? '#fff' : 'transparent',
                  }}
                  aria-label={t('gmWalls.wallColorLabel', { color: t(c.labelKey) })}
                />
              ))}
              <input
                type="color"
                value={wallColor}
                onChange={(e) => onWallColorChange(e.target.value)}
                className="w-5 h-5 rounded-sm cursor-pointer border-0 bg-transparent p-0"
                title={t('gmWalls.customColor')}
                aria-label={t('gmWalls.customColorLabel')}
              />
            </div>
          </div>

          {/* Snap to grid */}
          <label className="flex items-center gap-2 px-1 cursor-pointer">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => {
                onSnapToGridChange(e.target.checked);
                if (e.target.checked) onSnapToEndpointChange(false);
              }}
              className="accent-brand"
              aria-label={t('gmWalls.snapGridLabel')}
            />
            <span className="text-xs text-ink">{t('gmWalls.snapGrid')}</span>
          </label>

          {/* Snap to nearest endpoint — only available when grid snap is off */}
          <label className={`flex items-center gap-2 px-1 ${snapToGrid ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={snapToEndpoint}
              disabled={snapToGrid}
              onChange={(e) => onSnapToEndpointChange(e.target.checked)}
              className="accent-brand"
              aria-label={t('gmWalls.snapEndpointLabel')}
            />
            <span className="text-xs text-ink">{t('gmWalls.snapEndpoint')}</span>
          </label>

          {/* Clear all */}
          {wallCount > 0 && (
            <div className="pt-1 border-t border-moss-green/20">
              <button
                onClick={handleClearAll}
                className={`w-full px-2 py-1 rounded text-xs font-medium transition-colors ${
                  confirmClear
                    ? 'bg-danger-fill text-white animate-pulse'
                    : 'bg-surface-light/60 text-ink border border-moss-green/30 hover:bg-danger/20 hover:text-danger-ink'
                }`}
                title={confirmClear ? t('gmWalls.clearConfirmHint') : t('gmWalls.clearHint')}
                aria-label={t('gmWalls.clearLabel')}
                onBlur={() => setConfirmClear(false)}
              >
                {confirmClear ? t('gmWalls.clearConfirm') : t('gmWalls.clearAll', { count: wallCount })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
