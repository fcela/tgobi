import { useEffect, useMemo, useRef, useState } from "react";
import type { ParcoordsPanel } from "@/store/types";
import { useAppStore } from "@/store";
import { bitGet } from "@/lib/brush/hitTest";
import { categoricalScale, sequentialScale, divergingScale } from "@/lib/color/scales";
import { getPalette } from "@/lib/color/palettes";
import { ReglParcoordsRenderer } from "@/plots/parcoords/reglParcoordsRenderer";
import {
  computeLayout,
  drawParcoords,
  hitAxis,
  brushAxisRange,
  identifyRow,
  dataRange,
  dataToY,
  PARCOORDS_DEFAULT_LINE_ALPHA,
  type VisualState,
} from "@/plots/parcoords/parcoordsRender";

const FIXED_FALLBACK = "#88c";

export interface ParcoordsProps {
  panel: ParcoordsPanel;
}

export function Parcoords({ panel }: ParcoordsProps) {
  const df = useAppStore((s) => s.df);
  const selection = useAppStore((s) => s.selection);
  const colorState = useAppStore((s) => s.color);
  const brush = useAppStore((s) => s.brush);
  const activeTool = useAppStore((s) => s.tools.active);
  const setActiveBrush = useAppStore((s) => s.setActiveBrush);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const setSelectionShape = useAppStore((s) => s.setSelectionShape);
  const removePanel = useAppStore((s) => s.removePanel);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ReglParcoordsRenderer | null>(null);

  // Canvas size in CSS pixels
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const [tip, setTip] = useState<{ text: string; px: number; py: number } | null>(null);
  const [alpha, setAlpha] = useState<number | null>(null);

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

  // Paint orchestration
  const paintHandle = useRef<number | null>(null);

  const requestPaint = () => {
    if (paintHandle.current != null) return;
    paintHandle.current = requestAnimationFrame(() => {
      paintHandle.current = null;
      paint();
    });
  };

  // Precomputed y-pixel arrays for identify — rebuilt each render
  const yPxRef = useRef<Float64Array[]>([]);

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!df) return;
    const { w, h } = sizeRef.current;
    if (w < 1 || h < 1) return;

    const nAxes = panel.variables.length;

    // Compute data ranges for each axis
    const ranges = cols.map((col) => {
      if (!col) return { min: 0, max: 1 };
      return dataRange(col.values, col.missing.buffer);
    });

    const layout = computeLayout(w, h, nAxes, ranges);

    const visual: VisualState = {
      color: colors,
      alpha: alpha ?? defaultParcoordsAlpha(df.nrow),
      selected: selection.mask,
      paint: selection.paint,
      shadow: selection.shadow,
      paintPalette,
    };

    // Build yPx for identify
    const nRows = df.nrow;
    const { axes, plotTop, plotH } = layout;
    const yPx: Float64Array[] = axes.map((ax, k) => {
      const col = cols[k];
      const arr = new Float64Array(nRows);
      if (!col) { arr.fill(NaN); return arr; }
      for (let i = 0; i < nRows; i++) {
        if (bitGet(col.missing.buffer, i)) { arr[i] = NaN; continue; }
        arr[i] = dataToY(col.values[i]!, ax.min, ax.max, plotTop, plotH);
      }
      return arr;
    });
    yPxRef.current = yPx;

    const activeBrushAxis =
      brush.activePanelId === panel.id ? activeDragAxis.current : null;
    const activeBrushY =
      brush.activePanelId === panel.id && brush.activeRect
        ? { y0: brush.activeRect.y0, y1: brush.activeRect.y1 }
        : null;

    const renderCols = cols.map((c) =>
      c ? { values: c.values, missing: c.missing.buffer } : null,
    );
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.draw({
        width: w,
        height: h,
        varNames: panel.variables,
        cols: renderCols,
        layout,
        visual,
        brushAxis: activeBrushAxis,
        brushY: activeBrushY,
      });
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawParcoords(ctx, w, h, panel.variables, renderCols, layout, visual, activeBrushAxis, activeBrushY);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const renderer = new ReglParcoordsRenderer();
      renderer.attach(canvas);
      rendererRef.current = renderer;
    } catch (err) {
      console.warn("[parcoords] WebGL not supported, falling back to Canvas2D.", err);
      rendererRef.current = null;
    }
    requestPaint();
    return () => {
      rendererRef.current?.detach();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize observer
  useEffect(() => {
    const body = bodyRef.current;
    const canvas = canvasRef.current;
    if (!body || !canvas) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const cssW = Math.max(
        1,
        Math.floor(entry?.contentBoxSize[0]?.inlineSize ?? entry?.contentRect.width ?? body.getBoundingClientRect().width),
      );
      const cssH = Math.max(
        1,
        Math.floor(entry?.contentBoxSize[0]?.blockSize ?? entry?.contentRect.height ?? body.getBoundingClientRect().height),
      );
      const dpr = window.devicePixelRatio || 1;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      if (rendererRef.current) {
        rendererRef.current.setSize(cssW, cssH);
      } else {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      sizeRef.current = { w: cssW, h: cssH };
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
  }, [df, cols, colors, selection, brush.activeRect, brush.activePanelId, paintPalette, alpha]);

  // Brush drag state
  const activeDragAxis = useRef<number | null>(null);
  const dragRef = useRef<{ y0: number; localMask: Uint8Array } | null>(null);
  const windowMouseUpRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (windowMouseUpRef.current) {
        window.removeEventListener("mouseup", windowMouseUpRef.current);
        windowMouseUpRef.current = null;
      }
    };
  }, []);

  const clearWindowMouseUp = () => {
    if (!windowMouseUpRef.current) return;
    window.removeEventListener("mouseup", windowMouseUpRef.current);
    windowMouseUpRef.current = null;
  };

  const getAxisFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): number | null => {
    if (!df) return null;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const { w, h } = sizeRef.current;
    const nAxes = panel.variables.length;
    const ranges = cols.map((col) => {
      if (!col) return { min: 0, max: 1 };
      return dataRange(col.values, col.missing.buffer);
    });
    const layout = computeLayout(w, h, nAxes, ranges);
    return hitAxis(layout.axes, px);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== "brush") return;
    if (!df) return;
    const axisIdx = getAxisFromEvent(e);
    if (axisIdx === null) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const y = e.clientY - canvasRect.top;
    activeDragAxis.current = axisIdx;
    const local = new Uint8Array(Math.ceil(df.nrow / 8));
    dragRef.current = { y0: y, localMask: local };
    // Use activeRect to store y range; x0/x1 are axis x (unused for parcoords brush display)
    const { w, h } = sizeRef.current;
    const nAxes = panel.variables.length;
    const ranges = cols.map((col) => {
      if (!col) return { min: 0, max: 1 };
      return dataRange(col.values, col.missing.buffer);
    });
    const layout = computeLayout(w, h, nAxes, ranges);
    const ax = layout.axes[axisIdx];
    const axX = ax ? ax.x : 0;
    // Store in brush store with x representing axis position
    setActiveBrush(panel.id, { x0: axX, y0: y, x1: axX, y1: y });
    clearWindowMouseUp();
    const onGlobalUp = () => finishBrush();
    windowMouseUpRef.current = onGlobalUp;
    window.addEventListener("mouseup", onGlobalUp);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const px = e.clientX - canvasRect.left;
    const py = e.clientY - canvasRect.top;

    if (activeTool === "identify" && df) {
      const { w, h } = sizeRef.current;
      const nAxes = panel.variables.length;
      const nRows = df.nrow;
      const ranges = cols.map((col) => {
        if (!col) return { min: 0, max: 1 };
        return dataRange(col.values, col.missing.buffer);
      });
      const layout = computeLayout(w, h, nAxes, ranges);
      const yPx = yPxRef.current;
      if (yPx.length === nAxes && nRows > 0) {
        const rowIdx = identifyRow(px, py, layout.axes, yPx, nRows, nAxes);
        if (rowIdx >= 0) {
          const parts = panel.variables.map((v, k) => {
            const col = cols[k];
            const val = col && !bitGet(col.missing.buffer, rowIdx) ? col.values[rowIdx] : "?";
            return `${v}=${val}`;
          });
          setTip({ text: `row ${rowIdx + 1}: ${parts.join(", ")}`, px: px + 8, py: py + 8 });
          return;
        }
      }
      setTip(null);
      return;
    }

    if (activeTool !== "brush") return;
    if (!dragRef.current || !df || activeDragAxis.current === null) return;

    const { w, h } = sizeRef.current;
    const nAxes = panel.variables.length;
    const ranges = cols.map((col) => {
      if (!col) return { min: 0, max: 1 };
      return dataRange(col.values, col.missing.buffer);
    });
    const layout = computeLayout(w, h, nAxes, ranges);
    const axIdx = activeDragAxis.current;
    const ax = layout.axes[axIdx];
    if (!ax) return;

    const drag = dragRef.current;
    const y0 = Math.min(drag.y0, py);
    const y1 = Math.max(drag.y0, py);

    const col = cols[axIdx];
    const newMask = brushAxisRange(
      ax,
      col ? { values: col.values, missing: col.missing.buffer } : null,
      y0,
      y1,
      layout.plotTop,
      layout.plotH,
      df.nrow,
    );
    drag.localMask = newMask;

    setSelectionMask(new Uint8Array(newMask));
    setActiveBrush(panel.id, { x0: ax.x, y0: drag.y0, x1: ax.x, y1: py });
  };

  const finishBrush = () => {
    clearWindowMouseUp();
    if (!dragRef.current || !df) {
      setActiveBrush(null, null);
      activeDragAxis.current = null;
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
    activeDragAxis.current = null;
    setActiveBrush(null, null);
  };

  const onMouseUp = () => {
    finishBrush();
  };

  const onMouseLeave = () => {
    setTip(null);
  };

  // Header label
  const headerLabel = (() => {
    const joined = "parcoords: " + panel.variables.join(", ");
    return joined.length > 60 ? joined.slice(0, 58) + "…" : joined;
  })();
  const sliderAlpha = alpha ?? defaultParcoordsAlpha(df?.nrow ?? 0);

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
            value={sliderAlpha}
            onChange={(e) => setAlpha(parseFloat(e.target.value))}
            title="line alpha"
            aria-label="line alpha"
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

function defaultParcoordsAlpha(nRows: number): number {
  if (nRows > 50000) {
    return Math.max(0.08, PARCOORDS_DEFAULT_LINE_ALPHA * Math.sqrt(50000 / nRows));
  }
  return PARCOORDS_DEFAULT_LINE_ALPHA;
}
