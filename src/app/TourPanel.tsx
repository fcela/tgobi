import { useMemo } from "react";
import { useAppStore } from "@/store";
import { PROJECTION_PURSUIT_INDEX_LABELS } from "@/lib/tour-pp/indices";
import type { ProjectionPursuitIndex } from "@/lib/tour-pp/indices";
import { KeyframeGallery } from "@/app/KeyframeGallery";
import { TourScrubber } from "@/app/TourScrubber";
import { TourDiagnostics } from "@/app/TourDiagnostics";
import { HelpPopover } from "@/app/HelpPopover";

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
  const setTourActiveXVars = useAppStore((s) => s.setTourActiveXVars);
  const setTourActiveYVars = useAppStore((s) => s.setTourActiveYVars);
  const toggleTourVarFrozen = useAppStore((s) => s.toggleTourVarFrozen);
  const setManualVarValue = useAppStore((s) => s.setManualVarValue);
  const saveCurrentView = useAppStore((s) => s.saveCurrentView);
  const addKeyframe = useAppStore((s) => s.addKeyframe);
  const clearKeyframes = useAppStore((s) => s.clearKeyframes);
  const addSavedViewAsKeyframe = useAppStore((s) => s.addSavedViewAsKeyframe);
  const setLangevinStep = useAppStore((s) => s.setLangevinStep);
  const setLangevinDiffusion = useAppStore((s) => s.setLangevinDiffusion);
  const setPpClassSource = useAppStore((s) => s.setPpClassSource);

const numericVars = useMemo(
  () => df?.columns.filter((c) => c.type === "numeric" || c.type === "integer").map((c) => c.name) ?? [],
  [df],
);
const catVars = useMemo(
  () => df?.columns.filter((c) => c.type === "categorical").map((c) => c.name) ?? [],
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
    const want = tour.shape === "2d" || tour.shape === "corr" ? "scatter" : "dotplot";
    return panels.find((p) => p.kind === want) ?? null;
  }, [panels, tour.shape]);

  const onStart = () => {
    if (!compatiblePanel) return;
    if (tour.shape === "corr") {
      const xVars = tour.activeXVars.length >= 1
        ? tour.activeXVars
        : numericVars.slice(0, Math.max(1, Math.min(3, numericVars.length)));
      const yVars = tour.activeYVars.length >= 1
        ? tour.activeYVars
        : numericVars.slice(xVars.length, Math.max(xVars.length + 1, Math.min(6, numericVars.length)));
      const allVars = [...xVars, ...yVars];
      if (allVars.length < 2) return;
      startTour(compatiblePanel.id, tour.shape, allVars);
      return;
    }
    const minVars = 2;
    const vars = tour.activeVars.length >= minVars
      ? tour.activeVars
      : numericVars.slice(0, Math.max(minVars, Math.min(6, numericVars.length)));
    startTour(compatiblePanel.id, tour.shape, vars);
  };

