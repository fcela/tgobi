import { useAppStore } from "@/store";
import type { SweepResult } from "@/lib/mapper/sweep";
import { HelpPopover } from "@/app/HelpPopover";

export function MapperSweepDiagnostics() {
  const sweepResults = useAppStore((s) => s.mapper.sweepResults);
  const sweepRunning = useAppStore((s) => s.mapper.sweepRunning);
  const runMapperSweep = useAppStore((s) => s.runMapperSweep);
  const clearMapperSweep = useAppStore((s) => s.clearMapperSweep);
  const df = useAppStore((s) => s.df);

  if (!df) return null;

  return (
    <div className="mapper-sweep-panel">
      <header>
        Parameter Sweep <HelpPopover content={<><p className="help-title">Mapper Parameter Sweep</p><p>Computes Mapper graphs across a grid of interval and overlap settings to assess <b>graph stability</b> — how much the topology changes as parameters vary.</p><p><b>What to look for:</b> Stable features (loops, branches) that persist across many parameter settings are more likely to reflect real structure in your data, not artifacts of a particular parameter choice.</p><p><b>Metrics shown:</b></p><div className="help-measures"><span className="mname">nodes</span><span className="mdesc">Number of nodes in the graph. Sensitive to intervals and cluster count.</span><span className="mname">edges</span><span className="mdesc">Number of edges. Increases with overlap (more shared points).</span><span className="mname">components</span><span className="mdesc">Connected components. Fewer components = more connected graph. Increasing overlap reduces components.</span><span className="mname">avg degree</span><span className="mdesc">Average number of connections per node. Higher = denser, more interconnected graph.</span><span className="mname">modularity</span><span className="mdesc">Newman-Girvan modularity (0 to 1). High values indicate strong community structure — the graph naturally separates into distinct groups.</span></div><p className="help-warning">Parameter sweep is computationally expensive — it runs Mapper 25 times (5 intervals x 5 overlap values). Large datasets may take a while.</p></>} />
      </header>

      <div className="row">
        <button disabled={sweepRunning || !df} onClick={runMapperSweep}>
          {sweepRunning ? <span className="spinner" /> : "Run Sweep"}
        </button>
        {sweepResults && <button onClick={clearMapperSweep}>Clear</button>}
      </div>

      {sweepResults && <SweepHeatmap results={sweepResults} />}
    </div>
  );
}

function SweepHeatmap({ results }: { results: SweepResult[] }) {
  const intervals = [...new Set(results.map((r) => r.intervals))].sort((a, b) => a - b);
  const overlaps = [...new Set(results.map((r) => r.overlap))].sort((a, b) => a - b);

  const metrics: { key: keyof SweepResult; label: string; format: (v: number) => string }[] = [
    { key: "nNodes", label: "Nodes", format: (v) => v.toFixed(0) },
    { key: "nEdges", label: "Edges", format: (v) => v.toFixed(0) },
    { key: "nComponents", label: "Components", format: (v) => v.toFixed(0) },
    { key: "avgDegree", label: "Avg Degree", format: (v) => v.toFixed(1) },
    { key: "modularity", label: "Modularity", format: (v) => v.toFixed(3) },
  ];

  return (
    <div className="sweep-results">
      {metrics.map((metric) => {
        const values = results.map((r) => r[metric.key] as number);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal || 1;

        return (
          <div key={metric.key} className="sweep-metric">
            <small className="sweep-metric-label">{metric.label}</small>
            <table className="sweep-heatmap-table">
              <thead>
                <tr>
                  <th></th>
                  {overlaps.map((o) => (
                    <th key={o}>{o.toFixed(1)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {intervals.map((nInt) => (
                  <tr key={nInt}>
                    <td className="sweep-row-label">{nInt}</td>
                    {overlaps.map((o) => {
                      const r = results.find(
                        (r) => r.intervals === nInt && r.overlap === o,
                      );
                      const val = r ? (r[metric.key] as number) : 0;
                      const t = (val - minVal) / range;
                      const bg = heatColor(t);
                      return (
                        <td
                          key={o}
                          style={{ background: bg, color: t > 0.5 ? "#fff" : "#222" }}
                          title={`${metric.label}: ${metric.format(val)} (int=${nInt}, overlap=${o})`}
                        >
                          {metric.format(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="sweep-axis-labels">
        <small>rows = intervals, cols = overlap</small>
      </div>
    </div>
  );
}

function heatColor(t: number): string {
  const r = Math.round(30 + t * 200);
  const g = Math.round(30 + (1 - Math.abs(t - 0.5) * 2) * 80);
  const b = Math.round(200 - t * 180);
  return `rgb(${r},${g},${b})`;
}
