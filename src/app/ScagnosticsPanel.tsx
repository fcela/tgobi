import { useMemo } from "react";
import { useAppStore } from "@/store";
import type { ScagnosticMeasure } from "@/lib/scagnostics";
import { SCAGNOSTIC_MEASURES } from "@/lib/scagnostics";
import { HelpPopover } from "@/app/HelpPopover";

export function ScagnosticsPanel() {
  const df = useAppStore((s) => s.df);
  const scag = useAppStore((s) => s.scagnostics);
  const setVariables = useAppStore((s) => s.setScagnosticsVariables);
  const run = useAppStore((s) => s.runScagnostics);
  const setSortMeasure = useAppStore((s) => s.setScagnosticsSortMeasure);
  const setSortDescending = useAppStore((s) => s.setScagnosticsSortDescending);
  const setFilterMeasure = useAppStore((s) => s.setScagnosticsFilterMeasure);
  const setFilterThreshold = useAppStore((s) => s.setScagnosticsFilterThreshold);
  const clear = useAppStore((s) => s.clearScagnostics);

  const numericVars = useMemo(
    () =>
      df?.columns
        .filter((c) => c.type === "numeric" || c.type === "integer")
        .map((c) => c.name) ?? [],
    [df],
  );

  const toggleVar = (name: string) => {
    const has = scag.variables.includes(name);
    setVariables(
      has ? scag.variables.filter((v) => v !== name) : [...scag.variables, name],
    );
  };

  const canRun = !!df && scag.variables.length >= 2 && !scag.running;

  const sortedResults = useMemo(() => {
    if (!scag.results) return [];
    const measure = scag.sortMeasure;
    const filtered = scag.filterThreshold > 0
      ? scag.results.filter((r) => r.scores[scag.filterMeasure] >= scag.filterThreshold)
      : scag.results;
    return [...filtered].sort((a, b) => {
      const va = a.scores[measure];
      const vb = b.scores[measure];
      return scag.sortDescending ? vb - va : va - vb;
    });
  }, [scag.results, scag.sortMeasure, scag.sortDescending, scag.filterMeasure, scag.filterThreshold]);

  return (
    <div className="scagnostics-panel">
      <header>Scagnostics <HelpPopover content={<><p className="help-title">What are Scagnostics?</p><p>Scatterplot diagnostics — numerical measures that characterize the <b>shape</b> of a 2D scatterplot. Instead of visually inspecting every pair of variables (which is impractical for 10+ variables), scagnostics compute scores for each pair so you can quickly find the interesting ones.</p><p><b>Why it's useful:</b> With 20 variables, there are 190 scatterplots to examine. Scagnostics tells you which pairs show clusters (high clumpy), strong trends (high monotonic), outliers (high outlying), or unusual shapes — so you spend your time on the plots that matter.</p><p><b>How to use:</b> (1) Select variables, (2) click Run, (3) sort by a measure to surface interesting pairs, (4) filter to show only pairs above a threshold. The scatterplot matrix highlights cells above the threshold.</p><p><b>Warning:</b> A scagnostic score is a screening signal, not a conclusion. A high clumpy score means "look at this pair closer" — it doesn't prove clusters exist. Always visualize before interpreting.</p><p className="help-warning"><b>Warning — Correlation ≠ Causation:</b> A high monotonic score means two variables move together — it does <em>not</em> mean one causes the other. Spurious correlations arise from confounders, selection bias, or pure coincidence, especially with many variable pairs. Scagnostics measures shape, not mechanism.</p><p className="help-warning"><b>Warning — Multiple comparisons:</b> Scagnostics scores all p(p-1)/2 variable pairs. With 20 variables, that's 190 tests. Some pairs will score high by chance alone. A threshold of 0.5 on "clumpy" with 190 pairs will flag ~95 pairs even if scores are uniformly distributed. Use the filter to narrow focus, but interpret high scores as "worth investigating" not "significant."</p><p style={{ color: "var(--text-dim)" }}>Ref: Wilkinson et al. (2005) "Graph-Theoretic Scagnostics"</p></>} /></header>

      <div className="row">
        <span>Sort by</span>
        <HelpPopover content={<><p className="help-title">Sort by Measure</p><p>Rank variable pairs by the selected measure. This surfaces the most extreme pairs at the top of the results table.</p><p><b>Practical tips:</b></p><p>Sort by <b>clumpy ↓</b> to find pairs with visible clusters.</p><p>Sort by <b>monotonic ↓</b> to find pairs with strong trends.</p><p>Sort by <b>outlying ↑</b> to find pairs with the fewest outliers (most uniform).</p><p>Sort by <b>skinny ↓</b> to find ribbon-like or functional relationships.</p></>} />
        <select
          aria-label="sort measure"
          value={scag.sortMeasure}
          onChange={(e) => setSortMeasure(e.target.value as ScagnosticMeasure)}
        >
          {SCAGNOSTIC_MEASURES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button
          className="sort-dir"
          aria-label={scag.sortDescending ? "sort descending" : "sort ascending"}
          onClick={() => setSortDescending(!scag.sortDescending)}
          title={scag.sortDescending ? "High → Low" : "Low → High"}
        >
          {scag.sortDescending ? "↓" : "↑"}
        </button>
      </div>

      <div className="row">
        <span>Filter</span>
        <HelpPopover content={<><p className="help-title">Filter by Measure</p><p>Show only pairs where the selected measure is at or above the threshold. This highlights cells in the scatterplot matrix, so you can visually identify the interesting pairs.</p><p><b>Tip:</b> Set filter to "clumpy ≥ 0.5" to highlight only pairs that show clustering tendency. Then look at the highlighted cells in the scatterplot matrix to see what those clusters look like.</p></>} />
        <select
          aria-label="filter measure"
          value={scag.filterMeasure}
          onChange={(e) => setFilterMeasure(e.target.value as ScagnosticMeasure)}
        >
          {SCAGNOSTIC_MEASURES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="row">
        <span>≥</span>
        <HelpPopover content={<><p className="help-title">Filter Threshold</p><p>Minimum score for a pair to be included in the results. Pairs below the threshold are hidden from the table and not highlighted in the scatterplot matrix.</p><p>Drag right to be more selective (fewer pairs). Drag left to be more inclusive.</p></>} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={scag.filterThreshold}
          aria-label="filter threshold"
          onChange={(e) => setFilterThreshold(parseFloat(e.target.value))}
        />
        <span className="threshold-val">{scag.filterThreshold.toFixed(2)}</span>
      </div>

      <div className="row vars-row">
        <HelpPopover content={<><p className="help-title">Scagnostics Variables</p><p>Select which numeric variables to analyze. All pairs among selected variables will be scored.</p><p><b>Tip:</b> Start with 4-8 variables (6-28 pairs). More variables = many more pairs, but the table shows the top 50. The scatterplot matrix highlights are more useful than the table for large variable sets.</p></>} />
        <div className="vars" aria-label="scagnostics variables">
          {numericVars.length === 0 && (
            <span style={{ color: "var(--text-dim)" }}>no numeric variables</span>
          )}
          {numericVars.map((n) => {
            const isActive = scag.variables.includes(n);
            return (
              <div key={n} className={isActive ? "var-row active" : "var-row"}>
                <input
                  type="checkbox"
                  aria-label={`include ${n} in scagnostics`}
                  checked={isActive}
                  onChange={() => toggleVar(n)}
                />
                <span className="name">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {scag.error && <div className="row error">{scag.error}</div>}

      {sortedResults.length > 0 && (
        <div className="row results-row">
          <HelpPopover content={<><p className="help-title">Scagnostics Results Table</p><p>Each row is a variable pair, scored on all 9 measures. The bar width shows the score magnitude (0-1).</p><div className="help-measures"><span className="mname">outlying</span><span className="mdesc">Points far from the bulk. High = extreme outliers present.</span><span className="mname">skew</span><span className="mdesc">Asymmetry. High = heavy tail on one side.</span><span className="mname">clumpy</span><span className="mdesc">Clustering tendency. High = visible point clusters.</span><span className="mname">sparse</span><span className="mdesc">How spread out. High = large gaps.</span><span className="mname">striated</span><span className="mdesc">Parallel lines/curves. High = grid-like patterns.</span><span className="mname">convex</span><span className="mdesc">Shape convexity. Low = concave (crescent, C-shape).</span><span className="mname">skinny</span><span className="mdesc">Elongation. High = thin/ribbon-like cloud.</span><span className="mname">stringy</span><span className="mdesc">Thin curve. High = functional relationship.</span><span className="mname">monotonic</span><span className="mdesc">Monotonic trend. High = strong increasing/decreasing.</span></div></>} />
          <div className="scag-results">
            <table>
              <thead>
                <tr>
                  <th>Pair</th>
                  {SCAGNOSTIC_MEASURES.map((m) => (
                    <th key={m}>{m.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.slice(0, 50).map((r, idx) => (
                  <tr key={`${r.xVar}-${r.yVar}-${idx}`}>
                    <td className="pair-name">{r.xVar} / {r.yVar}</td>
                    {SCAGNOSTIC_MEASURES.map((m) => {
                      const v = r.scores[m];
                      return (
                        <td key={m}>
                          <span
                            className="scag-bar-wrap"
                            title={`${m}: ${v.toFixed(3)}`}
                          >
                            <span
                              className="scag-bar"
                              style={{ width: `${v * 100}%` }}
                            />
                            <span className="scag-val">{v.toFixed(2)}</span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedResults.length > 50 && (
              <small className="more">Showing top 50 of {sortedResults.length} pairs</small>
            )}
          </div>
        </div>
      )}

      {scag.results && sortedResults.length === 0 && scag.filterThreshold > 0 && (
        <div className="row">
          <small style={{ color: "var(--text-dim)" }}>
            No pairs with {scag.filterMeasure} ≥ {scag.filterThreshold.toFixed(2)}
          </small>
        </div>
      )}

      <div className="row">
        <button disabled={!canRun} onClick={run} aria-label="run scagnostics">
          Run
        </button>
        {scag.results && (
          <button onClick={clear} aria-label="clear scagnostics">
            Clear
          </button>
        )}
        {scag.running && <span className="spinner" />}
      </div>
    </div>
  );
}
