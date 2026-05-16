import { useMemo, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store";
import type { ProjectionMethod } from "@/lib/projection/types";
import { ClampedInput } from "@/app/ClampedInput";
import { HelpPopover } from "@/app/HelpPopover";
import { ProjectionDiagnostics } from "@/app/ProjectionDiagnostics";

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
  const compareDR = useAppStore((s) => s.compareDR);
  const setMorphIndex = useAppStore((s) => s.setMorphIndex);
  const setMorphT = useAppStore((s) => s.setMorphT);
  const setMorphPlaying = useAppStore((s) => s.setMorphPlaying);
  const stopMorph = useAppStore((s) => s.stopMorph);

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
  const canCompare = !!df && projection.variables.length >= 2 && !projection.running;
  const canMaterialize = !!projection.embedding;

  useEffect(() => {
    if (!projection.morphPlaying || !projection.morphEmbeddings || projection.morphEmbeddings.length < 2) return;
    let raf: number;
    const start = performance.now();
    const duration = 2000;
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      useAppStore.getState().setMorphT(t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else useAppStore.getState().setMorphPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [projection.morphPlaying, projection.morphIndex, projection.morphEmbeddings]);

  return (
    <div className="projection-panel">
      <header>Projection <HelpPopover content={<><p className="help-title">Dimensionality Reduction</p><p>Maps high-dimensional data (many variables) down to 2D or 3D so you can see it in a scatterplot. Each method preserves different aspects of the original structure.</p><p><b>Why it matters:</b> Humans can only see 2-3 dimensions at once. DR lets you visualize data that has dozens or hundreds of variables, revealing clusters, manifolds, and outliers.</p><div className="help-measures"><span className="mname">PCA</span><span className="mdesc">Linear method — finds directions of maximum variance. Fast, deterministic. Preserves global structure but misses nonlinear patterns. Like looking at the "shadows" that capture the most spread.</span><span className="mname">MDS</span><span className="mdesc">Preserves pairwise distances between all points. Good for seeing the overall geometry — which points are near/far from each other. Slow for large datasets (O(n²)).</span><span className="mname">ICA</span><span className="mdesc">Finds statistically independent components. Useful for blind source separation — when your data is a mixture of independent signals. Like unmixing a cocktail party of conversations.</span><span className="mname">t-SNE</span><span className="mdesc">Nonlinear — preserves local neighborhoods. Excellent at revealing clusters, but distances between clusters are not meaningful. Distances within a cluster are reliable; distances between clusters are not.</span><span className="mname">UMAP</span><span className="mdesc">Nonlinear — balances local and global structure. Often faster than t-SNE with similar cluster separation, and preserves more of the overall topology. A good default choice.</span></div><p><b>Tip:</b> Use "Compare" to see all five methods side-by-side in a guided tour. Different methods reveal different structure.</p><p><b>Warning:</b> t-SNE and UMAP distort distances. Distances <b>within</b> a cluster are roughly reliable, but distances <b>between</b> clusters are not meaningful — they depend on parameters and random initialization, not on true separation. A gap between clusters does not prove they are far apart in the original space. Use PCA or MDS for faithful global distances.</p></>} /></header>

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
        <HelpPopover content={<><p className="help-title">Number of Dimensions</p><p>How many components to compute. The first 2 are shown by default in the scatterplot; use the X/Y dropdowns below to view other dimensions.</p><p><b>2</b>: Standard 2D scatterplot view.</p><p><b>3+</b>: Compute more components for richer analysis. You can scrub through different dimension pairs in the scatterplot.</p><p><b>Tip:</b> For PCA, look at the cumulative variance explained in the loadings table to decide how many dimensions to keep.</p></>} />
        <ClampedInput value={projection.nComponents} min={2} max={Math.max(maxComponents, 2)} ariaLabel="number of components" onChange={setNComponents} />
      </div>

      {projection.method === "tsne" && (
        <>
          <div className="row">
            <span>Perplexity</span>
            <HelpPopover content={<><p className="help-title">t-SNE Perplexity</p><p>Controls the effective number of nearest neighbors each point considers when building its local neighborhood. It's like asking "how many neighbors should I pay attention to?"</p><p><b>Low (5-15)</b>: Very local view — emphasizes fine cluster structure. May split large clusters into fragments.</p><p><b>High (30-50)</b>: Broader view — captures medium-scale patterns. More stable results.</p><p>The algorithm adapts to this parameter so results are fairly robust, but very different perplexities can give very different layouts. <b>Try multiple values</b> to see which reveals the most structure.</p></>} />
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
            <HelpPopover content={<><p className="help-title">t-SNE Iterations</p><p>Number of optimization steps. More iterations = better convergence, but slower.</p><p><b>500-1000</b>: Usually sufficient for small datasets.</p><p><b>2000+</b>: Needed for large or complex datasets. If clusters look stretched or poorly separated, try more iterations.</p></>} />
            <ClampedInput value={projection.tsneIterations} min={50} max={5000} ariaLabel="t-SNE iterations" onChange={setTsneIterations} />
          </div>
        </>
      )}

      {projection.method === "umap" && (
        <>
          <div className="row">
            <span>Neighbors</span>
            <HelpPopover content={<><p className="help-title">UMAP n_neighbors</p><p>Size of the local neighborhood used to approximate the manifold structure.</p><p><b>Low (5-15)</b>: Focuses on fine local detail — small clusters and fine-grained structure. May miss the big picture.</p><p><b>High (50-200)</b>: Captures more global structure — how clusters relate to each other and the overall shape. May merge small clusters.</p><p><b>Tip:</b> Start with 15, then try larger values to see how the global picture changes.</p></>} />
            <ClampedInput value={projection.umapNNeighbors} min={2} max={200} ariaLabel="UMAP n neighbors" onChange={setUmapNNeighbors} />
          </div>
          <div className="row">
            <span>Min Dist</span>
            <HelpPopover content={<><p className="help-title">UMAP min_dist</p><p>Minimum allowed distance between points in the final embedding.</p><p><b>0</b>: Points pack tightly together — emphasizes cluster separation. Clusters appear as dense dots.</p><p><b>0.5-1.0</b>: Points spread apart — preserves more of the global topology and the "space" between points.</p><p><b>Tip:</b> Use low min_dist for cluster discovery; use higher values to see how clusters relate spatially.</p></>} />
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
            <HelpPopover content={<><p className="help-title">Choose X Axis Dimension</p><p>Select which computed dimension to display on the horizontal axis. For PCA, Dim 1 captures the most variance; for t-SNE/UMAP, dimensions are less ordered.</p></>} />
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
        <HelpPopover content={<><p className="help-title">Projection Variables</p><p>Select which numeric variables to include in the dimensionality reduction.</p><p><b>Which to choose?</b> Include variables that carry meaningful signal. Exclude constant or near-constant variables — they add noise. All selected variables should be on comparable scales (use the Variable panel's scaling options if not).</p><p><b>Tip:</b> For PCA, start with all variables and check the loadings table to see which contribute most. For t-SNE/UMAP, fewer variables often give cleaner results.</p></>} />
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
          <HelpPopover content={<><p className="help-title">Loadings Table</p><p>Shows how much each original variable contributes to each computed dimension. Bold accent-colored values indicate strong contributions.</p><p><b>How to read it:</b> A loading of 0.9 on PC1 means that variable is almost perfectly aligned with the first principal component. Values near 0 mean the variable contributes little to that dimension.</p><p><b>Cum %</b>: Cumulative variance explained (PCA only). If the first 2 PCs explain 80%+, you're capturing most of the structure in 2D.</p></>} />
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
          <HelpPopover content={<><p className="help-title">Variable Importance</p><p>For nonlinear methods (t-SNE, UMAP, MDS), the loadings table is replaced by a variable importance score. This measures how much each variable influences the final embedding — higher values mean the variable contributes more to the structure you see.</p></>} />
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
        <HelpPopover content={<><p className="help-title">Compute vs. Compare</p><p><b>Compute</b>: Runs the selected method and shows the result in the scatterplot.</p><p><b>Compare</b>: Runs all five methods (PCA, MDS, ICA, t-SNE, UMAP), aligns them via Procrustes rotation to the PCA reference, and pushes the aligned embeddings as keyframes into a guided tour. This lets you scrub through different methods' views of the same data — like having five different lenses on the same dataset.</p><p><b>Add to data</b>: Appends the embedding coordinates as new columns to your dataset, so you can use them in other analyses (e.g. as inputs to clustering or classification).</p></>} />
        <button disabled={!canCompare} onClick={compareDR} aria-label="compare DR methods">
          {projection.running ? <span className="spinner" /> : "Compare"}
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

      {projection.morphEmbeddings && projection.morphEmbeddings.length >= 2 && (
        <div className="dr-morph-section">
          <header>DR Morph <HelpPopover content={<><p className="help-title">Embedding Morph</p><p>Interpolate between the PCA reference and another DR method's embedding. Points glide smoothly from their PCA positions to their aligned positions in the target method.</p><p>This shows you exactly how each method rearranges the data — which clusters tighten, which relationships emerge, which structure is preserved or lost.</p><p><b>How to use:</b> Pick a target method from the dropdown, then drag the slider or click Play. At t=0 you see PCA; at t=1 you see the target method; in between is a linear blend.</p><p className="help-warning"><b>Warning:</b> The morph is a simple linear interpolation, not a geodesic on the Stiefel manifold. It preserves straight-line structure but may pass through non-orthonormal intermediate states.</p></>} /></header>
          <div className="row">
            <span>Target</span>
            <select
              aria-label="morph target method"
              value={projection.morphIndex}
              onChange={(e) => setMorphIndex(parseInt(e.target.value, 10))}
            >
              {projection.morphEmbeddings.map((m, i) => (
                <option key={i} value={i}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <span>Morph</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={projection.morphT}
              aria-label="morph interpolation"
              onChange={(e) => setMorphT(parseFloat(e.target.value))}
            />
            <small>{projection.morphT.toFixed(2)}</small>
            <button
              className={projection.morphPlaying ? "morph-pause" : "morph-play"}
              onClick={() => setMorphPlaying(!projection.morphPlaying)}
            >
              {projection.morphPlaying ? "⏸" : "▶"}
            </button>
            <button onClick={stopMorph}>Stop</button>
          </div>
        </div>
      )}

      <ProjectionDiagnostics />
    </div>
  );
}
