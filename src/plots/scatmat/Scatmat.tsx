import { useEffect, useMemo, useRef, useState } from "react";
import type { ScatmatPanel } from "@/store/types";
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
import { categoricalScale, sequentialScale, divergingScale } from "@/lib/color/scales";
import { getPalette } from "@/lib/color/palettes";
import {
  computeLayout,
  drawCell,
  drawDiagonal,
  hitCell,
  cellPixelPositions,
  type ScatmatLayout,
  type ScatmatEdgeOverlay,
  type VisualState,
} from "@/plots/scatmat/scatmatRender";

const FIXED_FALLBACK = "#88c";

export interface ScatmatProps {
  panel: ScatmatPanel;
}

export function Scatmat({ panel }: ScatmatProps) {
  const df = useAppStore((s) => s.df);
  const selection = useAppStore((s) => s.selection);
  const colorState = useAppStore((s) => s.color);
  const brush = useAppStore((s) => s.brush);
  const edges = useAppStore((s) => s.edges);
  const activeTool = useAppStore((s) => s.tools.active);
  const setActiveBrush = useAppStore((s) => s.setActiveBrush);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const setSelectionShape = useAppStore((s) => s.setSelectionShape);
  const removePanel = useAppStore((s) => s.removePanel);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Canvas size in CSS pixels
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Per-cell kd-tree cache: key = "i,j"
  const treeCache = useRef<Map<string, KdTree2D>>(new Map());

  const [tip, setTip] = useState<{ text: string; px: number; py: number } | null>(null);
  const [alpha, setAlpha] = useState(1);

  // Resolved columns for each variable in panel.variables
  const cols = useMemo(() => {
    if (!df) return [];
    return panel.variables.map((v) => {
      const c = df.column(v);
      if (!c || (c.type !== "numeric" && c.type !== "integer")) return null;
      return c as Extract<typeof c, { type: "numeric" | "integer" }>;
    });
  }, [df, panel.variables]);

  // Per-row colors
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

  const edgeOverlay = useMemo<ScatmatEdgeOverlay | null>(() => {
    if (!edges.visible || !edges.layer) return null;
    const layer = edges.layer;
    const nEdges = layer.source.length;
    if (edges.colorMode === "fixed" || nEdges === 0) {
      return { edges: layer, color: "#c7c7d8", alpha: edges.alpha, edgeMask: edges.selection.mask };
    }

    const perEdge = new Array<string>(nEdges);
    if (edges.colorMode === "endpoint") {
      for (let e = 0; e < nEdges; e++) {
        const a = layer.source[e]!;
        const b = layer.target[e]!;
        const cA = a < colors.length ? (colors[a] ?? "#c7c7d8") : "#c7c7d8";
        const cB = b < colors.length ? (colors[b] ?? "#c7c7d8") : "#c7c7d8";
        const pA = a < selection.paint.length && selection.paint[a]! > 0
          ? (paintPalette[selection.paint[a]! - 1] ?? cA)
          : cA;
        const pB = b < selection.paint.length && selection.paint[b]! > 0
          ? (paintPalette[selection.paint[b]! - 1] ?? cB)
          : cB;
        perEdge[e] = blendHex(pA, pB);
      }
    } else if (edges.colorMode === "paint") {
      for (let e = 0; e < nEdges; e++) {
        const paintIdx = edges.selection.paint[e] ?? 0;
        perEdge[e] = paintIdx > 0 ? (paintPalette[paintIdx - 1] ?? "#c7c7d8") : "#c7c7d8";
      }
    } else if (edges.colorMode === "attribute") {
      const attrVar = edges.colorAttr;
      const attrCol = layer.attrs && attrVar ? layer.attrs.column(attrVar) : null;
      if (attrCol) {
        const palette = getPalette(colorState.palette);
        let scale: ((i: number) => string) | null = null;
        if (attrCol.type === "categorical") scale = categoricalScale(attrCol, palette);
        else if (attrCol.type === "numeric" || attrCol.type === "integer") scale = sequentialScale(attrCol, palette);
        if (scale) for (let e = 0; e < nEdges; e++) perEdge[e] = scale(e);
      }
      if (perEdge[0] == null) perEdge.fill("#c7c7d8");
    }

    return {
      edges: layer,
      color: "#c7c7d8",
      alpha: edges.alpha,
      perEdgeColors: perEdge,
      edgeMask: edges.selection.mask,
    };
  }, [
    edges.visible,
    edges.layer,
    edges.alpha,
    edges.colorMode,
    edges.colorAttr,
    edges.selection.mask,
    edges.selection.paint,
    colors,
    selection.paint,
    paintPalette,
    colorState.palette,
  ]);

  // Invalidate kd-tree cache when df or variables change
  useEffect(() => {
    treeCache.current.clear();
  }, [df, panel.variables]);

  // Paint orchestration
  const paintHandle = useRef<number | null>(null);

  const requestPaint = () => {
    if (paintHandle.current != null) return;
    paintHandle.current = requestAnimationFrame(() => {
      paintHandle.current = null;
      paint();
    });
  };

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!df) return;
    const { w, h } = sizeRef.current;
    if (w < 1 || h < 1) return;

    const n = panel.variables.length;
    const layout = computeLayout(w, h, n);
    const visual: VisualState = {
      color: colors,
      alpha,
      selected: selection.mask,
      paint: selection.paint,
      shape: selection.shape,
      shadow: selection.shadow,
      paintPalette,
    };

    const activeBrushCell =
      brush.activePanelId === panel.id ? activeDragCell.current : null;
    const activeBrushOverlay =
      brush.activePanelId === panel.id
        ? { tool: brush.tool, rect: brush.activeRect, path: brush.activePath }
        : null;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cell = layout.cells[i]![j]!;
        if (i === j) {
          drawDiagonal(ctx, cell, panel.variables[i]!);
          continue;
        }
        const xCol = cols[j];
        const yCol = cols[i];
        if (!xCol || !yCol) {
          // can't draw — at least draw the frame
          ctx.strokeStyle = "#2a2a2a";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);
          continue;
        }

        const isActiveCell =
          activeBrushCell !== null &&
          activeBrushCell.i === i &&
          activeBrushCell.j === j;

        drawCell(
          ctx,
          cell,
          xCol.values,
          xCol.missing.buffer,
          yCol.values,
          yCol.missing.buffer,
          visual,
          isActiveCell ? activeBrushOverlay : null,
          edgeOverlay,
        );

        // Build kd-tree lazily
        const key = `${i},${j}`;
        if (!treeCache.current.has(key)) {
          const xy = cellPixelPositions(
            cell,
            xCol.values,
            xCol.missing.buffer,
            yCol.values,
            yCol.missing.buffer,
          );
          try {
            // Filter out NaN rows before building tree
            const validCount = xy.reduce((acc, _, idx) => idx % 2 === 0 ? (!isNaN(xy[idx]!) ? acc + 1 : acc) : acc, 0);
            if (validCount > 0) {
              treeCache.current.set(key, new KdTree2D(xy));
            }
          } catch {
            // ignore — kd-tree build can fail on degenerate data
          }
        }
      }
    }
  };

  // Resize observer
  useEffect(() => {
    const body = bodyRef.current;
    const canvas = canvasRef.current;
    if (!body || !canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = body.getBoundingClientRect();
      const cssW = Math.max(1, Math.floor(rect.width));
      const cssH = Math.max(1, Math.floor(rect.height));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: cssW, h: cssH };
      // Invalidate kd-tree cache on resize (pixel positions change)
      treeCache.current.clear();
      requestPaint();
    });
    ro.observe(body);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-paint when visual state changes
  useEffect(() => {
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [df, cols, colors, selection, brush.activeRect, brush.activePath, brush.activePanelId, brush.tool, paintPalette, edgeOverlay, alpha]);

  // Track which cell the current drag started in
  const activeDragCell = useRef<{ i: number; j: number } | null>(null);
  const dragRef = useRef<{
    x0: number;
    y0: number;
    tool: typeof brush.tool;
    path: Point2D[] | null;
    localMask: Uint8Array;
  } | null>(null);

  const getCellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): { i: number; j: number; layout: ScatmatLayout } | null => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { w, h } = sizeRef.current;
    const n = panel.variables.length;
    const layout = computeLayout(w, h, n);
    const cell = hitCell(layout, px, py);
    if (!cell) return null;
    return { ...cell, layout };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== "brush") return;
    if (!df) return;
    const hit = getCellFromEvent(e);
    if (!hit || hit.i === hit.j) return; // skip diagonal
    const canvas = e.currentTarget as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;
    activeDragCell.current = { i: hit.i, j: hit.j };
    const local = new Uint8Array(Math.ceil(df.nrow / 8));
    const path = brush.tool === "lasso" ? [{ x, y }] : null;
    dragRef.current = { x0: x, y0: y, tool: brush.tool, path, localMask: local };
    setActiveBrush(panel.id, { x0: x, y0: y, x1: x, y1: y }, path);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    if (activeTool === "identify" && df) {
      const hit = getCellFromEvent(e);
      if (hit && hit.i !== hit.j) {
        const key = `${hit.i},${hit.j}`;
        const tree = treeCache.current.get(key);
        if (tree) {
          const rowIdx = tree.nearest(x, y);
          if (rowIdx >= 0) {
            const xVar = panel.variables[hit.j]!;
            const yVar = panel.variables[hit.i]!;
            const xCol = cols[hit.j];
            const yCol = cols[hit.i];
            const xv = xCol ? xCol.values[rowIdx] : "?";
            const yv = yCol ? yCol.values[rowIdx] : "?";
            setTip({
              text: `row ${rowIdx + 1}: ${xVar}=${xv}, ${yVar}=${yv}`,
              px: x + 8,
              py: y + 8,
            });
            return;
          }
        }
      }
      setTip(null);
      return;
    }

    if (activeTool !== "brush") return;
    if (!dragRef.current || !df || !activeDragCell.current) return;
    const { i, j } = activeDragCell.current;
    const key = `${i},${j}`;
    const tree = treeCache.current.get(key);
    if (!tree) return;

    const drag = dragRef.current;
    const rect = { x0: drag.x0, y0: drag.y0, x1: x, y1: y };

    drag.localMask.fill(0);
    let hits: Int32Array;
    if (drag.tool === "lasso") {
      const path = appendLassoPoint(drag.path ?? [], { x, y });
      drag.path = path;
      hits = pointsInPolygon(tree, path);
      setActiveBrush(panel.id, pathBounds(path), path);
    } else if (drag.tool === "ellipse") {
      hits = pointsInEllipse(tree, rect);
      setActiveBrush(panel.id, rect);
    } else {
      hits = pointsInRect(tree, rect);
      setActiveBrush(panel.id, rect);
    }
    for (let k = 0; k < hits.length; k++) bitSet(drag.localMask, hits[k]!);

    setSelectionMask(new Uint8Array(drag.localMask));
  };

  const onMouseUp = () => {
    if (activeTool !== "brush") return;
    if (!dragRef.current || !df) {
      setActiveBrush(null, null);
      activeDragCell.current = null;
      return;
    }
    if (brush.mode === "persistent") {
      const nextPaint = new Uint8Array(selection.paint);
      const nextShape = new Uint8Array(selection.shape);
      for (let i = 0; i < df.nrow; i++) {
        if (bitGet(dragRef.current.localMask, i)) {
          nextPaint[i] = brush.paintColor;
          nextShape[i] = brush.paintShape;
        }
      }
      setSelectionPaint(nextPaint);
      setSelectionShape(nextShape);
    }
    setSelectionMask(new Uint8Array(Math.ceil(df.nrow / 8)));
    dragRef.current = null;
    activeDragCell.current = null;
    setActiveBrush(null, null);
  };

  const onMouseLeave = () => {
    setTip(null);
    if (dragRef.current) onMouseUp();
  };

  // Header label
  const headerLabel = (() => {
    const joined = "scatmat: " + panel.variables.join(", ");
    return joined.length > 60 ? joined.slice(0, 58) + "…" : joined;
  })();

  return (
    <div className="plot-card" data-tool={activeTool} ref={cardRef}>
      <div className="plot-head">
        <span className="vars">{headerLabel}</span>
        <label className="plot-slider">
          <span>Alpha</span>
          <input
            className="alpha-slider"
            type="range"
            min={0.02}
            max={1}
            step={0.02}
            value={alpha}
            onChange={(e) => setAlpha(parseFloat(e.currentTarget.value))}
            title="point alpha"
            aria-label="scatmat alpha"
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
        />
      </div>
      {tip && (
        <div className="plot-tooltip" style={{ left: tip.px, top: tip.py }}>
          {tip.text}
        </div>
      )}
    </div>
  );
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

function blendHex(a: string, b: string): string {
  const ra = parseInt(a.slice(1, 3), 16);
  const ga = parseInt(a.slice(3, 5), 16);
  const ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16);
  const gb = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round((ra + rb) / 2);
  const g = Math.round((ga + gb) / 2);
  const bv = Math.round((ba + bb) / 2);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + bv).toString(16).slice(1);
}
