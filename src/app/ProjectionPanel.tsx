import { useMemo } from "react";
import { useAppStore } from "@/store";
import type { ProjectionMethod } from "@/lib/projection/types";
import { ClampedInput } from "@/app/ClampedInput";

export function ProjectionPanel() {
  const df = useAppStore((s) => s.df);
  const projection = useAppStore((s) => s.projection);
  const setMethod = useAppStore((s) => s.setProjectionMethod);
  const setVariables = useAppStore((s) => s.setProjectionVariables);
  const setNComponents = useAppStore((s) => s.setProjectionNComponents);
  const setDimX = useAppStore((s) => s.setProjectionDimX);
  const setDimY = useAppStore((s) => s.setProjectionDimY);
  const setTsnePerplexity = useAppStore((s) => s.setProjectionTsnePerplexity);
  const setTsneIterations = useAppStore((s) => s.setProjectionTsneIterations);
  const setUmapNNeighbors = useAppStore((s) => s.setProjectionUmapNNeighbors);
  const setUmapMinDist = useAppStore((s) => s.setProjectionUmapMinDist);
  const run = useAppStore((s) => s.runProjection);
  const materialize = useAppStore((s) => s.materializeProjection);
  const clear = useAppStore((s) => s.clearProjection);

  const numericVars = useMemo(
    () => df?.columns.filter((c) => c.type === "numeric" || c.type === "integer").map((c) => c.name) ?? [],
    [df],
  );

  const toggleVar = (name: string) => {
    const has = projection.variables.includes(name);
    setVariables(has
      ? projection.variables.filter((v) => v !== name)
      : [...projection.variables, name]);
  };

  const maxComponents = Math.min(projection.variables.length, (df?.nrow ?? 1) - 1);
  const canRun = !!df && projection.variables.length >= 2 && !projection.running;
  const canMaterialize = !!projection.embedding;

  return (
    <div className="projection-panel">
      <header>Projection</header>

      <div className="row">
        <span>Method</span>
        <select
          aria-label="projection method"
          value={projection.method}
          onChange={(e) => setMethod(e.target.value as ProjectionMethod)}
        >
          <option value="pca">PCA</option>
          <option value="mds">MDS</option>
          <option value="ica">ICA</option>
          <option value="tsne">t-SNE</option>
          <option value="umap">UMAP</option>
        </select>
      </div>

  <div className="row">
    <span>Dims</span>
    <ClampedInput value={projection.nComponents} min={2} max={Math.max(maxComponents, 2)} ariaLabel="number of components" onChange={setNComponents} />
  </div>

  {projection.method === "tsne" && (
    <>
      <div className="row">
        <span>Perplexity</span>
        <input
          type="number"
          min={2}
          max={100}
          value={projection.tsnePerplexity}
          aria-label="t-SNE perplexity"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v >= 2 && v <= 100) setTsnePerplexity(v);
          }}
        />
      </div>
      <div className="row">
        <span>Iterations</span>
        <ClampedInput value={projection.tsneIterations} min={50} max={5000} ariaLabel="t-SNE iterations" onChange={setTsneIterations} />
      </div>
    </>
  )}

  {projection.method === "umap" && (
    <>
      <div className="row">
        <span>Neighbors</span>
        <ClampedInput value={projection.umapNNeighbors} min={2} max={200} ariaLabel="UMAP n neighbors" onChange={setUmapNNeighbors} />
      </div>
      <div className="row">
        <span>Min Dist</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={projection.umapMinDist}
          aria-label="UMAP min distance"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v >= 0 && v <= 1) setUmapMinDist(v);
          }}
        />
      </div>
    </>
  )}

      {canMaterialize && (
        <>
          <div className="row">
            <span>X</span>
            <select
              aria-label="dimension for x axis"
              value={projection.dimX}
              onChange={(e) => setDimX(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: projection.nComponents }, (_, i) => (
                <option key={i + 1} value={i + 1}>Dim {i + 1}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <span>Y</span>
            <select
              aria-label="dimension for y axis"
              value={projection.dimY}
              onChange={(e) => setDimY(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: projection.nComponents }, (_, i) => (
                <option key={i + 1} value={i + 1}>Dim {i + 1}</option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="row vars-row">
        <div className="vars" aria-label="projection variables">
          {numericVars.length === 0 && (
            <span style={{ color: "var(--text-dim)" }}>no numeric variables</span>
          )}
          {numericVars.map((n) => {
            const isActive = projection.variables.includes(n);
            return (
              <div key={n} className={isActive ? "var-row active" : "var-row"}>
                <input
                  type="checkbox"
                  aria-label={`include ${n} in projection`}
                  checked={isActive}
                  onChange={() => toggleVar(n)}
                />
                <span className="name">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {projection.loadings && projection.variables.length > 0 && (
    <div className="row loadings-row">
      <div className="loadings">
        <table>
          <thead>
            <tr>
              <th></th>
              {Array.from({ length: projection.nComponents }, (_, i) => {
                const label = projection.method === "pca"
                  ? `PC${i + 1}`
                  : projection.method === "ica"
                    ? `IC${i + 1}`
                    : `D${i + 1}`;
                return <th key={i}>{label}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {projection.variables.map((vName, vi) => {
              const rowMax = Math.max(
                ...Array.from({ length: projection.nComponents }, (_, ci) =>
                  Math.abs(projection.loadings![vi * projection.nComponents + ci]!)),
              );
              return (
                <tr key={vName}>
                  <td className="var-name">{vName}</td>
                  {Array.from({ length: projection.nComponents }, (_, ci) => {
                    const val = projection.loadings![vi * projection.nComponents + ci]!;
                    const absVal = Math.abs(val);
                    const pct = rowMax > 0 ? absVal / rowMax : 0;
                    const style: React.CSSProperties = absVal > 0.5
                      ? { fontWeight: 700, color: "var(--accent)" }
                      : absVal > 0.3
                        ? { fontWeight: 600, color: "var(--text)" }
                        : { color: "var(--text-dim)" };
                    return (
                      <td key={ci} style={style}>
                        <span className="loading-bar-wrap">
                          <span className="loading-bar" style={{ width: `${pct * 100}%` }} />
                          <span className="loading-val">{val.toFixed(2)}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {projection.explainedVar && (
              <tr className="var-row">
                <td className="var-name" style={{ color: "var(--text-dim)", fontStyle: "italic" }}>Cum %</td>
                {projection.explainedVar.reduce((acc: number[], v, i) => {
                  acc.push((acc[i - 1] ?? 0) + v);
                  return acc;
                }, []).map((cum, ci) => (
                  <td key={ci} style={{ color: "var(--text-dim)", fontSize: 10 }}>
                    {(cum * 100).toFixed(1)}%
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )}

  {!projection.loadings && projection.varImportance && projection.variables.length > 0 && (
    <div className="row importance-row">
      <div className="loadings">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Importance</th>
            </tr>
          </thead>
          <tbody>
            {projection.variables
              .map((vName, vi) => ({ vName, imp: projection.varImportance![vi]! }))
              .sort((a, b) => b.imp - a.imp)
              .map(({ vName, imp }) => (
                <tr key={vName}>
                  <td className="var-name">{vName}</td>
                  <td>
                    <span className="loading-bar-wrap">
                      <span className="loading-bar" style={{ width: `${imp * 100}%` }} />
                      <span className="loading-val">{(imp * 100).toFixed(1)}%</span>
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )}

  {projection.error && (
        <div className="row error">{projection.error}</div>
      )}

      {projection.explainedVar && (
        <div className="row summary">
          <small>
            Var: {projection.explainedVar.map((v) => (v * 100).toFixed(1) + "%").join(", ")}
          </small>
        </div>
      )}

      {projection.stress != null && (
        <div className="row summary">
          <small>Stress: {projection.stress.toFixed(4)}</small>
        </div>
      )}

      <div className="row">
        <button disabled={!canRun} onClick={run} aria-label="compute projection">
          {projection.running ? <span className="spinner" /> : "Compute"}
        </button>
        {canMaterialize && (
          <>
            <button onClick={materialize} aria-label="add projection to dataset">
              Add to data
            </button>
            <button onClick={clear} aria-label="clear projection">
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}
