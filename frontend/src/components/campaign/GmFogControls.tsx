/**
 * GmFogControls
 * GM-only fog of war controls panel.
 * Carries the per-map switch: with fog on, the GM reveals or hides regions
 * by dragging a box over the map (the selection snaps to whole grid squares)
 * plus bulk reveal/hide actions; with fog off the panel says so and offers
 * nothing that would change what players see.
 */

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export type FogToolMode = 'fog-reveal' | 'fog-hide' | null;

interface GmFogControlsProps {
  fogMode: FogToolMode;
  onFogModeChange: (mode: FogToolMode) => void;
  onRevealAll: () => void;
  onHideAll: () => void;
  /** Whether manual fog applies on this map. */
  fogEnabled: boolean;
  /** The GM ticked or unticked "Fog of war on this map". */
  onFogEnabledChange: (enabled: boolean) => void;
  /**
   * Forget what every player has seen of this map. Absent when the map has
   * no explored memory to forget (lighting off, or the setting off).
   */
  onResetExploration?: () => void;
  /**
   * Called when the panel is folded away, so the tool it holds can be put
   * down with it. Leaving a fog tool armed behind a closed panel means the
   * next drag on the map reveals or hides ground with nothing on screen
   * saying why.
   */
  onCollapse?: () => void;
}

/**
 * A Confirm? state's pulse: a ring round the button, so its label keeps its
 * contrast through the pulse (GmFogControls.test.tsx). Its colour is the fill's.
 */
function ConfirmPulse({ ring }: { ring: 'ring-brand' | 'ring-accent' }) {
  return <span aria-hidden="true" className={`absolute inset-0 rounded ring-2 ${ring} animate-pulse pointer-events-none`} />;
}

