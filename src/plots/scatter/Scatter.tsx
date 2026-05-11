import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas2DScatterRenderer } from "@/plots/scatter/canvas2dRenderer";
import { Regl2DScatterRenderer } from "@/plots/scatter/regl2dRenderer";
import type { ScatterPanel } from "@/store/types";
import type { HullOverlay, ScatterRenderState, ScatterRenderer, ScatterTransform } from "@/plots/scatter/types";
import { useAppStore } from "@/store";
import { KdTree2D } from "@/lib/brush/kdtree";
import {
  pointsInEllipse,
  pointsInPolygon,
  pointsInRect,
  bitGet,
  bitSet,
  type Point2D,
} from "@/lib/brush/hitTest";
import {
  edgesFromNodeMask,
  edgesInBrush,
  nearestEdge,
  nodesFromEdgeMask,
  unionMasks,
  type EdgeBrushQuery,
} from "@/lib/edges/edgeHitTest";
import { categoricalScale, sequentialScale, divergingScale } from "@/lib/color/scales";
import { getPalette } from "@/lib/color/palettes";
import { formatRowLabel } from "@/lib/data/format";
import { convexHull } from "@/lib/geometry/convexHull";

const FIXED_FALLBACK = "#88c";
const EDGE_NODE_HIT_RADIUS = 14;
const EDGE_DELETE_HIT_RADIUS = 8;

export interface ScatterProps {
  panel: ScatterPanel;
}

