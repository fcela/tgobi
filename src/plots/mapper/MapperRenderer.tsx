import { useMemo, useRef, useState, useCallback } from "react";
import type { MapperPlotPanel } from "@/store/types";
import type { MapperGraph, MapperNode, MapperEdge } from "@/lib/mapper";
import type { DataFrame } from "@/lib/data/types";
import { useAppStore } from "@/store";
import { getPalette } from "@/lib/color/palettes";

const WIDTH = 600;
const HEIGHT = 480;
const PAD = 40;

export interface MapperRendererProps {
  panel: MapperPlotPanel;
}

export function MapperRenderer({ panel }: MapperRendererProps) {
  const graph = useAppStore((s) => s.mapper.graph);
  const colorBy = useAppStore((s) => s.mapper.colorBy);
  const selectedNodeId = useAppStore((s) => s.mapper.selectedNodeId);
  const selectMapperNode = useAppStore((s) => s.selectMapperNode);
  const palette = useAppStore((s) => s.color.palette);
  const removePanel = useAppStore((s) => s.removePanel);
  const paintPalette = useMemo(() => getPalette(palette), [palette]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverNode, setHoverNode] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const layout = useMemo(() => {
    if (!graph || graph.nodes.length === 0) return null;
    return computeLayout(graph, WIDTH, HEIGHT, PAD, colorBy);
  }, [graph, colorBy]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.2, Math.min(5, z * factor)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleDoubleClick = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="plot-card">
        <div className="plot-head">
          <span className="vars">Mapper</span>
          <button className="close" aria-label={`remove plot ${panel.id}`} onClick={() => removePanel(panel.id)}>x</button>
        </div>
        <div className="plot-empty">Run Mapper from the Mapper tab first, then add a Mapper plot to visualize it here.</div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="plot-card">
        <div className="plot-head">
          <span className="vars">Mapper</span>
          <button className="close" aria-label={`remove plot ${panel.id}`} onClick={() => removePanel(panel.id)}>x</button>
        </div>
        <div className="plot-empty">No graph to display.</div>
      </div>
    );
  }

  const { toSvgX, toSvgY, maxSize, maxStat, minStat, statRange } = layout;

  const nodeEdgeCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!graph) return counts;
    for (const edge of graph.edges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    }
    return counts;
  }, [graph]);

  const df = useAppStore((s) => s.df);
  const hoveredNode = hoverNode != null ? graph.nodes[hoverNode] ?? null : null;
  const selectedNode = selectedNodeId != null ? graph.nodes[selectedNodeId] ?? null : null;
  const infoNode = hoveredNode ?? selectedNode;

  return (
    <div className="plot-card">
      <div className="plot-head">
        <span className="vars">Mapper — {graph.nodes.length} nodes, {graph.edges.length} edges</span>
        <button className="close" aria-label={`remove plot ${panel.id}`} onClick={() => removePanel(panel.id)}>x</button>
      </div>
      <div className="plot-body" style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          className="mapper-plot-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Mapper graph"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          style={{ cursor: "grab" }}
        >
          <g transform={`translate(${WIDTH / 2 + pan.x}, ${HEIGHT / 2 + pan.y}) scale(${zoom})`}>
            {graph.edges.map((edge, i) => {
              const s = graph.nodes[edge.source]!;
              const t = graph.nodes[edge.target]!;
              const isHighlighted = (hoverNode === edge.source || hoverNode === edge.target ||
                selectedNodeId === edge.source || selectedNodeId === edge.target);
              return (
                <line
                  key={`e${i}`}
                  x1={toSvgX(s.x)}
                  y1={toSvgY(s.y)}
                  x2={toSvgX(t.x)}
                  y2={toSvgY(t.y)}
                  stroke={isHighlighted ? "#8cf" : "#555"}
                  strokeWidth={Math.max(1, Math.min(5, edge.sharedRows / 2))}
                  opacity={isHighlighted ? 0.9 : 0.4}
                />
              );
            })}
            {graph.nodes.map((node) => {
              const count = node.stats["_count"] ?? 1;
              const r = Math.max(5, Math.min(22, 5 + (count / maxSize) * 17));
              let fill = paintPalette[0] ?? "#6cf";
              if (colorBy === "_count") {
                const t = count / maxSize;
                fill = paintPalette[Math.floor(t * (paintPalette.length - 1))] ?? paintPalette[0]!;
              } else {
                const val = node.stats[colorBy] ?? 0;
                const t = (val - minStat) / statRange;
                fill = paintPalette[Math.floor(t * (paintPalette.length - 1))] ?? paintPalette[0]!;
              }
              const isSelected = selectedNodeId === node.id;
              const isHovered = hoverNode === node.id;
              return (
                <circle
                  key={`n${node.id}`}
                  cx={toSvgX(node.x)}
                  cy={toSvgY(node.y)}
                  r={r}
                  fill={fill}
                  stroke={isSelected ? "#fff" : isHovered ? "#8cf" : "none"}
                  strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 0}
                  opacity={0.9}
                  style={{ cursor: "pointer" }}
                  onClick={() => selectMapperNode(node.id === selectedNodeId ? null : node.id)}
                  onMouseEnter={() => setHoverNode(node.id)}
                  onMouseLeave={() => setHoverNode(null)}
                >
        <title>
          node {node.id}: {count} rows
          {colorBy !== "_count" ? `, ${colorBy}=${(node.stats[colorBy] ?? 0).toFixed(2)}` : ""}
          {nodeEdgeCounts.has(node.id) ? `, ${nodeEdgeCounts.get(node.id)} connections` : ""}
        </title>
                </circle>
              );
            })}
          </g>
        </svg>
  {infoNode && (
    <div className="mapper-info-overlay">
      <div><strong>Node {infoNode.id}</strong> — {infoNode.stats["_count"] ?? 0} rows
        {colorBy !== "_count" && (
          <span> | {colorBy}: {(infoNode.stats[colorBy] ?? 0).toFixed(2)}</span>
        )}
        {infoNode.level != null && <span> | interval {infoNode.level}</span>}
      </div>
      {selectedNode && df && (
        <MapperNodeDetail node={selectedNode} graph={graph} df={df} />
      )}
    </div>
  )}
        <div className="mapper-zoom-hint">
          scroll=zoom, alt+drag=pan, dbl-click=reset
        </div>
      </div>
    </div>
  );
}