export default function GmFogControls({
  fogMode,
  onFogModeChange,
  onRevealAll,
  onHideAll,
  fogEnabled,
  onFogEnabledChange,
  onResetExploration,
  onCollapse,
}: GmFogControlsProps) {
  const [confirmRevealAll, setConfirmRevealAll] = useState(false);
  const [confirmHideAll, setConfirmHideAll] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleResetExploration = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    setConfirmReset(false);
    onResetExploration?.();
  };
  // Folded away to begin with, like the other map tools: a GM arriving at the
  // table wants to see the map, not three open panels over it.
  const [collapsed, setCollapsed] = useState(true);
  const bodyId = useId();

  const handleRevealAll = () => {
    if (!confirmRevealAll) { setConfirmRevealAll(true); return; }
    setConfirmRevealAll(false);
    onRevealAll();
  };

  const handleHideAll = () => {
    if (!confirmHideAll) { setConfirmHideAll(true); return; }
    setConfirmHideAll(false);
    onHideAll();
  };

  return (
    <div className="flex flex-col gap-0 bg-surface/95 rounded-lg border border-moss-green/25 min-w-[160px] overflow-hidden">
      {/* Header with collapse toggle */}
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="touch-target w-full flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-moss-green/10 select-none"
        onClick={() => {
          const next = !collapsed;
          setCollapsed(next);
          if (next) onCollapse?.();
        }}
      >
        <span className="text-xs text-brand-ink font-medium uppercase tracking-wide">Fog of War</span>
        <span className="text-ink-muted text-xs" aria-hidden="true">{collapsed ? '▶' : '▼'}</span>
      </button>
    {!collapsed && (
      <div id={bodyId} className="flex flex-col gap-2 p-2 pt-1">

      {/* The per-map switch. Off puts an armed tool down first: a reveal box
          dragged with fog off would change nothing players can see. */}
      <label className="touch-target flex items-center gap-2 px-1 py-0.5 text-xs text-ink cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-3.5 h-3.5 accent-success"
          checked={fogEnabled}
          onChange={(e) => {
            const next = e.target.checked;
            if (!next) onFogModeChange(null);
            onFogEnabledChange(next);
          }}
          aria-label="Fog of war on this map"
        />
        Fog of war on this map
      </label>

      {!fogEnabled && (
        <p className="px-1 text-[11px] leading-snug text-ink-muted">
          Fog is off. Players see the whole map (dynamic lighting still applies).
          What you had revealed is kept for when you turn it back on.
        </p>
      )}

      {fogEnabled && (<>
      {/* Mode toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-reveal' ? null : 'fog-reveal')}
          className={`touch-target flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-reveal'
              ? 'bg-success/25 text-success-ink border border-success/50'
              : 'bg-surface-light/60 text-ink border border-moss-green/30 hover:bg-moss-green/10'
          }`}
          title="Reveal — drag a box over the map to reveal it to players"
          aria-label="Fog reveal box"
        >
          <Eye className="w-3.5 h-3.5" />
          Reveal
        </button>
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-hide' ? null : 'fog-hide')}
          className={`touch-target flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-hide'
              ? 'bg-accent text-accent-text'
              : 'bg-surface-light/60 text-ink border border-moss-green/30 hover:bg-moss-green/10'
          }`}
          title="Hide — drag a box over the map to hide it from players"
          aria-label="Fog hide box"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Hide
        </button>
      </div>

      {/* How-to hint — only while a mode is armed */}
      {fogMode && (
        <p className="px-1 text-[11px] leading-snug text-ink-muted">
          Drag a box over the map. The selection snaps to whole squares —
          click a single square to {fogMode === 'fog-reveal' ? 'reveal' : 'hide'} just that one.
          <span className="block mt-0.5 text-ink-muted">Esc or right-drag cancels.</span>
        </p>
      )}

      {/* Bulk actions */}
      <div className="flex gap-1 pt-1 border-t border-moss-green/20">
        {/* Each Confirm? state takes dark text on its light fill, readable
            in every theme, and pulses a ring round it, never its label. */}
        <button
          onClick={handleRevealAll}
          className={`touch-target relative flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            confirmRevealAll
              ? 'bg-brand text-brand-text'
              : 'bg-surface-light/60 text-ink border border-moss-green/30 hover:bg-success/20 hover:text-success-ink'
          }`}
          title={confirmRevealAll ? 'Click again to confirm: reveal entire map' : 'Reveal all — show entire map to players'}
          aria-label="Reveal entire map"
          onBlur={() => setConfirmRevealAll(false)}
        >
          {confirmRevealAll && <ConfirmPulse ring="ring-brand" />}
          {confirmRevealAll ? 'Confirm?' : 'Reveal all'}
        </button>
        <button
          onClick={handleHideAll}
          className={`touch-target relative flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            confirmHideAll
              ? 'bg-accent text-accent-text'
              : 'bg-surface-light/60 text-ink border border-moss-green/30 hover:bg-accent/20 hover:text-accent-ink'
          }`}
          title={confirmHideAll ? 'Click again to confirm: hide entire map' : 'Hide all — cover entire map with fog'}
          aria-label="Hide entire map"
          onBlur={() => setConfirmHideAll(false)}
        >
          {confirmHideAll && <ConfirmPulse ring="ring-accent" />}
          {confirmHideAll ? 'Confirm?' : 'Hide all'}
        </button>
      </div>
      </>)}

      {/* Explored memory is separate from fog: it is what players' own
          vision has uncovered on a lit map, and only the GM can forget it. */}
      {onResetExploration && (
        <div className="pt-1 border-t border-moss-green/20">
          <button
            onClick={handleResetExploration}
            className={`touch-target relative w-full px-2 py-1 rounded text-xs font-medium transition-colors ${
              confirmReset
                ? 'bg-accent text-accent-text'
                : 'bg-surface-light/60 text-ink border border-moss-green/30 hover:bg-accent/20 hover:text-accent-ink'
            }`}
            title={confirmReset ? 'Click again to confirm: forget what every player has seen' : 'Reset explored areas: players forget what they have seen of this map'}
            aria-label="Reset explored areas"
            onBlur={() => setConfirmReset(false)}
          >
            {confirmReset && <ConfirmPulse ring="ring-accent" />}
            {confirmReset ? 'Confirm?' : 'Reset explored areas'}
          </button>
          <p className="px-1 mt-1 text-[10px] leading-snug text-ink-muted">
            Forgets what every player has seen of this map. Their view now is unchanged.
          </p>
        </div>
      )}
    </div>
    )}
    </div>
  );
}
