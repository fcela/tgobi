import { useEffect, useMemo, useRef, useState } from "react";
import type { ParcoordsPanel } from "@/store/types";
import { useAppStore } from "@/store";
import { bitGet, bitSet } from "@/lib/brush/hitTest";
import { formatRowLabel } from "@/lib/data/format";
import { resolveScaledValues } from "@/lib/data/resolveScaling";
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
  type ParcoordsLayout,
} from "@/plots/parcoords/parcoordsRender";

const FIXED_FALLBACK = "#88c";
const FACET_LABEL_H = 18;
const FACET_GAP = 4;

export interface ParcoordsProps {
  panel: ParcoordsPanel;
}

export function Parcoords({ panel }: ParcoordsProps) {
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
  const setParcoordsCondVar = useAppStore((s) => s.setParcoordsCondVar);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ReglParcoordsRenderer | null>(null);

  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const [tip, setTip] = useState<{ text: string; px: number; py: number } | null>(null);
  const [alpha, setAlpha] = useState<number | null>(null);
  const [labels, setLabels] = useState<PinnedLabel[]>([]);

  const condActive = !!panel.condVar;

  // Resolved columns for each variable in panel.variables, with scaling applied
  const cols = useMemo(() => {
    if (!df) return [];
    return panel.variables.map((v) => {
      const c = df.column(v);
      if (!c || (c.type !== "numeric" && c.type !== "integer")) return null;
      const vs = spec.find((s) => s.name === v);
      const resolved = resolveScaledValues(c, vs);
      return { type: c.type as "numeric" | "integer", name: c.name, length: c.length, values: resolved.values, missing: { buffer: resolved.missingBuffer, isMissing: c.missing.isMissing.bind(c.missing) } };
    });
  }, [df, panel.variables, spec]);

  // Categorical variable names for the condVar dropdown
  const categoricalVars = useMemo(() => {
    if (!df) return [];
    return df.columns.filter((c) => c.type === "categorical").map((c) => c.name);
  }, [df]);

  // Conditioning column info (levels and codes)
  const condColInfo = useMemo(() => {
    if (!df || !panel.condVar) return null;
    const c = df.column(panel.condVar);
    if (!c || c.type !== "categorical") return null;
    return { levels: c.levels, codes: c.codes, missing: c.missing };
  }, [df, panel.condVar]);

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
    paintHandle.current = -1;
    const handle = requestAnimationFrame(() => {
      paintHandle.current = null;
      paint();
    });
    if (paintHandle.current === -1) paintHandle.current = handle;
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

    // Compute data ranges for each axis (shared across facets)
    const ranges = cols.map((col) => {
      if (!col) return { min: 0, max: 1 };
      return dataRange(col.values, col.missing.buffer);
    });

    const renderCols = cols.map((c) =>
      c ? { values: c.values, missing: c.missing.buffer } : null,
    );

    const activeBrushAxis =
      brush.activePanelId === panel.id ? activeDragAxis.current : null;
    const activeBrushY =
      brush.activePanelId === panel.id && brush.activeRect
        ? { y0: brush.activeRect.y0, y1: brush.activeRect.y1 }
        : null;

    // --- Conditional mode: faceted Canvas2D ---
    if (panel.condVar && condColInfo) {
      // Detach Regl renderer if present
      if (rendererRef.current) {
        rendererRef.current.detach();
        rendererRef.current = null;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const levels = condColInfo.levels;
      const nLevels = levels.length;
      if (nLevels === 0) {
        ctx.clearRect(0, 0, w, h);
        return;
      }

      const totalGaps = (nLevels - 1) * FACET_GAP + nLevels * FACET_LABEL_H;
      const facetH = Math.max(40, Math.floor((h - totalGaps) / nLevels));

      ctx.clearRect(0, 0, w, h);

      let yOff = 0;
      for (let li = 0; li < nLevels; li++) {
        // Draw facet label
        ctx.fillStyle = "#aaa";
        ctx.font = "10px \"Space Grotesk\", ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(levels[li]!, 4, yOff + 2);
        yOff += FACET_LABEL_H;

        // Build modified shadow: mark rows NOT in this level as shadowed
        const facetShadow = new Uint8Array(selection.shadow.length);
        const baseShadow = selection.shadow;
        const codes = condColInfo.codes;
        const condMissing = condColInfo.missing;
        for (let i = 0; i < df.nrow; i++) {
          const condMissingRow = condMissing.isMissing(i);
          const inLevel = !condMissingRow && codes[i] === li;
          if (!inLevel || bitGet(baseShadow, i)) {
            bitSet(facetShadow, i);
          }
        }

        const facetLayout = computeLayout(w, facetH, nAxes, ranges);

        const facetVisual: VisualState = {
          color: colors,
          alpha: alpha ?? defaultParcoordsAlpha(df.nrow),
          selected: selection.mask,
          paint: selection.paint,
          shadow: facetShadow,
          paintPalette,
        };

        ctx.save();
        ctx.translate(0, yOff);

        // Clip to facet region
        ctx.beginPath();
        ctx.rect(0, 0, w, facetH);
        ctx.clip();

        drawParcoords(ctx, w, facetH, panel.variables, renderCols, facetLayout, facetVisual, activeBrushAxis, activeBrushY);

        ctx.restore();

        // Draw separator line below this facet
        yOff += facetH;
        if (li < nLevels - 1) {
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, yOff + FACET_GAP / 2);
          ctx.lineTo(w, yOff + FACET_GAP / 2);
          ctx.stroke();
          yOff += FACET_GAP;
        }
      }

      // Update yPxRef for identify in conditional mode
      // Use the full layout for the first facet as a rough approximation
      const fullLayout = computeLayout(w, facetH, nAxes, ranges);
      const yPx: Float64Array[] = fullLayout.axes.map((ax, k) => {
        const col = cols[k];
        const arr = new Float64Array(df.nrow);
        if (!col) { arr.fill(NaN); return arr; }
        for (let i = 0; i < df.nrow; i++) {
          if (bitGet(col.missing.buffer, i)) { arr[i] = NaN; continue; }
          arr[i] = dataToY(col.values[i]!, ax.min, ax.max, fullLayout.plotTop, fullLayout.plotH);
        }
        return arr;
      });
      yPxRef.current = yPx;

      return;
    }

    // --- Normal (non-conditional) mode ---
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
    updatePinnedLabels(layout, yPx);

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

  // Initialize renderer (only when NOT in conditional mode)
  useEffect(() => {
    if (condActive) {
      if (rendererRef.current) {
        rendererRef.current.detach();
        rendererRef.current = null;
      }
      requestPaint();
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Only create Regl renderer if not already present
    if (rendererRef.current) {
      requestPaint();
      return;
    }
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
  }, [condActive]);

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
  }, [df, cols, colors, selection, brush.activeRect, brush.activePanelId, paintPalette, alpha, pinnedRows, labelVar, condColInfo]);

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

  const getLayoutForEvent = (): { layout: ParcoordsLayout; facetH: number; facetYOff: number } | null => {
    if (!df) return null;
    const { w, h } = sizeRef.current;
    const nAxes = panel.variables.length;
    const ranges = cols.map((col) => {
      if (!col) return { min: 0, max: 1 };
      return dataRange(col.values, col.missing.buffer);
    });

    if (panel.condVar && condColInfo) {
      const levels = condColInfo.levels;
      const nLevels = levels.length;
      if (nLevels === 0) return null;
      const totalGaps = (nLevels - 1) * FACET_GAP + nLevels * FACET_LABEL_H;
      const facetH = Math.max(40, Math.floor((h - totalGaps) / nLevels));
      const layout = computeLayout(w, facetH, nAxes, ranges);
      return { layout, facetH, facetYOff: -1 };
    }

    const layout = computeLayout(w, h, nAxes, ranges);
    return { layout, facetH: h, facetYOff: 0 };
  };

  const getAxisFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): number | null => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const info = getLayoutForEvent();
    if (!info) return null;
    return hitAxis(info.layout.axes, px);
  };

  const identifyRowAt = (px: number, py: number): number => {
    if (!df) return -1;
    const { w, h } = sizeRef.current;
    const nAxes = panel.variables.length;
    const nRows = df.nrow;
    const ranges = cols.map((col) => {
      if (!col) return { min: 0, max: 1 };
      return dataRange(col.values, col.missing.buffer);
    });

    if (panel.condVar && condColInfo) {
      const levels = condColInfo.levels;
      const nLevels = levels.length;
      if (nLevels === 0) return -1;
      const totalGaps = (nLevels - 1) * FACET_GAP + nLevels * FACET_LABEL_H;
      const facetH = Math.max(40, Math.floor((h - totalGaps) / nLevels));
      const facetLayout = computeLayout(w, facetH, nAxes, ranges);

      // Determine which facet the py falls into
      let yOff = 0;
      for (let li = 0; li < nLevels; li++) {
        yOff += FACET_LABEL_H;
        const facetTop = yOff;
        const facetBot = yOff + facetH;
        if (py >= facetTop && py <= facetBot) {
          const localPy = py - facetTop;
          const facetYPx: Float64Array[] = facetLayout.axes.map((ax, k) => {
            const col = cols[k];
            const arr = new Float64Array(nRows);
            if (!col) { arr.fill(NaN); return arr; }
            for (let i = 0; i < nRows; i++) {
              if (bitGet(col.missing.buffer, i)) { arr[i] = NaN; continue; }
              const condMissingRow = condColInfo.missing.isMissing(i);
              if (condMissingRow || condColInfo.codes[i] !== li) { arr[i] = NaN; continue; }
              arr[i] = dataToY(col.values[i]!, ax.min, ax.max, facetLayout.plotTop, facetLayout.plotH);
            }
            return arr;
          });
          const row = identifyRow(px, localPy, facetLayout.axes, facetYPx, nRows, nAxes);
          return row;
        }
        yOff += facetH + FACET_GAP;
      }
      return -1;
    }

    const layout = computeLayout(w, h, nAxes, ranges);
    const yPx = yPxRef.current;
    if (yPx.length !== nAxes || nRows <= 0) return -1;
    return identifyRow(px, py, layout.axes, yPx, nRows, nAxes);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === "identify") {
      const canvas = e.currentTarget as HTMLCanvasElement;
      const canvasRect = canvas.getBoundingClientRect();
      const px = e.clientX - canvasRect.left;
      const py = e.clientY - canvasRect.top;
      const rowIdx = identifyRowAt(px, py);
      if (rowIdx >= 0) {
        setIdentifyHover(rowIdx);
        togglePinnedIdentify(rowIdx);
      }
      return;
    }
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

    const info = getLayoutForEvent();
    if (!info) return;
    const ax = info.layout.axes[axisIdx];
    const axX = ax ? ax.x : 0;

    if (panel.condVar && condColInfo) {
      const facetY = computeFacetYOffset(y, condColInfo.levels.length, info.facetH);
      if (facetY) {
        setActiveBrush(panel.id, { x0: axX, y0: facetY.localY, x1: axX, y1: facetY.localY });
      }
    } else {
      setActiveBrush(panel.id, { x0: axX, y0: y, x1: axX, y1: y });
    }
    clearWindowMouseUp();
    const onGlobalUp = () => finishBrush();
    windowMouseUpRef.current = onGlobalUp;
    window.addEventListener("mouseup", onGlobalUp);
  };

  const computeFacetYOffset = (canvasY: number, nLevels: number, facetH: number): { facetIdx: number; localY: number } | null => {
    let yOff = 0;
    for (let li = 0; li < nLevels; li++) {
      yOff += FACET_LABEL_H;
      const facetTop = yOff;
      const facetBot = yOff + facetH;
      if (canvasY >= facetTop && canvasY <= facetBot) {
        return { facetIdx: li, localY: canvasY - facetTop };
      }
      yOff += facetH + FACET_GAP;
    }
    return null;
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const px = e.clientX - canvasRect.left;
    const py = e.clientY - canvasRect.top;

    if (activeTool === "identify" && df) {
      const rowIdx = identifyRowAt(px, py);
      if (rowIdx >= 0) {
        setIdentifyHover(rowIdx);
        const parts = panel.variables.map((v, k) => {
          const col = cols[k];
          const val = col && !bitGet(col.missing.buffer, rowIdx) ? col.values[rowIdx] : "?";
          return `${v}=${val}`;
        });
        setTip({ text: `row ${rowIdx + 1}: ${parts.join(", ")}`, px: px + 8, py: py + 8 });
        return;
      }
      setIdentifyHover(null);
      setTip(null);
      return;
    }

    if (activeTool !== "brush") return;
    if (!dragRef.current || !df || activeDragAxis.current === null) return;

    const info = getLayoutForEvent();
    if (!info) return;
    const axIdx = activeDragAxis.current;
    const ax = info.layout.axes[axIdx];
    if (!ax) return;

    const drag = dragRef.current;
    const y0 = Math.min(drag.y0, py);
    const y1 = Math.max(drag.y0, py);

    if (panel.condVar && condColInfo) {
      const nLevels = condColInfo.levels.length;
      const totalGaps = (nLevels - 1) * FACET_GAP + nLevels * FACET_LABEL_H;
      const facetH = Math.max(40, Math.floor((sizeRef.current.h - totalGaps) / nLevels));

      const facetInfo = computeFacetYOffset(drag.y0, nLevels, facetH);
      if (facetInfo) {
        const facetYBase = FACET_LABEL_H + facetInfo.facetIdx * (facetH + FACET_GAP + FACET_LABEL_H);
        const localY0 = Math.min(facetInfo.localY, py - facetYBase);
        const localY1 = Math.max(facetInfo.localY, py - facetYBase);
        const clampedY0 = Math.max(0, Math.min(localY0, facetH));
        const clampedY1 = Math.max(0, Math.min(localY1, facetH));

        const col = cols[axIdx];
        const newMask = brushAxisRange(
          ax,
          col ? { values: col.values, missing: col.missing.buffer } : null,
          clampedY0,
          clampedY1,
          info.layout.plotTop,
          info.layout.plotH,
          df.nrow,
        );

        const codes = condColInfo.codes;
        const condMissing = condColInfo.missing;
        const filteredMask = new Uint8Array(newMask);
        for (let i = 0; i < df.nrow; i++) {
          if (bitGet(filteredMask, i)) {
            const condMissingRow = condMissing.isMissing(i);
            if (condMissingRow || codes[i] !== facetInfo.facetIdx) {
              filteredMask[i >> 3] = filteredMask[i >> 3]! & ~(1 << (i & 7));
            }
          }
        }

        drag.localMask = filteredMask;
        setSelectionMask(new Uint8Array(filteredMask));
      }
      setActiveBrush(panel.id, { x0: ax.x, y0: drag.y0, x1: ax.x, y1: py });
      return;
    }

    const col = cols[axIdx];
    const newMask = brushAxisRange(
      ax,
      col ? { values: col.values, missing: col.missing.buffer } : null,
      y0,
      y1,
      info.layout.plotTop,
      info.layout.plotH,
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
    setIdentifyHover(null);
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
        <select
          className="parcoords-cond-select"
          value={panel.condVar ?? ""}
          onChange={(e) => setParcoordsCondVar(panel.id, e.target.value || null)}
          aria-label="conditioning variable"
          title="conditioning variable"
        >
          <option value="">—</option>
          {categoricalVars.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
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
        {labels.map((label) => (
          <div
            key={label.row}
            className="plot-label"
            data-testid={`pinned-parcoords-label-${label.row}`}
            style={{ left: label.x, top: label.y }}
          >
            {label.label}
          </div>
        ))}
      </div>
      {tip && (
        <div className="plot-tooltip" style={{ left: tip.px, top: tip.py }}>
          {tip.text}
        </div>
      )}
    </div>
  );

  function updatePinnedLabels(
    layout: ReturnType<typeof computeLayout>,
    yPx: ReadonlyArray<Float64Array>,
  ) {
    if (!df) return;
    const lastAxis = layout.axes[layout.axes.length - 1];
    if (!lastAxis) {
      setLabels((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const { w, h } = sizeRef.current;
    const left = Math.max(2, Math.min(lastAxis.x + 8, Math.max(2, w - 148)));
    const axisY = yPx[layout.axes.length - 1];
    const next: PinnedLabel[] = [];
    for (let row = 0; row < df.nrow; row++) {
      if (!bitGet(pinnedRows, row)) continue;
      const y = axisY?.[row];
      if (y == null || Number.isNaN(y)) continue;
      next.push({
        row,
        x: left,
        y: Math.max(8, Math.min(y, h - 8)),
        label: formatRowLabel(df, row, labelVar),
      });
    }
    setLabels((prev) => samePinnedLabels(prev, next) ? prev : next);
  }
}

function defaultParcoordsAlpha(nRows: number): number {
  if (nRows > 50000) {
    return Math.max(0.08, PARCOORDS_DEFAULT_LINE_ALPHA * Math.sqrt(50000 / nRows));
  }
  return PARCOORDS_DEFAULT_LINE_ALPHA;
}

interface PinnedLabel {
  row: number;
  x: number;
  y: number;
  label: string;
}

function samePinnedLabels(a: ReadonlyArray<PinnedLabel>, b: ReadonlyArray<PinnedLabel>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.row !== y.row || x.x !== y.x || x.y !== y.y || x.label !== y.label) return false;
  }
  return true;
}
