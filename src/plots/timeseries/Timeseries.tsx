import { useEffect, useMemo, useRef, useState } from "react";
import type { TimeseriesPanel, EdgeColorMode } from "@/store/types";
import { useAppStore } from "@/store";
import { bitGet } from "@/lib/brush/hitTest";
import { formatRowLabel } from "@/lib/data/format";
import { resolveScaledValues } from "@/lib/data/resolveScaling";
import { categoricalScale, sequentialScale, divergingScale } from "@/lib/color/scales";
import { getPalette } from "@/lib/color/palettes";
import { TimeseriesRenderer } from "@/plots/timeseries/canvas2dRenderer";
import type { TimeseriesEdgeOverlay } from "@/plots/timeseries/canvas2dRenderer";

const FIXED_FALLBACK = "#88c";
const TIMESERIES_MARGIN = 28;
const HIT_RADIUS = 6;

interface PinnedLabel {
  row: number;
  text: string;
  px: number;
  py: number;
}

export interface TimeseriesProps {
  panel: TimeseriesPanel;
}

export function Timeseries({ panel }: TimeseriesProps) {
  const df = useAppStore((s) => s.df);
  const spec = useAppStore((s) => s.spec);
  const selection = useAppStore((s) => s.selection);
  const colorState = useAppStore((s) => s.color);
  const brush = useAppStore((s) => s.brush);
  const activeTool = useAppStore((s) => s.tools.active);
  const pinnedRows = useAppStore((s) => s.tools.pinnedRows);
  const labelVar = useAppStore((s) => s.tools.labelVar);
  const setActiveBrush = useAppStore((s) => s.setActiveBrush);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const setSelectionShape = useAppStore((s) => s.setSelectionShape);
  const setIdentifyHover = useAppStore((s) => s.setIdentifyHover);
  const togglePinnedIdentify = useAppStore((s) => s.togglePinnedIdentify);
  const removePanel = useAppStore((s) => s.removePanel);
  const setTimeseriesViewport = useAppStore((s) => s.setTimeseriesViewport);
  const edgesState = useAppStore((s) => s.edges);
  const connectRowsInOrder = useAppStore((s) => s.connectRowsInOrder);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<TimeseriesRenderer | null>(null);

  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [tip, setTip] = useState<{ text: string; px: number; py: number } | null>(null);
  const [labels, setLabels] = useState<PinnedLabel[]>([]);

  const xCol = useMemo(() => {
    if (!df) return null;
    const c = df.column(panel.x);
    if (!c || (c.type !== "numeric" && c.type !== "integer")) return null;
    const vs = spec.find((s) => s.name === panel.x);
    const resolved = resolveScaledValues(c, vs);
    return { values: resolved.values, missing: resolved.missingBuffer, n: c.length };
  }, [df, panel.x, spec]);

  const yCols = useMemo(() => {
    if (!df) return [];
    return panel.y.map((v) => {
      const c = df.column(v);
      if (!c || (c.type !== "numeric" && c.type !== "integer")) return null;
      const vs = spec.find((s) => s.name === v);
      const resolved = resolveScaledValues(c, vs);
      return { name: v, values: resolved.values, missing: resolved.missingBuffer };
    });
  }, [df, panel.y, spec]);

  const groupCol = useMemo(() => {
    if (!df || !panel.groupVar) return null;
    const c = df.column(panel.groupVar);
    if (!c || c.type !== "categorical") return null;
    return c;
  }, [df, panel.groupVar]);

  const n = df?.nrow ?? 0;

  const colors: ReadonlyArray<string> = useMemo(() => {
    if (!df) return [];
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
  }, [df, n, colorState.encoding, colorState.palette]);

  const paintPalette = useMemo(() => getPalette(colorState.palette), [colorState.palette]);

  const edgeOverlay: TimeseriesEdgeOverlay | null = useMemo(() => {
    if (!edgesState.visible || !edgesState.layer) return null;
    const layer = edgesState.layer;
    const nEdges = layer.source.length;
    const mode: EdgeColorMode = edgesState.colorMode;
    if (mode === "fixed" || nEdges === 0) {
      return { edges: layer, color: "#c7c7d8", alpha: edgesState.alpha, edgeMask: edgesState.selection.mask, edgePaint: edgesState.selection.paint };
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
        const paintIdx = edgesState.selection.paint[e] ?? 0;
        perEdge[e] = paintIdx > 0 ? (paintPalette[paintIdx - 1] ?? "#c7c7d8") : "#c7c7d8";
      }
    } else if (mode === "attribute") {
      const attrVar = edgesState.colorAttr;
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
    }
    return { edges: layer, color: "#c7c7d8", alpha: edgesState.alpha, perEdgeColors: perEdge, edgeMask: edgesState.selection.mask, edgePaint: edgesState.selection.paint };
  }, [edgesState.visible, edgesState.layer, edgesState.colorMode, edgesState.colorAttr, edgesState.alpha, edgesState.selection.mask, edgesState.selection.paint, colors, selection.paint, paintPalette, colorState.palette]);

  const paintHandle = useRef<number | null>(null);
  useEffect(() => {
    if (paintHandle.current != null) cancelAnimationFrame(paintHandle.current);
    paintHandle.current = requestAnimationFrame(() => {
      const r = rendererRef.current;
      if (!r || !xCol || yCols.length === 0) return;
      const firstY = yCols[0];
      if (!firstY) return;
      r.draw({
        color: colors,
        alpha: 0.7,
        pointSize: 3,
        selected: selection.mask,
        paint: selection.paint,
        shadow: selection.shadow,
        paintPalette,
        display: panel.display,
        ySeriesIndex: 0,
      }, edgeOverlay);
    });
    return () => {
      if (paintHandle.current != null) cancelAnimationFrame(paintHandle.current);
    };
  }, [colors, selection, paintPalette, xCol, yCols, panel.display, edgeOverlay]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const r = new TimeseriesRenderer();
    r.attach(canvasRef.current);
    rendererRef.current = r;
    return () => {
      r.detach();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !xCol || yCols.length === 0) return;
    const firstY = yCols[0];
    if (!firstY) return;
    r.setData(xCol.values, firstY.values, xCol.missing, firstY.missing, groupCol, panel.y);
    const vp = panel.viewport;
    if (vp) r.setViewport(vp);
  }, [xCol, yCols, groupCol, panel.viewport, panel.y]);

  useEffect(() => {
    const r = rendererRef.current;
    if (r) r.setSize(sizeRef.current.w, sizeRef.current.h);
  }, [sizeRef.current.w, sizeRef.current.h]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      sizeRef.current = { w: width, h: height };
      const dpr = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const r = rendererRef.current;
      if (r) r.setSize(width, height);
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!df) { setLabels([]); return; }
    const lbls: PinnedLabel[] = [];
    for (let i = 0; i < n; i++) {
      if (!bitGet(pinnedRows, i)) continue;
      const r = rendererRef.current;
      const xVals = xCol?.values;
      const yVals = yCols[0]?.values;
      if (!r || !xVals || !yVals) { lbls.push({ row: i, text: formatRowLabel(df, i, labelVar), px: 0, py: 0 }); continue; }
      const { x: px, y: py } = r.transform().toPx(xVals[i]!, yVals[i]!);
      lbls.push({ row: i, text: formatRowLabel(df, i, labelVar), px, py });
    }
    setLabels(lbls);
  }, [pinnedRows, df, labelVar, xCol, yCols, n]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const r = rendererRef.current;
    if (!r || !xCol || yCols.length === 0) return;
    const t = r.transform();

    if (activeTool === "identify") {
      let bestRow = -1;
      let bestDist = HIT_RADIUS * HIT_RADIUS;
      const xVals = xCol.values;
      const firstY = yCols[0];
      if (!firstY) return;
      const yVals = firstY.values;
      for (let i = 0; i < n; i++) {
        const { x, y } = t.toPx(xVals[i]!, yVals[i]!);
        const dx = px - x;
        const dy = py - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          bestRow = i;
        }
      }
      if (bestRow >= 0) {
        if (e.shiftKey) togglePinnedIdentify(bestRow);
        else setIdentifyHover(bestRow);
      }
      return;
    }

    if (activeTool === "brush") {
      setActiveBrush(panel.id, { x0: px, y0: py, x1: px, y1: py });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const r = rendererRef.current;
    if (!r || !xCol) return;

    if (activeTool === "identify") {
      if (e.buttons === 0) {
        let bestRow = -1;
        let bestDist = HIT_RADIUS * HIT_RADIUS;
        const xVals = xCol.values;
        const firstY = yCols[0];
        if (!firstY) return;
        const yVals = firstY.values;
        for (let i = 0; i < n; i++) {
          const { x, y } = r.transform().toPx(xVals[i]!, yVals[i]!);
          const dx = px - x;
          const dy = py - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestDist) {
            bestDist = d2;
            bestRow = i;
          }
        }
        if (bestRow >= 0 && df) {
          setTip({ text: formatRowLabel(df, bestRow, labelVar), px, py });
          setIdentifyHover(bestRow);
        } else {
          setTip(null);
          setIdentifyHover(null);
        }
      }
      return;
    }

    if (activeTool === "brush" && brush.activePanelId === panel.id && brush.activeRect) {
      const ar = brush.activeRect;
      setActiveBrush(panel.id, { x0: ar.x0, y0: ar.y0, x1: px, y1: py });

      const r2 = rendererRef.current;
      if (!r2 || !xCol || yCols.length === 0) return;
      const firstY = yCols[0];
      if (!firstY) return;
      const xVals = xCol.values;
      const yVals = firstY.values;
      const t = r2.transform();
      const mask = new Uint8Array(Math.ceil(n / 8));

      if (brush.tool === "rectangle") {
        const rx0 = Math.min(ar.x0, px);
        const ry0 = Math.min(ar.y0, py);
        const rx1 = Math.max(ar.x0, px);
        const ry1 = Math.max(ar.y0, py);
        for (let i = 0; i < n; i++) {
          const { x, y } = t.toPx(xVals[i]!, yVals[i]!);
          if (x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1) bitSet(mask, i);
        }
      }
      setSelectionMask(mask);
    }
  };

  const handleMouseUp = () => {
    if (activeTool === "brush" && brush.activePanelId === panel.id) {
      if (brush.mode === "persistent" && df) {
        const mask = selection.mask;
        const paint = new Uint8Array(selection.paint);
        const shape = new Uint8Array(selection.shape);
        for (let i = 0; i < n; i++) {
          if (bitGet(mask, i)) {
            paint[i] = 1;
            shape[i] = 1;
          }
        }
        setSelectionPaint(paint);
        setSelectionShape(shape);
      }
      setActiveBrush(null, null);
      setSelectionMask(new Uint8Array(Math.ceil(n / 8)));
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const r = rendererRef.current;
    if (!r) return;
    const vb = r.getViewBounds();
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    const xRange = vb.xMax - vb.xMin;
    const yRange = vb.yMax - vb.yMin;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const mx = (e.clientX - rect.left) / sizeRef.current.w;
    const my = 1 - (e.clientY - rect.top) / sizeRef.current.h;
    const cx = vb.xMin + mx * xRange;
    const cy = vb.yMin + my * yRange;
    const newXRange = xRange * factor;
    const newYRange = yRange * factor;
    setTimeseriesViewport(panel.id, {
      xMin: cx - mx * newXRange,
      xMax: cx + (1 - mx) * newXRange,
      yMin: cy - (1 - my) * newYRange,
      yMax: cy + my * newYRange,
    });
  };

  const isBrushActive = brush.activePanelId === panel.id;
  const activeRect = isBrushActive ? brush.activeRect : null;

  return (
    <div ref={cardRef} className="plot-card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="plot-head">
        <span className="vars">
          {panel.x} → {panel.y.join(", ")}
          {panel.groupVar ? ` (by ${panel.groupVar})` : ""}
        </span>
        <button
          className="panel-connect-btn"
          title="Connect rows in order (edge layer)"
          disabled={!df || df.nrow < 2}
          onClick={connectRowsInOrder}
        >Connect</button>
        <button className="close" onClick={() => removePanel(panel.id)} title="Close">×</button>
      </div>
      <div ref={bodyRef} className="plot-body" style={{ flex: 1, position: "relative", overflow: "hidden" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />
        {activeRect && (
          <div
            className="brush-overlay"
            style={{
              position: "absolute",
              left: Math.min(activeRect.x0, activeRect.x1),
              top: Math.min(activeRect.y0, activeRect.y1),
              width: Math.abs(activeRect.x1 - activeRect.x0),
              height: Math.abs(activeRect.y1 - activeRect.y0),
              border: "1.5px dashed rgba(100,100,200,0.6)",
              pointerEvents: "none",
            }}
          />
        )}
        {tip && (
          <div className="identify-tip" style={{ position: "absolute", left: tip.px + 8, top: tip.py - 8, pointerEvents: "none" }}>
            {tip.text}
          </div>
        )}
        {labels.map((l) => (
          <div key={l.row} className="pinned-label" style={{ position: "absolute", left: l.px + 6, top: l.py - 6, pointerEvents: "none" }}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function bitSet(mask: Uint8Array, i: number) {
  const byte = i >> 3;
  const bit = i & 7;
  mask[byte]! |= 1 << bit;
}

function blendHex(a: string, b: string): string {
  const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round((ra + rb) / 2);
  const g = Math.round((ga + gb) / 2);
  const bv = Math.round((ba + bb) / 2);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + bv).toString(16).slice(1);
}