const ldaNeedsClass = tour.mode === "pp" && tour.ppIndex === "lda";
const ldaHasClass = tour.ppIndex === "lda"
  ? (tour.ppClassSource === "paint" ? hasPaintedGroups : catVars.includes(tour.ppClassSource))
  : true;
  const startDisabled = !compatiblePanel
    || numericVars.length < 2
    || (tour.shape === "corr" && numericVars.length < 2)
    || (ldaNeedsClass && !ldaHasClass);
  const speedSliderValue = SPEED_FRAME_SUM - tour.speed;

  const toggleVar = (name: string) => {
    const has = tour.activeVars.includes(name);
    setTourActiveVars(has
      ? tour.activeVars.filter((v) => v !== name)
      : [...tour.activeVars, name]);
  };

  const handleAddCurrentAsKeyframe = () => {
    if (!tour.basis) return;
    addKeyframe(tour.basis, "random", undefined);
  };

  return (
    <div className="tour-panel">
      <header>Tour <HelpPopover content={<><p className="help-title">What is a Tour?</p><p>A <b>tour</b> animates through many low-dimensional projections of high-dimensional data, like shining a flashlight from different angles to reveal structure that any single static view would miss.</p><p>Imagine your data lives in a high-dimensional space. A tour smoothly rotates the viewing angle, interpolating between random (or optimized) projection planes using geodesic paths on the Stiefel manifold. This lets you see clusters, outliers, and relationships that are invisible in a single scatterplot.</p><p><b>How to use:</b> Select variables, choose a mode, and press Start. The scatter or dotplot will begin animating. Pause when you see interesting structure, then brush to paint groups.</p><p style={{ color: "var(--text-dim)" }}>Ref: Buja et al. (2005) "Computational Methods for High-Dimensional Rotations"</p></>} /></header>

      <div className="row">
        <span>Shape</span>
        <HelpPopover content={<><p className="help-title">Tour Shape</p><p><b>2D (scatter)</b>: Projects onto a 2D scatter plot — you see both horizontal and vertical axes of the projection. Best for revealing clusters, holes, and 2D structure.</p><p><b>1D (dotplot)</b>: Projects onto a 1D histogram strip — you see a single axis. Simpler but useful for spotting gaps, modes, and skewness along one direction at a time.</p><p><b>Correlation (2x1D)</b>: Projects two independent variable groups — X variables onto the horizontal axis, Y variables onto the vertical axis. Each axis rotates through its own group independently, revealing correlations between the two sets.</p><p><b>When to use each:</b> Start with 2D to get an overview. Switch to 1D to focus on single directions. Use Correlation when you have two groups of variables and want to explore how they relate.</p></>} />
        <select
          aria-label="tour shape"
          value={tour.shape}
      onChange={(e) => setTourShape(e.target.value as "1d" | "2d" | "corr")}
    >
      <option value="2d">2D (scatter)</option>
      <option value="1d">1D (dotplot)</option>
      <option value="corr">Correlation (2x1D)</option>
    </select>
      </div>

      <div className="row">
        <span>Mode</span>
        <HelpPopover content={<><p className="help-title">Tour Modes</p><p><b>Grand tour</b>: Random walk through all possible projections. Good for initial exploration — you never know what you'll find. Like flipping channels.</p><p><b>Projection pursuit</b>: Steers toward projections that maximize an "interestingness" index (see Goal below). Use this when you want the tour to automatically find structure — clusters, gaps, or group separation.</p><p><b>Manual</b>: You control one variable's contribution while the others adjust. Great for answering "what does this variable add?" — drag the slider to see how including or excluding a variable changes the view.</p><p><b>Guided (keyframes)</b>: Interpolates through saved projection keyframes with smooth Catmull-Rom splines. Create a curated slideshow of your best views, then scrub through them.</p><p><b>Langevin</b>: Stochastic tour inspired by physics — adds random perturbations (like Brownian motion) balanced with structure-seeking. Good for discovering structure without committing to a single index.</p></>} />
        <select
          aria-label="tour mode"
          value={tour.mode}
          onChange={(e) => setTourMode(e.target.value as "grand" | "pp" | "manual" | "guided" | "langevin")}
        >
          <option value="grand">Grand</option>
          <option value="pp">Projection pursuit</option>
          <option value="manual">Manual</option>
          <option value="guided">Guided (keyframes)</option>
          <option value="langevin">Langevin</option>
        </select>
      </div>

      {tour.mode === "pp" && (
        <>
          <div className="row">
            <span>Goal</span>
            <HelpPopover content={<><p className="help-title">Projection Pursuit Index</p><p>A numerical measure of how "interesting" a projection is. The tour steers toward projections that maximize this index.</p><div className="help-measures"><span className="mname">Holes</span><span className="mdesc">Seeks projections with a hollow center — good for finding ring-shaped clusters or donut patterns. High score = points are far from the center.</span><span className="mname">Central Mass</span><span className="mdesc">Opposite of holes — seeks a dense center. Good for finding single peaked, unimodal distributions.</span><span className="mname">LDA</span><span className="mdesc">Maximizes between-group separation vs. within-group scatter. Requires at least 2 painted groups. Best for finding views where your labeled groups separate clearly.</span><span className="mname">PCA variance</span><span className="mdesc">Seeks maximum total variance — equivalent to the PCA directions. Good for finding the most "spread out" views.</span><span className="mname">Kurtosis</span><span className="mdesc">Heavy- or light-tailed projections. High kurtosis = points concentrated in center with extreme outliers.</span></div><p><b>Tip:</b> Try LDA after painting groups on a scatterplot. Try Holes for finding clusters you haven't labeled yet.</p><p className="help-warning"><b>Warning — Local optima:</b> Projection pursuit optimizes a numerical index, which can get stuck in local maxima. The "best" view it finds may not be globally optimal. Restart the tour several times from different random starting bases — different runs may reveal different structure. The PP score sparkline plateauing does not guarantee you've found the single best view.</p><p className="help-warning"><b>Warning — Extrapolation:</b> A tour projection is a linear combination of the original variables. The patterns you see (clusters, gaps, outliers) are real in projection space, but do not assume they generalize to the full high-dimensional space. A projection that separates two groups does not mean those groups are separable in all dimensions — just that a particular direction exists. Always corroborate with other projections and methods.</p></>} />
            <select
              aria-label="projection pursuit goal"
              value={tour.ppIndex}
              onChange={(e) => setTourPpIndex(e.target.value as ProjectionPursuitIndex)}
            >
  {PP_INDEXES.map((index) => (
    <option key={index} value={index} disabled={index === "lda" && !hasPaintedGroups && catVars.length === 0}>
      {PROJECTION_PURSUIT_INDEX_LABELS[index]}
    </option>
  ))}
            </select>
          </div>
    {tour.ppIndex === "lda" && (
      <div className="row">
        <span>Class</span>
        <select
          aria-label="LDA class source"
          value={tour.ppClassSource}
          onChange={(e) => setPpClassSource(e.target.value as "paint" | string)}
        >
          <option value="paint" disabled={!hasPaintedGroups}>
            {hasPaintedGroups ? "brushed groups" : "brush to paint 2+ groups"}
          </option>
          {catVars.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
    )}
      <div className="row">
        <span>Score</span>
        <HelpPopover content={<><p className="help-title">PP Score</p><p>Current value of the projection pursuit index. Higher = more "interesting" projection according to the chosen goal.</p><p>The score helps you recognize when the tour has found a good view — watch it climb as the tour converges. When the score plateaus, the tour has likely found a local optimum.</p><p>The sparkline shows the score history — rising = convergence, flat = local optimum reached, dropping = exploring a new direction.</p></>} />
        <small>{tour.ppValue == null ? "-" : tour.ppValue.toFixed(3)}</small>
        {tour.ppScoreTrace.length >= 2 && (
          <svg className="pp-sparkline" viewBox="0 0 100 24" aria-label="PP score trace">
            {(() => {
              const trace = tour.ppScoreTrace;
              const min = Math.min(...trace);
              const max = Math.max(...trace);
              const range = max - min || 1;
              const pts = trace.map((v, i) => {
                const x = (i / (trace.length - 1)) * 100;
                const y = 22 - ((v - min) / range) * 20;
                return `${x},${y}`;
              }).join(" ");
              return <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" />;
            })()}
          </svg>
        )}
      </div>
        </>
      )}

      {tour.mode === "manual" && (
        <>
          <div className="row">
            <span>Variable</span>
            <HelpPopover content={<><p className="help-title">Manual Tour</p><p>Take control of a single variable's contribution to the projection. This answers: "What does this variable add to the view?"</p><p><b>How it works:</b> Select a variable, then drag the Contribution slider. At 0, the variable is effectively removed from the projection — you see what the data looks like without it. At 1, it has full weight. The other variables automatically adjust to keep the projection mathematically valid (orthonormal).</p><p><b>When to use:</b> After finding an interesting view (e.g. via projection pursuit), switch to manual mode to study how individual variables contribute. If removing a variable collapses the structure, that variable is important.</p></>} />
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
                value = ((basis[varIndex] ?? 0) + 1) / 2;
              } else if (tour.shape === "corr") {
                value = ((basis[varIndex * 2] ?? 0) + 1) / 2;
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
              <HelpPopover content={<><p className="help-title">Contribution Slider</p><p>Controls how much the selected variable contributes to the current projection.</p><p><b>0</b> = variable is excluded. <b>1</b> = full contribution. Drag slowly and watch how the scatterplot changes — you'll see which variable drives the structure you observed.</p></>} />
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

      {tour.mode === "guided" && (
        <>
          <div className="row guided-actions">
            <HelpPopover content={<><p className="help-title">Keyframe Tour</p><p>Build a curated tour by adding projection keyframes, then scrub through them with smooth interpolation.</p><p><b>+ Current</b>: Add the current projection as a keyframe.</p><p><b>+ Saved view</b>: Add a previously saved view as a keyframe.</p><p><b>Clear</b>: Remove all keyframes and start over.</p><p>With 2+ keyframes, the scrubber appears below. Drag it to interpolate between views. The tour uses Catmull-Rom splines for smooth, natural transitions.</p></>} />
            <button
              type="button"
              disabled={!tour.basis}
              onClick={handleAddCurrentAsKeyframe}
              aria-label="add current as keyframe"
            >
              + Current
            </button>
            {tour.savedViews.length > 0 && (
              <select
                aria-label="add saved view as keyframe"
                defaultValue=""
                onChange={(e) => {
                  const id = parseInt(e.target.value, 10);
                  if (!isNaN(id)) addSavedViewAsKeyframe(id);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>+ Saved view</option>
                {tour.savedViews.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={tour.keyframes.length === 0}
              onClick={clearKeyframes}
              aria-label="clear all keyframes"
            >
              Clear
            </button>
          </div>
          <KeyframeGallery />
          {tour.keyframes.length >= 2 && <TourScrubber />}
        </>
      )}

      {tour.mode === "langevin" && (
        <>
          <div className="row">
            <span>Step</span>
            <HelpPopover content={<><p className="help-title">Langevin Tour</p><p>A stochastic tour inspired by Langevin dynamics from statistical physics. Instead of following a smooth path, it adds random Gaussian perturbations in the tangent plane of the current projection, then retracts back to the Stiefel manifold via Gram-Schmidt.</p><p>This produces a "drunk walk" through projection space that balances exploration (randomness) with exploitation (tendency to stay near interesting views).</p><p><b>Step</b>: How far the tour moves each frame. Smaller = smoother, more gradual exploration. Larger = bigger jumps, faster coverage.</p><p><b>Diffusion</b>: Temperature/noise magnitude. Higher = more random, wider exploration. Lower = stays near structure, less wandering.</p><p><b>Tip:</b> Start with step=0.05, diffusion=1.0. Increase diffusion if the tour seems stuck; decrease if it's too erratic.</p></>} />
            <input
              type="range" min={0.01} max={0.2} step={0.01}
              value={tour.langevinStep}
              onChange={(e) => setLangevinStep(parseFloat(e.target.value))}
            />
            <small>{tour.langevinStep.toFixed(2)}</small>
          </div>
          <div className="row">
            <span>Diffusion</span>
            <input
              type="range" min={0.1} max={5} step={0.1}
              value={tour.langevinDiffusion}
              onChange={(e) => setLangevinDiffusion(parseFloat(e.target.value))}
            />
            <small>{tour.langevinDiffusion.toFixed(1)}</small>
          </div>
        </>
      )}

  {tour.shape === "corr" ? (
    <>
      <div className="row vars-row">
        <HelpPopover content={<><p className="help-title">Correlation Tour X Variables</p><p>The <b>X variables</b> are projected onto the horizontal axis. The tour independently rotates through linear combinations of these variables, showing different 1D views on the x-axis.</p><p><b>How many?</b> Include at least 1 X variable; 2-5 gives the best interpretability. Too many variables dilute the signal.</p><p><b>Freeze</b>: Click the phase bar to lock a variable's contribution so it stays fixed while the rest rotate.</p></>} />
        <span className="vars-label">X vars</span>
        <div className="vars" aria-label="tour X variables">
          {numericVars.map((n) => {
            const varIndex = tour.activeXVars.indexOf(n);
            const isActive = varIndex >= 0;
            const frozen = tour.frozenVars.includes(n);
            return (
              <div key={n} className={isActive ? "var-row active" : "var-row"}>
                <input
                  type="checkbox"
                  aria-label={`include ${n} in X tour`}
                  checked={isActive}
                  onChange={() => {
                    const has = tour.activeXVars.includes(n);
                    setTourActiveXVars(has
                      ? tour.activeXVars.filter((v) => v !== n)
                      : [...tour.activeXVars, n]);
                  }}
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
      <div className="row vars-row">
        <HelpPopover content={<><p className="help-title">Correlation Tour Y Variables</p><p>The <b>Y variables</b> are projected onto the vertical axis. The tour independently rotates through linear combinations of these variables, showing different 1D views on the y-axis.</p><p>As the X and Y axes rotate independently, you can discover which combinations of X and Y variables produce interesting correlations — clusters, trends, or nonlinear patterns.</p></>} />
        <span className="vars-label">Y vars</span>
        <div className="vars" aria-label="tour Y variables">
          {numericVars.map((n) => {
            const varIndex = tour.activeYVars.indexOf(n);
            const isActive = varIndex >= 0;
            const frozen = tour.frozenVars.includes(n);
            const xHas = tour.activeXVars.includes(n);
            return (
              <div key={n} className={isActive ? "var-row active" : "var-row"}>
                <input
                  type="checkbox"
                  aria-label={`include ${n} in Y tour`}
                  checked={isActive}
                  disabled={xHas}
                  onChange={() => {
                    const has = tour.activeYVars.includes(n);
                    setTourActiveYVars(has
                      ? tour.activeYVars.filter((v) => v !== n)
                      : [...tour.activeYVars, n]);
                  }}
                />
                <span className="name" style={xHas ? { opacity: 0.4 } : undefined}>{n}</span>
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
                        style={{ left: `${tourVariablePhase(tour.basis, tour.shape, tour.activeXVars.length + varIndex) * 100}%` }}
                      />
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  ) : (
    <div className="row vars-row">
      <HelpPopover content={<><p className="help-title">Tour Variables</p><p>Choose which variables participate in the tour. The tour projects from the full p-dimensional space of checked variables down to 1D or 2D.</p><p><b>How many?</b> Include at least 3 for a meaningful tour; 5-10 gives the best balance of structure and interpretability. Too many variables can make the tour noisy.</p><p><b>Phase bar</b>: The small bar next to each active variable shows its current direction and magnitude in the projection. The position indicates the variable's contribution angle; the further from center, the stronger its influence.</p><p><b>Freeze</b>: Click the phase bar to lock a variable's contribution so it stays fixed while the rest of the tour moves. This is useful for holding a known structure in place while exploring around it.</p></>} />
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
  )}

      <div className="row">
        <span>Speed</span>
        <HelpPopover content={<><p className="help-title">Tour Speed</p><p>Controls how quickly the tour moves between projections. The value shown is the interpolation time in seconds.</p><p><b>Slow</b> (left): Gives more time to study each view. Good when you're watching for subtle structure.</p><p><b>Fast</b> (right): Quickly cycles through projections. Good for getting an overview — you'll notice dramatic structure even at speed.</p></>} />
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
            <HelpPopover content={<><p className="help-title">Save View</p><p>Bookmark the current projection so you can return to it later. Saved views appear in the Saved Views list below and can be added as keyframes for guided tours.</p><p><b>Tip:</b> Save views whenever you spot interesting structure — you can always delete them later.</p></>} />
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
    <TourDiagnostics />
    </div>
  );
}

function formatTourDuration(frames: number): string {
  return `${Math.max(1, Math.round(frames / 60))}s`;
}

function tourVariablePhase(basis: Float64Array | null, shape: "1d" | "2d" | "corr", row: number): number {
  if (!basis) return 0.5;
  if (shape === "1d") {
    return clamp01(((basis[row] ?? 0) + 1) / 2);
  }
  if (shape === "corr") {
    return clamp01(((basis[row * 2] ?? 0) + 1) / 2);
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