function computeLayout(
  graph: MapperGraph,
  w: number,
  h: number,
  pad: number,
  colorBy: string,
) {
  const { nodes } = graph;
  if (nodes.length === 0) return null;

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const n of nodes) {
    if (n.x < xMin) xMin = n.x;
    if (n.x > xMax) xMax = n.x;
    if (n.y < yMin) yMin = n.y;
    if (n.y > yMax) yMax = n.y;
  }
  const xRange = Math.max(1, xMax - xMin);
  const yRange = Math.max(1, yMax - yMin);
  const plotW = w - 2 * pad;
  const plotH = h - 2 * pad;
  const scale = Math.min(plotW / xRange, plotH / yRange);

  const toSvgX = (x: number) => (x - (xMin + xMax) / 2) * scale;
  const toSvgY = (y: number) => (y - (yMin + yMax) / 2) * scale;

  const maxSize = Math.max(1, ...nodes.map((n) => n.stats["_count"] ?? 0));
  const maxStat = colorBy !== "_count"
    ? Math.max(1, ...nodes.map((n) => n.stats[colorBy] ?? 0))
    : maxSize;
  const minStat = colorBy !== "_count"
    ? Math.min(...nodes.map((n) => n.stats[colorBy] ?? 0))
    : 0;
  const statRange = Math.max(1, maxStat - minStat);

  return { toSvgX, toSvgY, maxSize, maxStat, minStat, statRange };
}

function MapperNodeDetail({ node, graph, df }: { node: MapperNode; graph: MapperGraph; df: DataFrame }) {
  const connectedEdges = graph.edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );
  const neighborIds = new Set<number>();
  for (const e of connectedEdges) {
    neighborIds.add(e.source === node.id ? e.target : e.source);
  }
  const totalOverlapRows = connectedEdges.reduce((s, e) => s + e.sharedRows, 0);

  const varRows: { name: string; mean: number; sd: number; min: number; max: number }[] = [];
  for (const col of df.columns) {
    if (col.type !== "numeric" && col.type !== "integer") continue;
    if (node.stats[col.name] == null) continue;
    varRows.push({
      name: col.name,
      mean: node.stats[col.name]!,
      sd: node.stats[`_sd_${col.name}`] ?? 0,
      min: node.stats[`_min_${col.name}`] ?? 0,
      max: node.stats[`_max_${col.name}`] ?? 0,
    });
  }

  return (
    <div className="mapper-node-detail">
      <div className="mapper-detail-section">
        <small>Connections: {connectedEdges.length} edges, {totalOverlapRows} shared rows with {neighborIds.size} neighbors</small>
      </div>
      {varRows.length > 0 && (
        <table className="mapper-var-table">
          <thead>
            <tr><th>var</th><th>mean</th><th>sd</th><th>min</th><th>max</th></tr>
          </thead>
          <tbody>
            {varRows.map((vr) => (
              <tr key={vr.name}>
                <td>{vr.name}</td>
                <td>{vr.mean.toFixed(2)}</td>
                <td>{vr.sd.toFixed(2)}</td>
                <td>{vr.min.toFixed(2)}</td>
                <td>{vr.max.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
