import { useMemo } from "react";
import { useAppStore } from "@/store";
import { PROJECTION_PURSUIT_INDEX_LABELS } from "@/lib/tour-pp/indices";
import type { ProjectionPursuitIndex } from "@/lib/tour-pp/indices";

const PP_INDEXES: ProjectionPursuitIndex[] = ["holes", "centralMass", "lda", "pca", "kurtosis"];
const MIN_SPEED_FRAMES = 300;
const MAX_SPEED_FRAMES = 2400;
const SPEED_FRAME_SUM = MIN_SPEED_FRAMES + MAX_SPEED_FRAMES;

export function TourPanel() {
  const df = useAppStore((s) => s.df);
  const panels = useAppStore((s) => s.plots.panels);
  const tour = useAppStore((s) => s.tour);
  const paint = useAppStore((s) => s.selection.paint);
  const startTour = useAppStore((s) => s.startTour);
  const pauseTour = useAppStore((s) => s.pauseTour);
  const resumeTour = useAppStore((s) => s.resumeTour);
  const stopTour = useAppStore((s) => s.stopTour);
  const setTourSpeed = useAppStore((s) => s.setTourSpeed);
  const setTourShape = useAppStore((s) => s.setTourShape);
  const setTourMode = useAppStore((s) => s.setTourMode);
  const setTourPpIndex = useAppStore((s) => s.setTourPpIndex);
  const setTourActiveVars = useAppStore((s) => s.setTourActiveVars);
  const toggleTourVarFrozen = useAppStore((s) => s.toggleTourVarFrozen);
  const setManualVarValue = useAppStore((s) => s.setManualVarValue);
  const saveCurrentView = useAppStore((s) => s.saveCurrentView);

  const numericVars = useMemo(
    () => df?.columns.filter((c) => c.type === "numeric" || c.type === "integer").map((c) => c.name) ?? [],
    [df],
  );
  const hasPaintedGroups = useMemo(() => {
    const seen = new Set<number>();
    for (let i = 0; i < paint.length; i++) {
      const v = paint[i]!;
      if (v > 0) seen.add(v);
      if (seen.size >= 2) return true;
    }
    return false;
  }, [paint]);

  const compatiblePanel = useMemo(() => {
    const want = tour.shape === "2d" ? "scatter" : "dotplot";
    return panels.find((p) => p.kind === want) ?? null;
  }, [panels, tour.shape]);

  const onStart = () => {
    if (!compatiblePanel) return;
    const minVars = tour.shape === "2d" ? 2 : 1;
    const vars = tour.activeVars.length >= minVars
      ? tour.activeVars
      : numericVars.slice(0, Math.max(minVars, Math.min(6, numericVars.length)));
    startTour(compatiblePanel.id, tour.shape, vars);
  };

  const ldaNeedsPaint = tour.mode === "pp" && tour.ppIndex === "lda";
  const startDisabled = !compatiblePanel
    || numericVars.length < (tour.shape === "2d" ? 2 : 1)
    || (ldaNeedsPaint && !hasPaintedGroups);
  const speedSliderValue = SPEED_FRAME_SUM - tour.speed;

  const toggleVar = (name: string) => {
    const has = tour.activeVars.includes(name);
    setTourActiveVars(has
      ? tour.activeVars.filter((v) => v !== name)
      : [...tour.activeVars, name]);
  };

  return (
    <div className="tour-panel">
      <header>Tour</header>

      <div className="row">
        <span>Shape</span>
        <select
          aria-label="tour shape"
        value={tour.shape}
        onChange={(e) => setTourShape(e.target.value as "1d" | "2d")}
        >
        <option value="2d">2D (scatter)</option>
        <option value="1d">1D (dotplot)</option>
        </select>
      </div>

      <div className="row">
        <span>Mode</span>
        <select
          aria-label="tour mode"
          value={tour.mode}
          onChange={(e) => setTourMode(e.target.value as "grand" | "pp" | "manual")}
        >
        <option value="grand">Grand</option>
        <option value="pp">Projection pursuit</option>
        <option value="manual">Manual</option>
        </select>
      </div>

      {tour.mode === "pp" && (
        <>
          <div className="row">
            <span>Goal</span>
            <select
              aria-label="projection pursuit goal"
              value={tour.ppIndex}
              onChange={(e) => setTourPpIndex(e.target.value as ProjectionPursuitIndex)}
            >
          {PP_INDEXES.map((index) => (
            <option key={index} value={index} disabled={index === "lda" && !hasPaintedGroups}>
              {PROJECTION_PURSUIT_INDEX_LABELS[index]}
            </option>
          ))}
        </select>
      </div>
      {tour.ppIndex === "lda" && (
        <div className="row">
          <span>Class</span>
          {hasPaintedGroups ? (
            <small>using painted groups</small>
          ) : (
            <small>brush to paint 2+ groups</small>
          )}
        </div>
      )}
          <div className="row">
            <span>Score</span>
            <small>{tour.ppValue == null ? "-" : tour.ppValue.toFixed(3)}</small>
          </div>
  </>
)}

{tour.mode === "manual" && (
  <>
    <div className="row">
      <span>Variable</span>
      <select
        aria-label="manual tour variable"
        value={tour.manualVar ?? ""}
        onChange={(e) => {
          const name = e.target.value;
          if (!name) return;
          const varIndex = tour.activeVars.indexOf(name);
          const basis = tour.basis;
          let value = 0.5;
          if (basis && varIndex >= 0) {
            if (tour.shape === "1d") {
              value = (basis[varIndex] ?? 0 + 1) / 2;
            } else {
              const x = basis[varIndex * 2] ?? 0;
              const y = basis[varIndex * 2 + 1] ?? 0;
              value = Math.sqrt(x * x + y * y);
            }
          }
          setManualVarValue(name, value);
        }}
      >
        <option value="">(select)</option>
        {tour.activeVars.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
    {tour.manualVar && (
      <div className="row">
        <span>Contribution</span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={tour.manualValue}
          aria-label="manual variable contribution"
          onChange={(e) => setManualVarValue(tour.manualVar!, parseFloat(e.target.value))}
        />
        <small>{tour.manualValue.toFixed(2)}</small>
      </div>
    )}
  </>
)}

<div className="row vars-row">
        <div className="vars" aria-label="tour variables">
          {numericVars.length === 0 && <span style={{ color: "var(--text-dim)" }}>none</span>}
          {numericVars.map((n) => {
            const varIndex = tour.activeVars.indexOf(n);
            const isActive = varIndex >= 0;
            const frozen = tour.frozenVars.includes(n);
            return (
              <div key={n} className={isActive ? "var-row active" : "var-row"}>
                <input
                  type="checkbox"
                  aria-label={`include ${n} in tour`}
                  checked={isActive}
                  onChange={() => toggleVar(n)}
                />
                <span className="name">{n}</span>
                {isActive && (
                  <button
                    type="button"
                    className={frozen ? "tour-phase frozen" : "tour-phase"}
                    aria-label={`${frozen ? "release" : "freeze"} ${n}`}
                    title={frozen ? "release variable" : "freeze variable"}
                    onClick={() => toggleTourVarFrozen(n)}
                  >
                    <span className="tour-phase-track">
                      <span
                        className="tour-phase-thumb"
                        style={{ left: `${tourVariablePhase(tour.basis, tour.shape, varIndex) * 100}%` }}
                      />
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="row">
        <span>Speed</span>
        <input
          type="range" min={MIN_SPEED_FRAMES} max={MAX_SPEED_FRAMES} step={5}
          value={speedSliderValue}
          aria-label="tour speed"
          onChange={(e) => setTourSpeed(SPEED_FRAME_SUM - parseInt(e.target.value, 10))}
        />
        <small>{formatTourDuration(tour.speed)}</small>
      </div>

      <div className="row">
        {tour.activePanelId == null ? (
          <button
            disabled={startDisabled}
            onClick={onStart}
            aria-label="start tour"
          >
            ▶ Start
          </button>
        ) : (
          <>
            <button
              onClick={() => (tour.isPlaying ? pauseTour() : resumeTour())}
              aria-label={tour.isPlaying ? "pause tour" : "resume tour"}
            >
              {tour.isPlaying ? "⏸ Pause" : "▶ Resume"}
            </button>
            <button onClick={stopTour} aria-label="stop tour">⏹ Stop</button>
            <button
              onClick={() => {
                const name = window.prompt("Name this view") ?? `view ${tour.savedViews.length + 1}`;
                if (name) saveCurrentView(name);
              }}
              aria-label="save view"
            >
              ★ Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function formatTourDuration(frames: number): string {
  return `${Math.max(1, Math.round(frames / 60))}s`;
}

function tourVariablePhase(basis: Float64Array | null, shape: "1d" | "2d", row: number): number {
  if (!basis) return 0.5;
  if (shape === "1d") {
    return clamp01(((basis[row] ?? 0) + 1) / 2);
  }

  const x = basis[row * 2] ?? 0;
  const y = basis[row * 2 + 1] ?? 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0.5;
  const phase = (Math.atan2(y, x) + Math.PI) / (Math.PI * 2);
  return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}
