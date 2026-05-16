import { useMemo } from "react";
import { useAppStore } from "@/store";
import { HelpPopover } from "@/app/HelpPopover";

export function ProjectionDiagnostics() {
  const quality = useAppStore((s) => s.projection.quality);

  if (!quality) return null;

  const tw = quality.trustworthiness;
  const ct = quality.continuity;

  return (
    <div className="projection-diagnostics">
      <header>
        Quality
        <HelpPopover content={<>
          <p className="help-title">DR Quality Metrics</p>
          <p>Quantitative measures of how well the low-dimensional embedding preserves structure from the original high-dimensional space.</p>
          <p><b>Trustworthiness</b> (Venna &amp; Kaski, 2006): Measures whether points that appear nearby in the embedding were actually nearby in the original space. High means the embedding is not creating false neighborhoods. Low means there are "intrusions" — points that look close in 2D but are actually far apart in the original data.</p>
          <p><b>Continuity</b> (Venna &amp; Kaski, 2006): Measures whether points that were nearby in the original space remain nearby in the embedding. High means the embedding is not tearing apart true neighborhoods. Low means there are "extrusions" — originally close points that have been pushed apart.</p>
          <p><b>Shepard diagram</b>: Scatterplot of original distances (x-axis) vs. embedding distances (y-axis). If the embedding perfectly preserved all distances, all points would lie on the diagonal. Spread above the diagonal = distances stretched; below = distances compressed. t-SNE and UMAP typically show a step-function shape (local distances preserved, global distances compressed).</p>
          <p className="help-warning"><b>Warning:</b> These are global summary measures. A high trustworthiness/continuity does not guarantee every region is faithfully represented. Always combine with visual inspection.</p>
        </>} />
      </header>

      <div className="diag-section">
        <div className="diag-row">
          <span className="diag-label">Trustworthiness</span>
          <span className={`diag-val ${tw > 0.8 ? "good" : tw > 0.5 ? "ok" : "bad"}`}>
            {tw.toFixed(3)}
          </span>
          <span className="diag-hint">
            {tw > 0.9 ? "excellent" : tw > 0.8 ? "good" : tw > 0.5 ? "moderate" : "poor"}
          </span>
        </div>
        <div className="diag-row">
          <span className="diag-label">Continuity</span>
          <span className={`diag-val ${ct > 0.8 ? "good" : ct > 0.5 ? "ok" : "bad"}`}>
            {ct.toFixed(3)}
          </span>
          <span className="diag-hint">
            {ct > 0.9 ? "excellent" : ct > 0.8 ? "good" : ct > 0.5 ? "moderate" : "poor"}
          </span>
        </div>
      </div>

      {quality.shepardOrigDists && quality.shepardEmbDists && (
        <ShepardDiagram
          origDists={quality.shepardOrigDists}
          embDists={quality.shepardEmbDists}
        />
      )}
    </div>
  );
}

function ShepardDiagram({ origDists, embDists }: {
  origDists: Float64Array;
  embDists: Float64Array;
}) {
  const data = useMemo(() => {
    const n = origDists.length;
    if (n === 0) return null;
    let maxOrig = 0;
    let maxEmb = 0;
    for (let i = 0; i < n; i++) {
      const o = origDists[i]!;
      const e = embDists[i]!;
      if (o > maxOrig) maxOrig = o;
      if (e > maxEmb) maxEmb = e;
    }
    maxOrig = Math.max(maxOrig, 1e-10);
    maxEmb = Math.max(maxEmb, 1e-10);
    return { n, maxOrig, maxEmb };
  }, [origDists, embDists]);

  if (!data || data.n === 0) return null;

  const W = 260;
  const H = 160;
  const pad = 14;

  const xMax = data.maxOrig;
  const yMax = data.maxEmb;
  const rangeMax = Math.max(xMax, yMax);

  return (
    <div className="diag-section">
      <div className="diag-row">
        <span className="diag-label">Shepard diagram</span>
      </div>
      <svg className="diag-svg shepard-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <line
          x1={pad} y1={H - pad}
          x2={W - pad} y2={pad}
          stroke="var(--text-dim)"
          strokeWidth={0.5}
          strokeDasharray="4,3"
        />
        <line
          x1={pad} y1={H - pad}
          x2={pad} y2={pad}
          stroke="var(--border)"
          strokeWidth={0.5}
        />
        <line
          x1={pad} y1={H - pad}
          x2={W - pad} y2={H - pad}
          stroke="var(--border)"
          strokeWidth={0.5}
        />
        {(() => {
          const points: string[] = [];
          const step = Math.max(1, Math.floor(origDists.length / 300));
          for (let i = 0; i < origDists.length; i += step) {
            const ox = pad + (origDists[i]! / rangeMax) * (W - 2 * pad);
            const ey = (H - pad) - (embDists[i]! / rangeMax) * (H - 2 * pad);
            points.push(`${ox.toFixed(1)},${ey.toFixed(1)}`);
          }
          return (
            <g>
              {points.map((p, i) => (
                <circle key={i} cx={p.split(",")[0]!} cy={p.split(",")[1]!} r={1} fill="var(--accent)" opacity={0.4} />
              ))}
            </g>
          );
        })()}
        <text x={W / 2} y={H - 1} textAnchor="middle" fill="var(--text-dim)" fontSize={8}>original dist</text>
        <text x={3} y={H / 2} textAnchor="middle" fill="var(--text-dim)" fontSize={8} transform={`rotate(-90, 3, ${H / 2})`}>emb dist</text>
      </svg>
      <small className="diag-note">diagonal = perfect preservation</small>
    </div>
  );
}
