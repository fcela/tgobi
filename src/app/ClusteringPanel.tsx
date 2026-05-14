import { useMemo } from "react";
import { useAppStore } from "@/store";
import type { ClusteringMethod } from "@/store/types";
import type { Linkage } from "@/lib/clustering/hierarchical";
import { ClampedInput } from "@/app/ClampedInput";

export function ClusteringPanel() {
  const df = useAppStore((s) => s.df);
  const clustering = useAppStore((s) => s.clustering);
  const setMethod = useAppStore((s) => s.setClusteringMethod);
  const setVariables = useAppStore((s) => s.setClusteringVariables);
  const setK = useAppStore((s) => s.setClusteringK);
  const setLinkage = useAppStore((s) => s.setClusteringLinkage);
  const setEps = useAppStore((s) => s.setClusteringEps);
  const setMinPts = useAppStore((s) => s.setClusteringMinPts);
  const setXi = useAppStore((s) => s.setClusteringXi);
  const setKMax = useAppStore((s) => s.setClusteringKMax);
  const run = useAppStore((s) => s.runClustering);
  const applyPaint = useAppStore((s) => s.applyClusteringPaint);
  const clear = useAppStore((s) => s.clearClustering);

  const numericVars = useMemo(
    () => df?.columns.filter((c) => c.type === "numeric" || c.type === "integer").map((c) => c.name) ?? [],
    [df],
  );

  const toggleVar = (name: string) => {
    const has = clustering.variables.includes(name);
    setVariables(has
      ? clustering.variables.filter((v) => v !== name)
      : [...clustering.variables, name]);
  };

  const needsK = clustering.method === "kmeans" || clustering.method === "hierarchical";
  const needsEps = clustering.method === "dbscan" || clustering.method === "optics";
  const canRun = !!df && clustering.variables.length >= 2 && !clustering.running
    && (needsK ? clustering.k >= 2 : true)
    && (needsEps ? clustering.eps > 0 && clustering.minPts >= 1 : true);

  return (
    <div className="clustering-panel">
      <header>Clustering</header>

      <div className="row">
        <span>Method</span>
        <select
          aria-label="clustering method"
          value={clustering.method}
          onChange={(e) => setMethod(e.target.value as ClusteringMethod)}
        >
        <option value="kmeans">K-Means</option>
        <option value="hierarchical">Hierarchical</option>
        <option value="dbscan">DBSCAN</option>
        <option value="optics">OPTICS</option>
        <option value="xmeans">X-Means</option>
        </select>
      </div>

      {clustering.method === "hierarchical" && (
        <div className="row">
          <span>Linkage</span>
          <select
            aria-label="linkage method"
            value={clustering.linkage}
            onChange={(e) => setLinkage(e.target.value as Linkage)}
          >
            <option value="complete">Complete</option>
            <option value="single">Single</option>
            <option value="average">Average</option>
          </select>
        </div>
      )}

  {needsK && (
    <div className="row">
      <span>k</span>
      <ClampedInput value={clustering.k} min={2} max={20} ariaLabel="number of clusters" onChange={setK} />
    </div>
  )}

  {needsEps && (
    <>
      <div className="row">
        <span>eps</span>
        <input
          type="number"
          min={0.01}
          step={0.1}
          value={clustering.eps}
          aria-label="eps"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v > 0) setEps(v);
          }}
        />
      </div>
      <div className="row">
        <span>minPts</span>
        <ClampedInput value={clustering.minPts} min={1} max={100} ariaLabel="minPts" onChange={setMinPts} />
      </div>
    </>
  )}

  {clustering.method === "optics" && (
    <div className="row">
      <span>xi</span>
      <input
        type="number"
        min={0.01}
        max={1}
        step={0.01}
        value={clustering.xi}
        aria-label="OPTICS xi"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (v >= 0.01 && v <= 1) setXi(v);
        }}
      />
    </div>
  )}

  {clustering.method === "xmeans" && (
    <div className="row">
      <span>kMax</span>
      <ClampedInput value={clustering.kMax} min={2} max={50} ariaLabel="X-Means kMax" onChange={setKMax} />
    </div>
  )}

      <div className="row vars-row">
        <div className="vars" aria-label="clustering variables">
          {numericVars.length === 0 && (
            <span style={{ color: "var(--text-dim)" }}>no numeric variables</span>
          )}
          {numericVars.map((n) => {
            const isActive = clustering.variables.includes(n);
            return (
              <div key={n} className={isActive ? "var-row active" : "var-row"}>
                <input
                  type="checkbox"
                  aria-label={`include ${n} in clustering`}
                  checked={isActive}
                  onChange={() => toggleVar(n)}
                />
                <span className="name">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {clustering.error && (
        <div className="row error">{clustering.error}</div>
      )}

      {clustering.results && (
        <div className="row summary">
          <small>
            {clustering.sizes.length} clusters, sizes: {clustering.sizes.join(" / ")}
          </small>
        </div>
      )}

      <div className="row">
        <button disabled={!canRun} onClick={run} aria-label="run clustering">
          Run
        </button>
        {clustering.results && (
          <>
            <button onClick={applyPaint} aria-label="paint clusters">
              Paint
            </button>
            <button onClick={clear} aria-label="clear clustering">
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}
