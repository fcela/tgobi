import { useMemo } from "react";
import { useAppStore } from "@/store";
import type { ClusteringMethod } from "@/store/types";
import type { Linkage } from "@/lib/clustering/hierarchical";
import { ClampedInput } from "@/app/ClampedInput";
import { Dendrogram } from "@/app/Dendrogram";
import { ClusteringDiagnostics } from "@/app/ClusteringDiagnostics";
import { HelpPopover } from "@/app/HelpPopover";

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
      <header>Clustering <HelpPopover content={<><p className="help-title">What is Clustering?</p><p>Clustering groups data points so that points in the same group are more similar to each other than to points in other groups. It discovers structure without predefined labels — the algorithm finds the groups.</p><p><b>Why it's useful:</b> Find natural segments in your data (customer types, gene families, species). Validate groups you've already identified by brushing. See whether your data has clear separation or gradual transitions.</p><p><b>How to use:</b> (1) Select variables, (2) choose a method and its parameters, (3) click Run, (4) click Paint to color the scatterplot by cluster.</p><p><b>Warning:</b> Clusters found by an algorithm are not ground truth. Different methods and parameters can give very different groupings. Always visualize the results and ask "do these groups make sense?"</p></>} /></header>

      <div className="row">
        <span>Method</span>
        <HelpPopover content={<><p className="help-title">Choosing a Clustering Method</p><div className="help-measures"><span className="mname">K-Means</span><span className="mdesc">Fast, simple. Partitions into k spherical clusters of roughly equal size. Good when you know how many groups you want and expect compact, round clusters. Sensitive to scale — standardize first. Must specify k.</span><span className="mname">Hierarchical</span><span className="mdesc">Builds a tree (dendrogram) of nested clusters. No need to pre-specify k — drag the cut line on the dendrogram to choose. Great for understanding nested structure. Slow for large datasets.</span><span className="mname">DBSCAN</span><span className="mdesc">Density-based: finds arbitrarily-shaped clusters and labels sparse points as noise (-1). No need to specify k, but requires eps (neighborhood radius) and minPts. Best when clusters are separated by empty space.</span><span className="mname">OPTICS</span><span className="mdesc">Like DBSCAN but handles varying densities. The xi parameter controls how steep a density valley must be to separate clusters. More flexible but harder to tune.</span><span className="mname">X-Means</span><span className="mdesc">Automatically selects k using the BIC criterion. You set kMax (upper bound) and the algorithm finds the best k. Good when you don't know how many clusters to expect.</span></div><p><b>Tip:</b> Run multiple methods and compare. If K-Means and DBSCAN agree, you can be more confident. If they disagree, your data may not have clear clusters.</p></>} />
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
          <HelpPopover content={<><p className="help-title">Linkage Method</p><p>How the distance between two clusters is measured when merging them in the hierarchy.</p><div className="help-measures"><span className="mname">Complete</span><span className="mdesc">Maximum distance between any two points across clusters. Produces compact, tight clusters. Most commonly used.</span><span className="mname">Single</span><span className="mdesc">Minimum distance. Can cause "chaining" — one long cluster that absorbs nearby points. Good for finding elongated structures.</span><span className="mname">Average</span><span className="mdesc">Average pairwise distance. A compromise between single and complete. Often a good default.</span></div></>} />
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
          <HelpPopover content={<><p className="help-title">Number of Clusters (k)</p><p>How many groups to partition the data into.</p><p><b>How to choose:</b> Try multiple values and compare results. Use the Paint button to visualize each k on the scatterplot. If you're unsure, try X-Means which selects k automatically.</p><p><b>Tip:</b> For hierarchical clustering, drag the dendrogram cut line instead of typing a number — you'll see the clusters form interactively.</p></>} />
          <ClampedInput value={clustering.k} min={2} max={20} ariaLabel="number of clusters" onChange={setK} />
        </div>
      )}

      {needsEps && (
        <>
          <div className="row">
            <span>eps</span>
            <HelpPopover content={<><p className="help-title">Neighborhood Radius (eps)</p><p>The maximum distance between two points for them to be considered neighbors. A "core point" has at least minPts neighbors within this radius.</p><p><b>How to choose:</b> Think of it as the "reach" of each point. Too small = most points become noise. Too large = everything is one cluster. Try values that give a reasonable noise fraction (5-20%).</p><p><b>Tip:</b> Scale matters! If your variables have different ranges, standardize them first (use the Variable panel).</p></>} />
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
            <HelpPopover content={<><p className="help-title">Minimum Points (minPts)</p><p>How many neighbors a point needs within eps distance to be considered a "core point" of a cluster.</p><p><b>Low (3-5)</b>: More points become core, clusters grow larger, less noise. Better for small datasets.</p><p><b>High (10-20)</b>: Only dense regions become clusters. More points labeled as noise. Better for large datasets or when you want only very tight clusters.</p><p><b>Rule of thumb:</b> minPts ≥ dimensionality + 1. For 2D data, use at least 3.</p></>} />
            <ClampedInput value={clustering.minPts} min={1} max={100} ariaLabel="minPts" onChange={setMinPts} />
          </div>
        </>
      )}

      {clustering.method === "optics" && (
        <div className="row">
          <span>xi</span>
          <HelpPopover content={<><p className="help-title">OPTICS Steepness (xi)</p><p>Controls how deep a density valley must be to split two clusters. Think of it as "how much of a gap do I need to see to call it two separate groups?"</p><p><b>Low (0.01-0.05)</b>: Finds many clusters, including ones separated by shallow density dips. Sensitive.</p><p><b>High (0.3-1.0)</b>: Only splits clusters at deep, dramatic density gaps. Conservative.</p><p><b>Tip:</b> Start at 0.05 and increase if you get too many small clusters, or decrease if you get too few.</p></>} />
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
          <HelpPopover content={<><p className="help-title">X-Means kMax</p><p>The upper bound on the number of clusters. X-Means starts with k=2 and keeps splitting clusters as long as the BIC (Bayesian Information Criterion) improves. It stops at kMax or earlier if splitting doesn't help.</p><p><b>Tip:</b> Set kMax generously (e.g. 20) — the algorithm will only use as many clusters as the data supports.</p></>} />
          <ClampedInput value={clustering.kMax} min={2} max={50} ariaLabel="X-Means kMax" onChange={setKMax} />
        </div>
      )}

      <div className="row vars-row">
        <HelpPopover content={<><p className="help-title">Clustering Variables</p><p>Select which numeric variables the clustering algorithm uses to measure similarity between points.</p><p><b>Which to choose:</b> Include variables that capture meaningful differences between groups. Exclude irrelevant or noisy variables — they can dilute cluster structure.</p><p><b>Important:</b> Variables on different scales will dominate the distance calculation. Standardize first (use the Variable panel's z-score or robust scaling) unless scale differences are meaningful.</p></>} />
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

      {clustering.method === "hierarchical" && clustering.dendrogram && (
        <div className="row" style={{ justifyContent: "center" }}>
          <HelpPopover content={<><p className="help-title">Dendrogram</p><p>A tree diagram showing how clusters are merged. The y-axis represents the distance at which two clusters were joined — taller merges mean the clusters were farther apart.</p><p><b>How to use:</b> Drag the orange dashed cut line up and down to choose k. Clusters below the cut line are colored; above are dimmed. The resulting k is shown in the k input above.</p><p><b>Read it:</b> Long vertical lines (large gaps) suggest natural cluster boundaries. Short lines near the bottom mean those points are very similar.</p></>} />
          <Dendrogram
            data={clustering.dendrogram}
            k={clustering.k}
            width={260}
            height={140}
            onCutChange={(newK) => setK(newK)}
          />
        </div>
      )}

      <div className="row">
        <button disabled={!canRun} onClick={run} aria-label="run clustering">
          Run
        </button>
        {clustering.results && (
          <>
            <HelpPopover content={<><p className="help-title">Paint Clusters</p><p>Colors each point in the scatterplot by its cluster assignment. This lets you see where clusters fall in the original variable space, not just the clustering space.</p><p><b>What to look for:</b> Do painted groups form distinct regions? Are there mixed regions where clusters overlap? Do the clusters match any known groups?</p><p><b>Warning:</b> Painting overwrites any existing brushed group colors. Save your current painting first if you need it.</p></>} />
            <button onClick={applyPaint} aria-label="paint clusters">
              Paint
            </button>
            <button onClick={clear} aria-label="clear clustering">
              Clear
            </button>
    </>
      )}
      </div>
      <ClusteringDiagnostics />
    </div>
  );
}
