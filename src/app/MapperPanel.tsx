import { useMemo } from "react";
import { useAppStore } from "@/store";
import type { FilterFunction, MapperClusterMethod, MapperClusterLinkage } from "@/lib/mapper";
import { HelpPopover } from "@/app/HelpPopover";
import { MapperSweepDiagnostics } from "@/app/MapperSweepDiagnostics";

export function MapperPanel() {
  const df = useAppStore((s) => s.df);
  const mapper = useAppStore((s) => s.mapper);
  const setMapperFilter = useAppStore((s) => s.setMapperFilter);
  const setMapperFilterVar = useAppStore((s) => s.setMapperFilterVar);
  const setMapperIntervals = useAppStore((s) => s.setMapperIntervals);
  const setMapperOverlap = useAppStore((s) => s.setMapperOverlap);
  const setMapperClusterK = useAppStore((s) => s.setMapperClusterK);
  const setMapperClusterMethod = useAppStore((s) => s.setMapperClusterMethod);
  const setMapperClusterLinkage = useAppStore((s) => s.setMapperClusterLinkage);
  const setMapperClusterEps = useAppStore((s) => s.setMapperClusterEps);
  const setMapperClusterMinPts = useAppStore((s) => s.setMapperClusterMinPts);
  const setMapperVariables = useAppStore((s) => s.setMapperVariables);
  const runMapper = useAppStore((s) => s.runMapper);
  const clearMapper = useAppStore((s) => s.clearMapper);
  const setMapperColorBy = useAppStore((s) => s.setMapperColorBy);

  const numericVars = useMemo(() => {
    if (!df) return [];
    return df.columns.filter((c) => c.type === "numeric" || c.type === "integer").map((c) => c.name);
  }, [df]);

  const { params, graph, running, error, colorBy } = mapper;

  const colorByOptions = useMemo(() => {
    const opts = ["_count"];
    for (const v of params.variables) {
      if (numericVars.includes(v)) opts.push(v);
    }
    return opts;
  }, [params.variables, numericVars]);

  const hasVars = params.variables.length >= 1;

  return (
    <div className="mapper-panel">
      <header>Mapper (TDA) <HelpPopover content={<><p className="help-title">What is Mapper?</p><p>Mapper is a <b>topological data analysis (TDA)</b> technique that constructs a graph (network) revealing the shape of your data — loops, flares, clusters, and bridges that other methods miss.</p><p><b>How it works:</b> (1) A <b>filter function</b> maps each data point to a 1D value, (2) the filter range is split into <b>overlapping intervals</b>, (3) points within each interval are <b>clustered</b>, (4) clusters that share points are <b>connected by edges</b>.</p><p><b>Why it's useful:</b> Unlike clustering alone, Mapper shows <b>how clusters connect</b>. A loop might reveal a cyclical process. A flare might show a branching trajectory. A bridge might show a transition between groups.</p><p><b>How to use:</b> (1) Choose variables and a filter, (2) adjust intervals/overlap, (3) click Run, (4) click graph nodes to select those rows in all linked plots.</p><p><b>Warning:</b> The graph shape is very sensitive to intervals, overlap, and clustering parameters. Small parameter changes can produce very different graphs. Try several settings.</p><p style={{ color: "var(--text-dim)" }}>Ref: Singh et al. (2007) "Topological Methods for the Analysis of High Dimensional Data Sets"</p></>} /></header>

      <div className="vars-row row">
        <span>Vars</span>
        <HelpPopover content={<><p className="help-title">Mapper Variables</p><p>Variables used for clustering within each filter interval. These determine what "similar" means when grouping points together.</p><p><b>Tip:</b> Start with 2-3 variables that capture the structure you're interested in. Too many variables can make the clusters uninformative.</p></>} />
        <div className="vars">
          {numericVars.map((v) => (
            <div key={v} className={`var-row${params.variables.includes(v) ? " active" : ""}`}>
              <input
                type="checkbox"
                checked={params.variables.includes(v)}
                onChange={() => {
                  const next = params.variables.includes(v)
                    ? params.variables.filter((x) => x !== v)
                    : [...params.variables, v];
                  setMapperVariables(next);
                }}
              />
              <span className="name">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="row">
        <span>Filter</span>
        <HelpPopover content={<><p className="help-title">Filter / Lens Function</p><p>The function that "unfolds" your data along one axis. Think of it as choosing which direction to slice your data from. Different filters reveal different topology.</p><div className="help-measures"><span className="mname">variable</span><span className="mdesc">Use a single data column as the lens. Pick a variable that represents an important gradient or ordering in your data.</span><span className="mname">PCA 1</span><span className="mdesc">Score on first principal component — the direction of maximum variance. A good default lens that captures the dominant structure.</span><span className="mname">PCA 2</span><span className="mdesc">Score on second principal component — the direction of second-most variance, orthogonal to PC1. Reveals structure in the next dimension.</span><span className="mname">PCA residual</span><span className="mdesc">Reconstruction error from a 2-component PCA. Points poorly described by the first two PCs get high values. Reveals outliers and non-linear structure that PCA misses.</span><span className="mname">eccentricity</span><span className="mdesc">Maximum distance to any other point. Points far from everything get high values. Reveals the "edges" of your data cloud.</span><span className="mname">density</span><span className="mdesc">Local point density via Gaussian kernel. Dense regions get high values. Reveals where points concentrate vs. sparse regions.</span></div><p><b>Tip:</b> Try different filters! The same data can show completely different graph shapes depending on the lens. PCA1 is a good starting point; residual is great for finding outliers.</p><p className="help-warning">PCA-based filters use the selected variables for both PCA and clustering. Residual lens from 2-component PCA only — it measures deviation from the best 2D linear approximation.</p></>} />
        <select
          aria-label="Mapper filter function"
          value={params.filter}
          onChange={(e) => setMapperFilter(e.target.value as FilterFunction)}
        >
          <option value="variable">variable</option>
          <option value="pca1">PCA 1</option>
          <option value="pca2">PCA 2</option>
          <option value="residual">PCA residual</option>
          <option value="eccentricity">eccentricity</option>
          <option value="density">density</option>
        </select>
      </div>

      {params.filter === "variable" && (
        <div className="row">
          <span>Filter var</span>
          <HelpPopover content={<><p className="help-title">Filter Variable</p><p>Which data column to use as the lens. This determines the "slicing direction" of the Mapper graph.</p><p><b>Good choices:</b> A variable with a meaningful gradient (time, dose, temperature) or one that captures a key dimension of variation (first PCA component).</p></>} />
          <select
            aria-label="Mapper filter variable"
            value={params.filterVar ?? ""}
            onChange={(e) => setMapperFilterVar(e.target.value || null)}
          >
            <option value="">(first var)</option>
            {numericVars.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      <div className="row">
        <span>Intervals</span>
        <HelpPopover content={<><p className="help-title">Number of Intervals</p><p>How many slices to cut the filter range into. More intervals = finer topological resolution (smaller features visible), but more nodes and slower computation.</p><p><b>5-10</b>: Coarse view. Captures major structure. Fewer nodes, easier to interpret.</p><p><b>15-30</b>: Fine view. Reveals subtle topological features like small loops or short flares. More nodes, more complex graph.</p><p><b>Tip:</b> Start with 10, then increase to see if finer structure emerges.</p></>} />
        <input
          type="number"
          min={2}
          max={50}
          value={params.intervals}
          onChange={(e) => setMapperIntervals(Math.max(2, parseInt(e.target.value) || 10))}
        />
      </div>

      <div className="row">
        <span>Overlap</span>
        <HelpPopover content={<><p className="help-title">Interval Overlap</p><p>Fraction of overlap between adjacent intervals. This is critical — overlap creates shared points between bins, which is what generates edges in the graph.</p><p><b>Low (0.1-0.2)</b>: Fewer shared points = fewer edges = more disconnected components. Good for finding distinct clusters.</p><p><b>Medium (0.3-0.5)</b>: Balanced connectivity. Good default.</p><p><b>High (0.6-0.9)</b>: Many shared points = many edges = denser graph. Can reveal bridges and loops, but may also create too much connectivity.</p></>} />
        <input
          type="number"
          min={0}
          max={0.9}
          step={0.05}
          value={params.overlap}
          onChange={(e) => setMapperOverlap(Math.max(0, Math.min(0.9, parseFloat(e.target.value) || 0.5)))}
        />
      </div>

  <div className="row">
  <span>Clusters</span>
  <HelpPopover content={<><p className="help-title">Clustering Method</p><p>How to cluster points within each filter interval. Each cluster becomes a node in the Mapper graph.</p><div className="help-measures"><span className="mname">k-means</span><span className="mdesc">Partitions points into k groups by minimizing within-cluster variance. Fast and simple. Good default. Set <b>cluster k</b> to control the number of clusters per interval.</span><span className="mname">hierarchical</span><span className="mdesc">Agglomerative (bottom-up) clustering. Merges closest clusters until k remain. Choose <b>linkage</b> to control how "closest" is defined. Good for capturing nested structure.</span><span className="mname">dbscan</span><span className="mdesc">Density-based clustering. Finds clusters of arbitrary shape and marks sparse points as noise (excluded from graph). Set <b>eps</b> (neighborhood radius) and <b>minPts</b> (minimum points for a core point). No need to specify number of clusters.</span></div><p><b>Tip:</b> Start with k-means (k=3). Try hierarchical with single linkage if data has chain-like structure. Use DBSCAN when clusters have irregular shapes or you want noise points excluded.</p></>} />
  <select
    aria-label="Mapper clustering method"
    value={params.clusterMethod}
    onChange={(e) => setMapperClusterMethod(e.target.value as MapperClusterMethod)}
  >
    <option value="kmeans">k-means</option>
    <option value="hierarchical">hierarchical</option>
    <option value="dbscan">DBSCAN</option>
  </select>
</div>

{params.clusterMethod === "kmeans" && (
  <div className="row">
    <span>Cluster k</span>
    <input
      type="number"
      min={2}
      max={10}
      value={params.clusterK}
      onChange={(e) => setMapperClusterK(Math.max(2, parseInt(e.target.value) || 3))}
    />
  </div>
)}

{params.clusterMethod === "hierarchical" && (
  <>
    <div className="row">
      <span>Linkage</span>
      <HelpPopover content={<><p className="help-title">Hierarchical Linkage</p><p>How the distance between clusters is measured during merging.</p><div className="help-measures"><span className="mname">single</span><span className="mdesc">Minimum distance between any pair of points across clusters. Tends to produce elongated, chain-like clusters. Good for detecting connected structures.</span><span className="mname">complete</span><span className="mdesc">Maximum distance between any pair of points. Produces compact, spherical clusters. More robust to noise than single linkage.</span><span className="mname">average</span><span className="mdesc">Average distance between all pairs of points. A compromise between single and complete linkage.</span></div></>} />
      <select
        aria-label="Hierarchical linkage"
        value={params.clusterLinkage}
        onChange={(e) => setMapperClusterLinkage(e.target.value as MapperClusterLinkage)}
      >
        <option value="single">single</option>
        <option value="complete">complete</option>
        <option value="average">average</option>
      </select>
    </div>
    <div className="row">
      <span>Cut k</span>
      <input
        type="number"
        min={2}
        max={10}
        value={params.clusterK}
        onChange={(e) => setMapperClusterK(Math.max(2, parseInt(e.target.value) || 3))}
      />
    </div>
  </>
)}

{params.clusterMethod === "dbscan" && (
  <>
    <div className="row">
      <span>Eps</span>
      <HelpPopover content={<><p className="help-title">DBSCAN Epsilon</p><p>The neighborhood radius. Two points are neighbors if their distance is less than eps. Controls how "close" points must be to belong to the same cluster.</p><p><b>Tip:</b> If all points end up in one cluster, decrease eps. If there are too many noise points, increase eps. Try values between 0.1 and 2.0.</p></>} />
      <input
        type="number"
        min={0.01}
        max={10}
        step={0.05}
        value={params.clusterEps}
        onChange={(e) => setMapperClusterEps(Math.max(0.01, parseFloat(e.target.value) || 0.5))}
      />
    </div>
    <div className="row">
      <span>Min pts</span>
      <HelpPopover content={<><p className="help-title">DBSCAN Min Points</p><p>Minimum number of points in an eps-neighborhood for a point to be a "core point". Core points form the backbone of clusters.</p><p><b>Tip:</b> Usually set to dimensionality + 1 or higher. Start with 3-5. Higher values produce fewer, larger clusters and more noise points.</p></>} />
      <input
        type="number"
        min={2}
        max={20}
        value={params.clusterMinPts}
        onChange={(e) => setMapperClusterMinPts(Math.max(2, parseInt(e.target.value) || 3))}
      />
    </div>
  </>
)}

      {graph && (
        <div className="row">
          <span>Color</span>
          <HelpPopover content={<><p className="help-title">Node Color</p><p>What determines the color of each node in the graph.</p><p><b>node size</b>: Color by number of data points in the node. Larger nodes = more points.</p><p><b>variable name</b>: Color by the average value of a selected variable across points in the node. Use this to see how a variable varies across the topological structure.</p></>} />
          <select
            aria-label="Mapper node color by"
            value={colorBy}
            onChange={(e) => setMapperColorBy(e.target.value)}
          >
            {colorByOptions.map((opt) => (
              <option key={opt} value={opt}>{opt === "_count" ? "node size" : opt}</option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="row">
        <button disabled={!df || !hasVars || running} onClick={runMapper}>
          {running ? <span className="spinner" /> : "Run"}
        </button>
        {graph && <button onClick={clearMapper}>Clear</button>}
      </div>

      {graph && (
        <div className="summary">
          <HelpPopover content={<><p className="help-title">Mapper Graph</p><p>The graph below shows the topological structure. <b>Click a node</b> to select those data points in all linked plots — you'll see them highlighted in the scatterplot, parcoords, etc.</p><p><b>Nodes</b>: Each circle is a cluster of similar points within a filter interval. Size = number of points.</p><p><b>Edges</b>: Lines connect nodes that share data points (from overlapping intervals). An edge means those two clusters overlap.</p><p><b>What to look for:</b> Loops (cyclical processes), flares (branching trajectories), bridges (transitions between groups), isolated nodes (distinct groups).</p></>} />
          <small>
            {graph.nodes.length} nodes, {graph.edges.length} edges
          </small>
        </div>
      )}

  {graph && <MapperGraphSVG graph={graph} colorBy={colorBy} />}

  <MapperSweepDiagnostics />
  </div>
  );
}

import type { MapperGraph as MapperGraphType } from "@/lib/mapper";
import { getPalette } from "@/lib/color/palettes";

function MapperGraphSVG({
  graph,
  colorBy,
}: {
  graph: MapperGraphType;
  colorBy: string;
}) {
  const selectMapperNode = useAppStore((s) => s.selectMapperNode);
  const selectedNodeId = useAppStore((s) => s.mapper.selectedNodeId);
  const palette = useMemo(() => getPalette(useAppStore.getState().color.palette), []);

  const { nodes, edges } = graph;
  if (nodes.length === 0) return null;

  const W = 400;
  const H = 300;
  const cx = W / 2;
  const cy = H / 2;

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const n of nodes) {
    if (n.x < xMin) xMin = n.x;
    if (n.x > xMax) xMax = n.x;
    if (n.y < yMin) yMin = n.y;
    if (n.y > yMax) yMax = n.y;
  }
  const xRange = Math.max(1, xMax - xMin);
  const yRange = Math.max(1, yMax - yMin);
  const scale = Math.min((W - 60) / xRange, (H - 60) / yRange);

  const toSvgX = (x: number) => cx + (x - (xMin + xMax) / 2) * scale;
  const toSvgY = (y: number) => cy + (y - (yMin + yMax) / 2) * scale;

  const maxSize = Math.max(1, ...nodes.map((n) => n.stats["_count"] ?? 0));
  const maxStat = colorBy !== "_count"
    ? Math.max(1, ...nodes.map((n) => n.stats[colorBy] ?? 0))
    : maxSize;

  const minStat = colorBy !== "_count"
    ? Math.min(...nodes.map((n) => n.stats[colorBy] ?? 0))
    : 0;
  const statRange = Math.max(1, maxStat - minStat);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxHeight: 200 }}>
      {edges.map((edge, i) => {
        const s = nodes[edge.source]!;
        const t = nodes[edge.target]!;
        return (
          <line
            key={i}
            x1={toSvgX(s.x)}
            y1={toSvgY(s.y)}
            x2={toSvgX(t.x)}
            y2={toSvgY(t.y)}
            stroke="#444"
            strokeWidth={Math.max(1, Math.min(4, edge.sharedRows / 3))}
            opacity={0.5}
          />
        );
      })}
      {nodes.map((node) => {
        const count = node.stats["_count"] ?? 1;
        const r = Math.max(4, Math.min(16, 4 + (count / maxSize) * 12));
        let fill = palette[0] ?? "#6cf";
        if (colorBy === "_count") {
          const t = count / maxSize;
          fill = palette[Math.floor(t * (palette.length - 1))] ?? palette[0]!;
        } else {
          const val = node.stats[colorBy] ?? 0;
          const t = (val - minStat) / statRange;
          fill = palette[Math.floor(t * (palette.length - 1))] ?? palette[0]!;
        }
        const isSelected = selectedNodeId === node.id;
        return (
          <circle
            key={node.id}
            cx={toSvgX(node.x)}
            cy={toSvgY(node.y)}
            r={r}
            fill={fill}
            stroke={isSelected ? "#fff" : "none"}
            strokeWidth={isSelected ? 2 : 0}
            opacity={0.85}
            style={{ cursor: "pointer" }}
            onClick={() => selectMapperNode(node.id === selectedNodeId ? null : node.id)}
          >
            <title>
              node {node.id}: {count} rows
              {colorBy !== "_count" ? `, ${colorBy}=${(node.stats[colorBy] ?? 0).toFixed(2)}` : ""}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
