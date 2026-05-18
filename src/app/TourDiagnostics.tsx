import { useMemo } from "react";
import { useAppStore } from "@/store";
import { HelpPopover } from "@/app/HelpPopover";

export function TourDiagnostics() {
  const tour = useAppStore((s) => s.tour);
  const df = useAppStore((s) => s.df);
  const shadow = useAppStore((s) => s.selection.shadow);

  const contributions = useMemo(() => {
    if (!tour.basis || tour.activeVars.length === 0) return [];
    if (tour.shape === "corr") {
      const xContribs = tour.activeXVars.map((name, i) => {
        const bx = tour.basis![i * 2] ?? 0;
        return { name, mag: Math.abs(bx), frozen: tour.frozenVars.includes(name), group: "X" as const };
      });
      const yContribs = tour.activeYVars.map((name, i) => {
        const by = tour.basis![(tour.activeXVars.length + i) * 2 + 1] ?? 0;
        return { name, mag: Math.abs(by), frozen: tour.frozenVars.includes(name), group: "Y" as const };
      });
      return [...xContribs, ...yContribs];
    }
    const d = tour.shape === "2d" ? 2 : 1;
    return tour.activeVars.map((name, i) => {
      let mag: number;
      if (d === 1) {
        mag = Math.abs(tour.basis![i] ?? 0);
      } else {
        const x = tour.basis![i * 2] ?? 0;
        const y = tour.basis![i * 2 + 1] ?? 0;
        mag = Math.sqrt(x * x + y * y);
      }
      return { name, mag, frozen: tour.frozenVars.includes(name), group: undefined as string | undefined };
    });
  }, [tour.basis, tour.activeVars, tour.activeXVars, tour.activeYVars, tour.shape, tour.frozenVars]);

  const coverage = useMemo(() => {
    if (tour.ppScoreTrace.length < 2) return null;
    const trace = tour.ppScoreTrace;
    const min = Math.min(...trace);
    const max = Math.max(...trace);
    const range = max - min;
    const mean = trace.reduce((a, b) => a + b, 0) / trace.length;
    const variance = trace.reduce((a, b) => a + (b - mean) ** 2, 0) / trace.length;
    const sd = Math.sqrt(variance);
    return { min, max, range, mean, sd, samples: trace.length };
  }, [tour.ppScoreTrace]);

  const completeRows = useMemo(() => {
    if (!df) return 0;
    let count = 0;
    for (let i = 0; i < df.nrow; i++) {
      if (!(shadow[i >> 3]! & (1 << (i & 7)))) count++;
    }
    return count;
  }, [df, shadow]);

  if (!tour.basis && tour.activePanelId == null) return null;

  const maxMag = contributions.length > 0
    ? Math.max(...contributions.map((c) => c.mag), 0.001)
    : 1;

  return (
    <div className="tour-diagnostics">
      <header>
        Diagnostics
        <HelpPopover content={<>
          <p className="help-title">Tour Diagnostics</p>
          <p>Shows the internal state of the running tour: which variables contribute to the current projection, their magnitudes, and projection pursuit score statistics.</p>
          <p><b>Contribution bars</b>: The length of each bar shows how much that variable influences the current view. Longer = more important. A frozen variable has its contribution locked in place.</p>
          <p><b>PP Score stats</b>: Only shown during projection pursuit. Min/max/mean/SD of the recent score history help you judge whether the tour is still improving or has plateaued.</p>
          <p><b>Tip:</b> If one variable dominates, consider freezing it to see what the others contribute.</p>
        </>} />
      </header>

  {contributions.length > 0 && (
    <div className="diag-contributions">
      {contributions.map((c) => (
        <div key={c.name} className={`diag-row${c.frozen ? " frozen" : ""}`}>
          <span className="diag-name" title={c.frozen ? `${c.name} (frozen)` : c.name}>
            {"group" in c && c.group ? `${c.group}: ` : ""}{c.name}
          </span>
          <div className="diag-bar-track">
            <div
              className={`diag-bar${c.frozen ? " frozen" : ""}`}
              style={{ width: `${(c.mag / maxMag) * 100}%` }}
            />
          </div>
          <span className="diag-val">{c.mag.toFixed(2)}</span>
        </div>
      ))}
    </div>
  )}

      {tour.mode === "pp" && coverage && (
        <div className="diag-pp-stats">
          <div className="diag-row">
            <span className="diag-label">PP min</span>
            <span className="diag-val">{coverage.min.toFixed(4)}</span>
          </div>
          <div className="diag-row">
            <span className="diag-label">PP max</span>
            <span className="diag-val">{coverage.max.toFixed(4)}</span>
          </div>
          <div className="diag-row">
            <span className="diag-label">PP mean</span>
            <span className="diag-val">{coverage.mean.toFixed(4)}</span>
          </div>
          <div className="diag-row">
            <span className="diag-label">PP SD</span>
            <span className="diag-val">{coverage.sd.toFixed(4)}</span>
          </div>
          <div className="diag-row">
            <span className="diag-label">Samples</span>
            <span className="diag-val">{coverage.samples}</span>
          </div>
        </div>
      )}

      <div className="diag-info">
        <div className="diag-row">
          <span className="diag-label">Rows</span>
          <span className="diag-val">{completeRows}</span>
        </div>
        <div className="diag-row">
          <span className="diag-label">Vars</span>
          <span className="diag-val">{tour.activeVars.length}</span>
        </div>
        {tour.frozenVars.length > 0 && (
          <div className="diag-row">
            <span className="diag-label">Frozen</span>
            <span className="diag-val">{tour.frozenVars.join(", ")}</span>
          </div>
        )}
        {tour.mode === "guided" && tour.keyframes.length > 0 && (
          <div className="diag-row">
            <span className="diag-label">Keyframes</span>
            <span className="diag-val">{tour.keyframes.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}