export function Scatter({ panel }: ScatterProps) {
  const df = useAppStore((s) => s.df);
  const selection = useAppStore((s) => s.selection);
  const colorState = useAppStore((s) => s.color);
  const brush = useAppStore((s) => s.brush);
  const edges = useAppStore((s) => s.edges);
  const hulls = useAppStore((s) => s.hulls);
  const tools = useAppStore((s) => s.tools);
  const activeTool = useAppStore((s) => s.tools.active);
  const setIdentifyHover = useAppStore((s) => s.setIdentifyHover);
  const togglePinnedIdentify = useAppStore((s) => s.togglePinnedIdentify);
  const setActiveBrush = useAppStore((s) => s.setActiveBrush);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const setSelectionShape = useAppStore((s) => s.setSelectionShape);
  const setEdgeSelectionMask = useAppStore((s) => s.setEdgeSelectionMask);
  const setEdgeSelectionPaint = useAppStore((s) => s.setEdgeSelectionPaint);
  const addEdge = useAppStore((s) => s.addEdge);
  const deleteEdge = useAppStore((s) => s.deleteEdge);
  const removePanel = useAppStore((s) => s.removePanel);
  const tour = useAppStore((s) => s.tour);
  const tourProj = useAppStore((s) => s.tour.proj);
  const tourActivePanelId = useAppStore((s) => s.tour.activePanelId);
  const tourShape = useAppStore((s) => s.tour.shape);

  const isTourActive =
    tourActivePanelId === panel.id &&
    tourShape === "2d" &&
    tourProj != null &&
    tourProj.length >= 2;

  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ScatterRenderer | null>(null);
  const treeRef = useRef<KdTree2D | null>(null);
  const hullCacheRef = useRef<{ time: number; overlay: HullOverlay | null } | null>(null);

  const [tip, setTip] = useState<{ i: number; px: number; py: number } | null>(null);
  const [labels, setLabels] = useState<Array<{ i: number; x: number; y: number; label: string }>>([]);
  const [alpha, setAlpha] = useState<number | null>(null);

  // numeric arrays for x and y
  const xCol = df?.column(panel.x);
  const yCol = df?.column(panel.y);

  // Per-row color (memoized on inputs).
  const colors: ReadonlyArray<string> = useMemo(() => {
    if (!df) return [];
    const n = df.nrow;
    const out = new Array<string>(n).fill(FIXED_FALLBACK);
    const enc = colorState.encoding;
    if (enc.kind === "byVar") {
      const c = df.column(enc.var);
      if (!c) return out;
      const palette = getPalette(colorState.palette);
      let scale: ((i: number) => string) | null = null;
      if (enc.scale === "categorical" && c.type === "categorical") {
        scale = categoricalScale(c, palette);
      } else if (
        (enc.scale === "sequential" || enc.scale === "diverging") &&
        (c.type === "numeric" || c.type === "integer")
      ) {
        scale =
          enc.scale === "sequential"
            ? sequentialScale(c, palette)
            : divergingScale(c, palette);
      }
      if (scale) for (let i = 0; i < n; i++) out[i] = scale(i);
    }
    return out;
  }, [df, colorState.encoding, colorState.palette]);

  const paintPalette = useMemo(() => getPalette(colorState.palette), [colorState.palette]);

  const edgeOverlay = useMemo(() => {
    if (!edges.visible || !edges.layer) return null;
    const layer = edges.layer;
    const nEdges = layer.source.length;
    const mode = edges.colorMode;
    if (mode === "fixed" || nEdges === 0) {
      return { edges: layer, color: "#c7c7d8", alpha: edges.alpha, edgeMask: edges.selection.mask, edgePaint: edges.selection.paint };
    }
    const perEdge: string[] = new Array<string>(nEdges);
    if (mode === "endpoint") {
      for (let e = 0; e < nEdges; e++) {
        const a = layer.source[e]!;
        const b = layer.target[e]!;
        const cA = (a < colors.length) ? (colors[a] ?? "#c7c7d8") : "#c7c7d8";
        const cB = (b < colors.length) ? (colors[b] ?? "#c7c7d8") : "#c7c7d8";
        const pA = (a < selection.paint.length && selection.paint[a]! > 0)
          ? (paintPalette[selection.paint[a]! - 1] ?? cA) : cA;
        const pB = (b < selection.paint.length && selection.paint[b]! > 0)
          ? (paintPalette[selection.paint[b]! - 1] ?? cB) : cB;
        perEdge[e] = blendHex(pA, pB);
      }
    } else if (mode === "paint") {
      for (let e = 0; e < nEdges; e++) {
        const paintIdx = edges.selection.paint[e] ?? 0;
        perEdge[e] = paintIdx > 0 ? (paintPalette[paintIdx - 1] ?? "#c7c7d8") : "#c7c7d8";
      }
    } else if (mode === "attribute") {
      const attrVar = edges.colorAttr;
      if (layer.attrs && attrVar) {
        const attrCol = layer.attrs.column(attrVar);
        if (attrCol) {
          const pal = getPalette(colorState.palette);
          let scale: ((i: number) => string) | null = null;
          if (attrCol.type === "categorical") scale = categoricalScale(attrCol, pal);
          else if (attrCol.type === "numeric" || attrCol.type === "integer") scale = sequentialScale(attrCol, pal);
          if (scale) {
            for (let e = 0; e < nEdges; e++) perEdge[e] = scale(e);
          }
        }
      }
      if (perEdge[0] == null) perEdge.fill("#c7c7d8");
    }
    return { edges: layer, color: "#c7c7d8", alpha: edges.alpha, perEdgeColors: perEdge, edgeMask: edges.selection.mask, edgePaint: edges.selection.paint };
  }, [edges.visible, edges.layer, edges.alpha, edges.colorMode, edges.colorAttr, edges.selection.mask, edges.selection.paint, colors, selection.paint, paintPalette, colorState.palette]);

  // Renderer lifecycle.
  useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  console.info("[scatter] mount renderer, panel=", panel.id);
  try {
  const r = new Regl2DScatterRenderer();
  r.attach(canvas);
  console.info("[scatter] WebGL renderer active");
  rendererRef.current = r;
  } catch (e) {
  console.warn("[scatter] WebGL not supported, falling back to Canvas2D.", e);
  const r = new Canvas2DScatterRenderer();
  r.attach(canvas);
  rendererRef.current = r;
  }
  return () => {
  console.info("[scatter] unmount renderer, panel=", panel.id);
  rendererRef.current?.detach();
  rendererRef.current = null;
  };
  }, []);

  // Resize observer keeps the canvas backing-store sized to the layout.
  useEffect(() => {
  const body = bodyRef.current;
  const canvas = canvasRef.current;
  if (!body || !canvas) return;
  let lastW = 0, lastH = 0;
  const ro = new ResizeObserver((entries) => {
  const r = rendererRef.current;
  if (!r) { console.warn("[scatter] RO fired but no renderer, panel=", panel.id); return; }
  for (const entry of entries) {
  const w = Math.max(1, Math.floor(entry.contentBoxSize[0]?.inlineSize ?? entry.contentRect.width));
  const h = Math.max(1, Math.floor(entry.contentBoxSize[0]?.blockSize ?? entry.contentRect.height));
  if (w === lastW && h === lastH) return;
  lastW = w; lastH = h;
  console.info("[scatter] resize, panel=", panel.id, "w=", w, "h=", h);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.setSize(w, h);
  treeRef.current = null;
  requestPaint();
  }
  });
  ro.observe(body);
  return () => ro.disconnect();
  }, []);

  // (Re)load data when df / x / y change, or when tour projection updates.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !df) return;

    if (isTourActive && tourProj) {
      const n = df.nrow;
      const xs = new Float64Array(n);
      const ys = new Float64Array(n);
      for (let i = 0; i < n; i++) { xs[i] = tourProj[i * 2]!; ys[i] = tourProj[i * 2 + 1]!; }
      // Mark rows as missing when the projection value is not finite (NaN from missing source rows).
      const xm = new Uint8Array(Math.ceil(n / 8));
      const ym = new Uint8Array(Math.ceil(n / 8));
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(xs[i]!)) xm[i >> 3] = xm[i >> 3]! | (1 << (i & 7));
        if (!Number.isFinite(ys[i]!)) ym[i >> 3] = ym[i >> 3]! | (1 << (i & 7));
      }
      r.setData(xs, ys, xm, ym);
      treeRef.current = null;
      requestPaint();
      return;
    }

    if (!xCol || !yCol) return;
    if (xCol.type !== "numeric" && xCol.type !== "integer") return;
    if (yCol.type !== "numeric" && yCol.type !== "integer") return;
    r.setData(xCol.values, yCol.values, xCol.missing.buffer, yCol.missing.buffer);

    // rebuild kd-tree on next paint
    treeRef.current = null;
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [df, panel.x, panel.y, xCol, yCol, isTourActive, tourProj]);

  // Paint orchestration — use a ref to avoid stale closure issues.
  const paintHandle = useRef<number | null>(null);

  const requestPaint = () => {
    if (paintHandle.current != null) return;
    let firedSynchronously = false;
    const handle = requestAnimationFrame(() => {
      firedSynchronously = true;
      paintHandle.current = null;
      paint();
    });
    if (!firedSynchronously) paintHandle.current = handle;
  };

  const paint = () => {
  const r = rendererRef.current;
  if (!r || !df) return;
  const n = df.nrow;
  const defaultAlpha = n > 50000 ? Math.max(0.15, 0.65 * Math.sqrt(50000 / n)) : 0.65;
  const effectiveAlpha = alpha ?? defaultAlpha;
  const visual: ScatterRenderState = {
  color: colors,
  alpha: effectiveAlpha,
  selected: selection.mask,
  paint: selection.paint,
  shape: selection.shape,
  shadow: selection.shadow,
  paintPalette,
  };
  const isThisPanelBrushing =
    brush.activePanelId === panel.id
    ? { tool: brush.tool, rect: brush.activeRect, path: brush.activePath }
    : null;
  const hullOverlay = buildHullOverlay(r.transform());
  r.draw(visual, isThisPanelBrushing, edgeOverlay, hullOverlay);
    updatePinnedLabels(r);

    // Build kd-tree from current pixel positions if missing.
    if (!treeRef.current && isTourActive && tourProj) {
      const t = r.transform();
      const n = df.nrow;
      const xy = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) {
        const x = tourProj[i * 2]!;
        const y = tourProj[i * 2 + 1]!;
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          xy[2 * i] = NaN;
          xy[2 * i + 1] = NaN;
        } else {
          const p = t.toPx(x, y);
          xy[2 * i] = p.x;
          xy[2 * i + 1] = p.y;
        }
      }
      try {
        treeRef.current = new KdTree2D(xy);
      } catch {
        treeRef.current = null;
      }
    } else if (
      !treeRef.current &&
      xCol &&
      yCol &&
      (xCol.type === "numeric" || xCol.type === "integer") &&
      (yCol.type === "numeric" || yCol.type === "integer")
    ) {
      const t = r.transform();
      const n = xCol.length;
      const xy = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) {
        if (bitGet(xCol.missing.buffer, i) || bitGet(yCol.missing.buffer, i)) {
          xy[2 * i] = NaN;
          xy[2 * i + 1] = NaN;
        } else {
          const p = t.toPx(xCol.values[i]!, yCol.values[i]!);
          xy[2 * i] = p.x;
          xy[2 * i + 1] = p.y;
        }
      }
      try {
        treeRef.current = new KdTree2D(xy);
      } catch {
        treeRef.current = null;
      }
    }
  };

  useEffect(() => {
  hullCacheRef.current = null;
  requestPaint();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [df, colors, selection, brush.activeRect, brush.activePath, brush.activePanelId, brush.tool, paintPalette, alpha, tools.pinnedRows, tools.labelVar, edges.layer, edges.visible, edges.alpha, edges.colorMode, edges.colorAttr, edges.selection.mask, edges.selection.paint, hulls.colorGroups, hulls.paintGroups, hulls.alpha, colorState.encoding]);

  // Mouse interactions.
  const dragRef = useRef<{
    x0: number;
    y0: number;
    tool: typeof brush.tool;
    path: Point2D[] | null;
    localMask: Uint8Array;
    currentRect: { x0: number; y0: number; x1: number; y1: number };
  } | null>(null);
  const edgeEditRef = useRef<{ source: number; target: number | null } | null>(null);

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (edges.editMode !== "none") {
      handleEdgeEditMouseDown(e);
      return;
    }
    if (activeTool === "identify") {
      if (!df || !treeRef.current) return;
      const canvasRect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const x = e.clientX - canvasRect.left;
      const y = e.clientY - canvasRect.top;
      const i = treeRef.current.nearest(x, y);
      if (i >= 0) {
        setIdentifyHover(i);
        togglePinnedIdentify(i);
      }
      return;
    }
    if (activeTool !== "brush") return;
    if (!df) return;
    const canvasRect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;
    const local = new Uint8Array(Math.ceil(df.nrow / 8));
    const path = brush.tool === "lasso" ? [{ x, y }] : null;
    const currentRect = { x0: x, y0: y, x1: x, y1: y };
    dragRef.current = { x0: x, y0: y, tool: brush.tool, path, localMask: local, currentRect };
    setActiveBrush(panel.id, currentRect, path);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasRect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    if (edges.editMode !== "none") {
      handleEdgeEditMouseMove(x, y);
      return;
    }

    if (activeTool === "identify" && treeRef.current && df) {
      const i = treeRef.current.nearest(x, y);
      if (i >= 0) {
        setIdentifyHover(i);
        setTip({ i, px: x + 8, py: y + 8 });
      } else {
        setIdentifyHover(null);
        setTip(null);
      }
      return;
    }

    if (activeTool !== "brush") return;
    if (!dragRef.current || !df || !treeRef.current) return;
    const drag = dragRef.current;
    const brushRect = { x0: drag.x0, y0: drag.y0, x1: x, y1: y };
    drag.currentRect = brushRect;

    drag.localMask.fill(0);
    let hits: Int32Array;
    if (drag.tool === "lasso") {
      const path = appendLassoPoint(drag.path ?? [], { x, y });
      drag.path = path;
      hits = pointsInPolygon(treeRef.current, path);
      setActiveBrush(panel.id, pathBounds(path), path);
    } else if (drag.tool === "ellipse") {
      hits = pointsInEllipse(treeRef.current, brushRect);
      setActiveBrush(panel.id, brushRect);
    } else {
      hits = pointsInRect(treeRef.current, brushRect);
      setActiveBrush(panel.id, brushRect);
    }
    for (let k = 0; k < hits.length; k++) bitSet(drag.localMask, hits[k]!);

    const { nodeMask, edgeMask } = resolveBrushMasks(drag);

    setSelectionMask(new Uint8Array(nodeMask));
    if (edgeMask) {
      setEdgeSelectionMask(edgeMask);
    } else if (edges.layer) {
      const nEdges = edges.layer.source.length;
      setEdgeSelectionMask(new Uint8Array(Math.ceil(nEdges / 8)));
    }
  };

  const onMouseUp = (e?: React.MouseEvent<HTMLCanvasElement>) => {
    if (edges.editMode !== "none") {
      finishEdgeEdit(e);
      return;
    }
    if (activeTool !== "brush") return;
    if (!dragRef.current || !df) { setActiveBrush(null, null); return; }
    const target = brush.target;
    if (brush.mode === "persistent") {
      const { nodeMask, edgeMask } = resolveBrushMasks(dragRef.current);
      if (target !== "edges") {
        const nextPaint = new Uint8Array(selection.paint);
        const nextShape = new Uint8Array(selection.shape);
        for (let i = 0; i < df.nrow; i++) {
          if (bitGet(nodeMask, i)) {
            nextPaint[i] = brush.paintColor;
            nextShape[i] = brush.paintShape;
          }
        }
        setSelectionPaint(nextPaint);
        setSelectionShape(nextShape);
      }
      if (edgeMask && target !== "nodes") {
        const nEdges = edges.layer!.source.length;
        const nextEdgePaint = new Uint8Array(edges.selection.paint);
        for (let e = 0; e < nEdges; e++) {
          if (bitGet(edgeMask, e)) {
            nextEdgePaint[e] = brush.paintColor;
          }
        }
        setEdgeSelectionPaint(nextEdgePaint);
      }
    }
    // Always clear transient selection on release.
    setSelectionMask(new Uint8Array(Math.ceil(df.nrow / 8)));
    if (edges.layer) {
      const nEdges = edges.layer.source.length;
      setEdgeSelectionMask(new Uint8Array(Math.ceil(nEdges / 8)));
    }
    dragRef.current = null;
    setActiveBrush(null, null);
  };

  const onMouseLeave = () => {
    setTip(null);
    setIdentifyHover(null);
    if (edgeEditRef.current) {
      edgeEditRef.current = null;
      if (df) setSelectionMask(new Uint8Array(Math.ceil(df.nrow / 8)));
    }
    if (dragRef.current) onMouseUp();
  };

  // Identify tooltip body.
  let tipBody = "";
  if (tip && df) {
    const xv =
      xCol && (xCol.type === "numeric" || xCol.type === "integer")
        ? xCol.values[tip.i]
        : "?";
    const yv =
      yCol && (yCol.type === "numeric" || yCol.type === "integer")
        ? yCol.values[tip.i]
        : "?";
    tipBody = `row ${tip.i + 1}: ${panel.x}=${xv}, ${panel.y}=${yv}`;
  }

  return (
  <div className="plot-card" data-tool={activeTool} ref={cardRef}>
  <div className="plot-head">
  <span className="vars">
  {isTourActive
  ? `tour: ${tour.activeVars.join(", ")}`
  : `${panel.x} × ${panel.y}`}
  </span>
  <label className="plot-slider">
  <span>Alpha</span>
  <input
  className="alpha-slider"
  type="range"
  min={0.02}
  max={1}
  step={0.02}
  value={alpha ?? (df && df.nrow > 50000 ? Math.max(0.15, 0.65 * Math.sqrt(50000 / df.nrow)) : 0.65)}
  onChange={(e) => setAlpha(parseFloat(e.target.value))}
  title="point alpha"
  aria-label="point alpha"
  />
  </label>
  <button
  className="close"
  aria-label={`remove plot ${panel.id}`}
  onClick={() => removePanel(panel.id)}
  >
  ×
  </button>
  </div>
  <div className="plot-body" ref={bodyRef}>
  <canvas
  ref={canvasRef}
  onMouseDown={onMouseDown}
  onMouseMove={onMouseMove}
  onMouseUp={onMouseUp}
  onMouseLeave={onMouseLeave}
  style={{ cursor: edges.editMode === "add" ? "cell" : activeTool === "identify" ? "pointer" : "crosshair" }}
  />
  {tip && (
  <div className="plot-tooltip" style={{ left: tip.px, top: tip.py }}>
  {tipBody}
  </div>
  )}
  {labels.map((label) => (
  <div
  key={label.i}
  className="plot-label"
  style={{ left: label.x, top: label.y }}
  >
  {label.label}
  </div>
  ))}
  </div>
  </div>
  );

  function updatePinnedLabels(r: ScatterRenderer) {
    if (!df) return;
    const next: Array<{ i: number; x: number; y: number; label: string }> = [];
    const t = r.transform();
    for (let i = 0; i < df.nrow; i++) {
      if (!bitGet(tools.pinnedRows, i)) continue;
      const point = projectedPointForRow(i, t);
      if (!point) continue;
      next.push({
        i,
        x: point.x + 6,
        y: point.y - 8,
        label: formatRowLabel(df, i, tools.labelVar),
      });
    }
    setLabels((prev) => sameLabels(prev, next) ? prev : next);
  }

  function handleEdgeEditMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!df) return;
    const canvasRect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;
    if (edges.editMode === "add") {
      const source = nearestNodeAt(x, y, EDGE_NODE_HIT_RADIUS);
      if (source == null) return;
      edgeEditRef.current = { source, target: source };
      const mask = new Uint8Array(Math.ceil(df.nrow / 8));
      bitSet(mask, source);
      setSelectionMask(mask);
      return;
    }
    if (edges.editMode === "delete") {
      const hit = nearestEditableEdgeAt(x, y, EDGE_DELETE_HIT_RADIUS);
      if (hit) deleteEdge(hit.index);
    }
  }

  function handleEdgeEditMouseMove(x: number, y: number) {
    if (!df) return;
    if (edges.editMode === "add" && edgeEditRef.current) {
      const mask = new Uint8Array(Math.ceil(df.nrow / 8));
      bitSet(mask, edgeEditRef.current.source);
      const target = nearestNodeAt(x, y, EDGE_NODE_HIT_RADIUS);
      edgeEditRef.current.target = target;
      if (target != null) bitSet(mask, target);
      setSelectionMask(mask);
      return;
    }
    if (edges.editMode === "delete") {
      const layer = edges.layer;
      if (!layer) return;
      const mask = new Uint8Array(Math.ceil(layer.source.length / 8));
      const hit = nearestEditableEdgeAt(x, y, EDGE_DELETE_HIT_RADIUS);
      if (hit) bitSet(mask, hit.index);
      setEdgeSelectionMask(mask);
    }
  }

  function finishEdgeEdit(e?: React.MouseEvent<HTMLCanvasElement>) {
    if (!df) return;
    if (edges.editMode === "add" && edgeEditRef.current) {
      const source = edgeEditRef.current.source;
      const target = e ? targetNodeFromEvent(e, EDGE_NODE_HIT_RADIUS) : edgeEditRef.current.target;
      if (target != null && target !== source) addEdge(source, target);
    }
    edgeEditRef.current = null;
    setSelectionMask(new Uint8Array(Math.ceil(df.nrow / 8)));
    if (edges.layer) setEdgeSelectionMask(new Uint8Array(Math.ceil(edges.layer.source.length / 8)));
  }

  function nearestNodeAt(x: number, y: number, maxDistance: number): number | null {
    const tree = treeRef.current;
    if (!tree) return null;
    const row = tree.nearest(x, y);
    if (row < 0) return null;
    const p = tree.point(row);
    const dx = x - p.x;
    const dy = y - p.y;
    return dx * dx + dy * dy <= maxDistance * maxDistance ? row : null;
  }

  function nearestEditableEdgeAt(x: number, y: number, maxDistance: number) {
    const layer = edges.layer;
    const xy = currentPixelPositions();
    if (!layer || !xy) return null;
    return nearestEdge(layer, xy, { x, y }, maxDistance, selection.shadow);
  }

  function targetNodeFromEvent(e: React.MouseEvent<HTMLCanvasElement>, maxDistance: number): number | null {
    const rect = e.currentTarget.getBoundingClientRect();
    return nearestNodeAt(e.clientX - rect.left, e.clientY - rect.top, maxDistance);
  }

  function projectedPointForRow(row: number, t: ScatterTransform) {
    if (!df) return null;
    if (isTourActive && tourProj) {
      const x = tourProj[row * 2]!;
      const y = tourProj[row * 2 + 1]!;
      return Number.isFinite(x) && Number.isFinite(y) ? t.toPx(x, y) : null;
    }
    if (
      xCol &&
      yCol &&
      (xCol.type === "numeric" || xCol.type === "integer") &&
      (yCol.type === "numeric" || yCol.type === "integer") &&
      !bitGet(xCol.missing.buffer, row) &&
      !bitGet(yCol.missing.buffer, row)
    ) {
      return t.toPx(xCol.values[row]!, yCol.values[row]!);
    }
    return null;
  }

  function resolveBrushMasks(drag: NonNullable<typeof dragRef.current>): {
    nodeMask: Uint8Array;
    edgeMask: Uint8Array | null;
  } {
    const layer = edges.layer;
    let nodeMask = drag.localMask;
    let edgeMask: Uint8Array | null = null;
    if (!df || !layer) return { nodeMask, edgeMask };

    if (brush.target === "nodes") {
      edgeMask = edges.linkNodesToEdges ? edgesFromNodeMask(layer, nodeMask) : null;
      return { nodeMask, edgeMask };
    }

    const geometricEdgeMask = currentEdgeBrushMask(drag);
    if (brush.target === "edges") {
      edgeMask = geometricEdgeMask;
      nodeMask = edges.linkEdgesToNodes
        ? nodesFromEdgeMask(layer, edgeMask, df.nrow)
        : new Uint8Array(Math.ceil(df.nrow / 8));
    } else {
      edgeMask = edges.linkNodesToEdges
        ? unionMasks(geometricEdgeMask, edgesFromNodeMask(layer, nodeMask))
        : geometricEdgeMask;
      nodeMask = edges.linkEdgesToNodes
        ? unionMasks(nodeMask, nodesFromEdgeMask(layer, geometricEdgeMask, df.nrow))
        : nodeMask;
    }
    return { nodeMask, edgeMask };
  }

  function currentEdgeBrushMask(drag: NonNullable<typeof dragRef.current>): Uint8Array {
    const layer = edges.layer;
    const xy = currentPixelPositions();
    if (!layer || !xy) return new Uint8Array(0);
    const query: EdgeBrushQuery =
      drag.tool === "lasso"
        ? { tool: "lasso", path: drag.path ?? [] }
        : drag.tool === "ellipse"
          ? { tool: "ellipse", rect: drag.currentRect }
          : { tool: "rectangle", rect: drag.currentRect };
    return edgesInBrush(layer, xy, query, selection.shadow);
  }

  function currentPixelPositions(): Float64Array | null {
    const r = rendererRef.current;
    if (!df || !r) return null;
    const t = r.transform();
    const xy = new Float64Array(df.nrow * 2);
    for (let i = 0; i < df.nrow; i++) {
      const point = projectedPointForRow(i, t);
      if (!point) {
        xy[2 * i] = NaN;
        xy[2 * i + 1] = NaN;
      } else {
        xy[2 * i] = point.x;
        xy[2 * i + 1] = point.y;
      }
    }
    return xy;
  }

  function buildHullOverlay(t: ScatterTransform): HullOverlay | null {
    if (!df || (!hulls.colorGroups && !hulls.paintGroups)) return null;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (isTourActive && hullCacheRef.current && now - hullCacheRef.current.time < 120) {
      return hullCacheRef.current.overlay;
    }

    const groups = new Map<string, { color: string; points: Point2D[] }>();
    const add = (key: string, color: string, point: Point2D) => {
      let group = groups.get(key);
      if (!group) {
        group = { color, points: [] };
        groups.set(key, group);
      }
      group.points.push(point);
    };

    if (hulls.colorGroups && colorState.encoding.kind === "byVar" && colorState.encoding.scale === "categorical") {
      const c = df.column(colorState.encoding.var);
      if (c?.type === "categorical") {
        for (let i = 0; i < df.nrow; i++) {
          if (bitGet(selection.shadow, i) || c.missing.isMissing(i)) continue;
          const point = projectedPointForRow(i, t);
          if (!point) continue;
          const code = c.codes[i]!;
          add(`color:${code}`, colors[i] ?? "#c7c7d8", point);
        }
      }
    }

    if (hulls.paintGroups) {
      for (let i = 0; i < df.nrow; i++) {
        if (bitGet(selection.shadow, i)) continue;
        const paintIdx = selection.paint[i] ?? 0;
        if (paintIdx <= 0) continue;
        const point = projectedPointForRow(i, t);
        if (!point) continue;
        add(`paint:${paintIdx}`, paintPalette[paintIdx - 1] ?? "#c7c7d8", point);
      }
    }

    const overlay: HullOverlay = {
      hulls: Array.from(groups.values())
        .map((group) => ({
          points: convexHull(group.points),
          stroke: group.color,
          fill: group.color,
          alpha: hulls.alpha,
        }))
        .filter((hull) => hull.points.length >= 3),
    };
    const result = overlay.hulls.length > 0 ? overlay : null;
    if (isTourActive) hullCacheRef.current = { time: now, overlay: result };
    return result;
  }
}

function sameLabels(
  a: ReadonlyArray<{ i: number; x: number; y: number; label: string }>,
  b: ReadonlyArray<{ i: number; x: number; y: number; label: string }>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.i !== y.i || x.x !== y.x || x.y !== y.y || x.label !== y.label) return false;
  }
  return true;
}

function appendLassoPoint(path: Point2D[], point: Point2D): Point2D[] {
  const last = path[path.length - 1];
  if (last) {
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (dx * dx + dy * dy < 9) return path;
  }
  return [...path, point];
}

function blendHex(a: string, b: string): string {
  const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round((ra + rb) / 2);
  const g = Math.round((ga + gb) / 2);
  const bv = Math.round((ba + bb) / 2);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + bv).toString(16).slice(1);
}

function pathBounds(path: ReadonlyArray<Point2D>) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of path) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}
