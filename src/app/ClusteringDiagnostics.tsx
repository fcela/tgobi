import { useMemo } from "react";
import { useAppStore } from "@/store";
import { HelpPopover } from "@/app/HelpPopover";

export function ClusteringDiagnostics() {
  const clustering = useAppStore((s) => s.clustering);

  const reachData = useMemo(() => {
    if (!clustering.reachability || !clustering.ordering) return null;
    const ordering = clustering.ordering;
    const reach = clustering.reachability;
    const n = ordering.length;
    if (n === 0) return null;
    const maxReach = Math.max(1e-10, ...Array.from(reach).filter((v) => Number.isFinite(v)));
    const points: Array<{ x: number; y: number; inf: boolean }> = [];
    for (let i = 0; i < n; i++) {
      const idx = ordering[i]!;
      const d = reach[idx]!;
      const inf = !Number.isFinite(d);
      points.push({ x: i / (n - 1), y: inf ? 1 : Math.min(d / maxReach, 1), inf });
    }
    return { points, maxReach, n };
  }, [clustering.reachability, clustering.ordering]);

  const kDistData = useMemo(() => {
    if (!clustering.kDistancePlot) return null;
    const arr = clustering.kDistancePlot;
    const n = arr.length;
    if (n === 0) return null;
    const maxDist = arr[n - 1] ?? 1;
    const points: Array<{ x: number; y: number }> = [];
    const step = Math.max(1, Math.floor(n / 200));
    for (let i = 0; i < n; i += step) {
      points.push({ x: i / (n - 1), y: (arr[i] ?? 0) / (maxDist || 1) });
    }
    if (points.length > 0 && points[points.length - 1]!.x < 1) {
      points.push({ x: 1, y: (arr[n - 1] ?? 0) / (maxDist || 1) });
    }
    return { points, maxDist, n };
  }, [clustering.kDistancePlot]);

  if (!clustering.results) return null;

  const hasDiagnostics = clustering.silhouetteMean != null
    || reachData != null
    || kDistData != null;

  if (!hasDiagnostics) return null;

  const W = 260;
  const H = 60;

  return (
    <div className="cluster-diagnostics">
      <header>
        Diagnostics
        <HelpPopover content={<>
          <p className="help-title">Clustering Diagnostics</p>
          <p>Quality measures that help you judge how good the clustering is and whether the parameters are appropriate.</p>
          <p><b>Silhouette</b>: Measures how well each point fits in its assigned cluster vs. the nearest other cluster. Range: -1 to 1. Higher = better separation. Above 0.5 = reasonable; above 0.7 = good; below 0.25 = weak or no structure.</p>
          <p><b>Reachability plot</b> (OPTICS): Shows the density structure of the data. Valleys = dense clusters. Peaks = boundaries between clusters. The ordering reveals hierarchical structure.</p>
          <p><b>k-distance plot</b> (DBSCAN/OPTICS): Sorted distance to the k-th nearest neighbor. A "knee" or "elbow" in this plot suggests a good eps value — points before the knee are core points, after the knee are noise or boundary points.</p>
          <p><b>Warning:</b> Silhouette assumes compact, convex clusters. It can give high scores for poorly-separated density-based clusters. Always visualize.</p>
        </>} />
      </header>

      {clustering.silhouetteMean != null && (
        <div className="diag-section">
          <div className="diag-row">
            <span className="diag-label">Silhouette</span>
            <span className={`diag-val ${clustering.silhouetteMean > 0.5 ? "good" : clustering.silhouetteMean > 0.25 ? "ok" : "bad"}`}>
              {clustering.silhouetteMean.toFixed(3)}
            </span>
            <span className="diag-hint">
              {clustering.silhouetteMean > 0.7 ? "good" : clustering.silhouetteMean > 0.5 ? "reasonable" : clustering.silhouetteMean > 0.25 ? "weak" : "no structure"}
            </span>
          </div>
          {clustering.silhouettePerCluster && clustering.silhouettePerCluster.length > 0 && (
            <div className="sil-cluster-bars">
              {clustering.silhouettePerCluster.map((c) => (
                <div key={c.id} className="diag-row">
                  <span className="diag-name">C{c.id}</span>
                  <div className="diag-bar-track">
                    <div
                      className={`diag-bar ${c.mean > 0.5 ? "good" : c.mean > 0.25 ? "ok" : "bad"}`}
                      style={{ width: `${Math.max(0, (c.mean + 1) / 2) * 100}%` }}
                    />
                  </div>
                  <span className="diag-val">{c.mean.toFixed(2)}</span>
                  <span className="diag-size">({c.size})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {reachData && (
        <div className="diag-section">
          <div className="diag-row">
            <span className="diag-label">Reachability</span>
          </div>
          <svg className="diag-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
            <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth={0.5} />
            {reachData.points.map((p, i) =>
              p.inf ? null : (
                <line
                  key={i}
                  x1={p.x * W}
                  y1={H}
                  x2={p.x * W}
                  y2={H - p.y * (H - 2)}
                  stroke="var(--accent)"
                  strokeWidth={reachData.n > 100 ? 0.5 : 1}
                />
              ),
            )}
          </svg>
          <small className="diag-note">valleys = dense clusters</small>
        </div>
      )}

      {kDistData && (
        <div className="diag-section">
          <div className="diag-row">
            <span className="diag-label">k-Distance</span>
            <span className="diag-val eps-marker">eps={clustering.eps.toFixed(1)}</span>
          </div>
          <svg className="diag-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
            <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth={0.5} />
            {(() => {
              const epsLine = clustering.eps / kDistData.maxDist;
              const epsY = H - Math.min(1, epsLine) * (H - 2);
              return (
                <line x1={0} y1={epsY} x2={W} y2={epsY} stroke="#ffd400" strokeWidth={1} strokeDasharray="3,3" />
              );
            })()}
            <polyline
              points={kDistData.points.map((p) => `${p.x * W},${H - p.y * (H - 2)}`).join(" ")}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1}
            />
          </svg>
          <small className="diag-note">knee = good eps</small>
        </div>
      )}
    </div>
  );
}
