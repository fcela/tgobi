import { useEffect, useMemo, useRef, useState } from "react";
import type { AndrewsPanel } from "@/store/types";
import { useAppStore } from "@/store";
import { bitGet } from "@/lib/brush/hitTest";
import { formatRowLabel } from "@/lib/data/format";
import { resolveScaledValues } from "@/lib/data/resolveScaling";
import { categoricalScale, sequentialScale, divergingScale } from "@/lib/color/scales";
import { getPalette } from "@/lib/color/palettes";
import {
  computeAndrewsValues,
  computeLayout,
  drawAndrews,
  identifyRow,
  ANDREWS_DEFAULT_LINE_ALPHA,
  type VisualState,
} from "@/plots/andrews/andrewsRender";

const FIXED_FALLBACK = "#88c";

export interface AndrewsProps {
  panel: AndrewsPanel;
}

export function Andrews({ panel }: AndrewsProps) {
  const df = useAppStore((s) => s.df);
  const spec = useAppStore((s) => s.spec);
  const selection = useAppStore((s) => s.selection);
  const colorState = useAppStore((s) => s.color);
  const brush = useAppStore((s) => s.brush);
  const activeTool = useAppStore((s) => s.tools.active);
  const pinnedRows = useAppStore((s) => s.tools.pinnedRows);
  const labelVar = useAppStore((s) => s.tools.labelVar);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const setSelectionShape = useAppStore((s) => s.setSelectionShape);
  const setIdentifyHover = useAppStore((s) => s.setIdentifyHover);
  const togglePinnedIdentify = useAppStore((s) => s.togglePinnedIdentify);
  const removePanel = useAppStore((s) => s.removePanel);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const [tip, setTip] = useState<{ text: string; px: number; py: number } | null>(null);
  const [alpha, setAlpha] = useState<number | null>(null);
  const [labels, setLabels] = useState<PinnedLabel[]>([]);

  const cols = useMemo(() => {
    if (!df) return [];
    return panel.variables.map((v) => {
      const c = df.column(v);
      if (!c || (c.type !== "numeric" && c.type !== "integer")) return null;
      const vs = spec.find((s) => s.name === v);
      const resolved = resolveScaledValues(c, vs);
      return {
        type: c.type as "numeric" | "integer",
        name: c.name,
        length: c.length,
        values: resolved.values,
        missing: { buffer: resolved.missingBuffer, isMissing: c.missing.isMissing.bind(c.missing) },
      };
    });
  }, [df, panel.variables, spec]);

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

  const yAllRef = useRef<Float64Array | null>(null);
  const layoutRef = useRef<{ yMin: number; yMax: number }>({ yMin: -1, yMax: 1 });

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas || !df) return;
    const { w, h } = sizeRef.current;
    if (w < 1 || h < 1) return;

    const renderCols = cols.map((c) =>
      c ? { values: c.values, missing: c.missing.buffer } : null,
    );

    const { yAll, yMin, yMax } = computeAndrewsValues(
      renderCols,
      panel.resolution,
      df.nrow,
    );
    yAllRef.current = yAll;
    layoutRef.current = { yMin, yMax };

    const layout = computeLayout(w, h, yMin, yMax);

    const visual: VisualState = {
      color: colors,
      alpha: alpha ?? defaultAndrewsAlpha(df.nrow),
      selected: selection.mask,
      paint: selection.paint,
      shadow: selection.shadow,
      paintPalette,
    };

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawAndrews(ctx, w, h, panel.variables, renderCols, panel.resolution, yAll, layout, visual);

    updatePinnedLabels(layout);
  };

  useEffect(() => {
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    const canvas = canvasRef.current;
    if (!body || !canvas) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const cssW = Math.max(
        1,
        Math.floor(
          entry?.contentBoxSize[0]?.inlineSize ??
            entry?.contentRect.width ??
            body.getBoundingClientRect().width,
        ),
      );
      const cssH = Math.max(
        1,
        Math.floor(
          entry?.contentBoxSize[0]?.blockSize ??
            entry?.contentRect.height ??
            body.getBoundingClientRect().height,
        ),
      );
      const dpr = window.devicePixelRatio || 1;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: cssW, h: cssH };
      requestPaint();
    });
    ro.observe(body);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [df, cols, colors, selection, alpha, pinnedRows, labelVar]);

  const dragRef = useRef<{ mask: Uint8Array } | null>(null);
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

  const identifyRowAt = (px: number, py: number): number => {
    if (!df) return -1;
    const yAll = yAllRef.current;
    if (!yAll) return -1;
    const { w, h } = sizeRef.current;
    const layout = computeLayout(w, h, layoutRef.current.yMin, layoutRef.current.yMax);
    return identifyRow(px, py, yAll, panel.resolution, layout, df.nrow);
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
    if (activeTool !== "brush" || !df) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const px = e.clientX - canvasRect.left;
    const py = e.clientY - canvasRect.top;
    const rowIdx = identifyRowAt(px, py);
    if (rowIdx < 0) return;

    const mask = new Uint8Array(Math.ceil(df.nrow / 8));
    const byte = rowIdx >> 3;
    const bit = rowIdx & 7;
    mask[byte]! |= 1 << bit;
    setSelectionMask(mask);
    dragRef.current = { mask };

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
      const rowIdx = identifyRowAt(px, py);
      if (rowIdx >= 0) {
        setIdentifyHover(rowIdx);
        const parts = panel.variables.map((v) => {
          const col = df.column(v);
          const val =
            col && (col.type === "numeric" || col.type === "integer") && !col.missing.isMissing(rowIdx)
              ? col.values[rowIdx]
              : col?.type === "categorical"
                ? col.levels[col.codes[rowIdx]!]
                : "?";
          return `${v}=${val}`;
        });
        setTip({ text: `row ${rowIdx + 1}: ${parts.join(", ")}`, px: px + 8, py: py + 8 });
        return;
      }
      setIdentifyHover(null);
      setTip(null);
      return;
    }

    if (activeTool === "brush" && dragRef.current && df) {
      const rowIdx = identifyRowAt(px, py);
      if (rowIdx >= 0) {
        const byte = rowIdx >> 3;
        const bit = rowIdx & 7;
        if (!(dragRef.current.mask[byte]! & (1 << bit))) {
          dragRef.current.mask[byte]! |= 1 << bit;
          setSelectionMask(new Uint8Array(dragRef.current.mask));
        }
      }
    }
  };

  const finishBrush = () => {
    clearWindowMouseUp();
    if (!df || !dragRef.current) return;
    if (brush.mode === "persistent") {
      const nextPaint = new Uint8Array(selection.paint);
      const nextShape = new Uint8Array(selection.shape);
      for (let i = 0; i < df.nrow; i++) {
        if (bitGet(dragRef.current.mask, i)) {
          nextPaint[i] = brush.paintColor;
          nextShape[i] = brush.paintShape;
        }
      }
      setSelectionPaint(nextPaint);
      setSelectionShape(nextShape);
    }
    setSelectionMask(new Uint8Array(Math.ceil(df.nrow / 8)));
    dragRef.current = null;
  };

  const onMouseUp = () => {
    finishBrush();
  };

  const onMouseLeave = () => {
    setTip(null);
    setIdentifyHover(null);
  };

  const headerLabel = (() => {
    const joined = "andrews: " + panel.variables.join(", ");
    return joined.length > 60 ? joined.slice(0, 58) + "…" : joined;
  })();
  const sliderAlpha = alpha ?? defaultAndrewsAlpha(df?.nrow ?? 0);

  function updatePinnedLabels(layout: ReturnType<typeof computeLayout>) {
    if (!df || !yAllRef.current) return;
    const yAll = yAllRef.current;
    const res = panel.resolution;
    const midJ = Math.floor(res / 2);
    const next: PinnedLabel[] = [];
    for (let row = 0; row < df.nrow; row++) {
      if (!bitGet(pinnedRows, row)) continue;
      const midVal = yAll[row * res + midJ];
      if (midVal == null || Number.isNaN(midVal)) continue;
      const t0 = T_MIN;
      const x = layout.plotLeft + ((t0 - T_MIN) / (T_MAX - T_MIN)) * layout.plotW;
      const y = layout.plotBot - ((midVal - layout.yMin) / (layout.yMax - layout.yMin)) * layout.plotH;
      next.push({
        row,
        x: x + 4,
        y: Math.max(8, Math.min(y, layout.plotBot - 4)),
        label: formatRowLabel(df, row, labelVar),
      });
    }
    setLabels((prev) => (samePinnedLabels(prev, next) ? prev : next));
  }

  return (
    <div className="plot-card" data-tool={activeTool}>
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
        {labels.map((label) => (
          <div
            key={label.row}
            className="plot-label"
            data-testid={`pinned-andrews-label-${label.row}`}
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
}

const T_MIN = -Math.PI;
const T_MAX = Math.PI;

function defaultAndrewsAlpha(nRows: number): number {
  if (nRows > 50000) {
    return Math.max(0.08, ANDREWS_DEFAULT_LINE_ALPHA * Math.sqrt(50000 / nRows));
  }
  return ANDREWS_DEFAULT_LINE_ALPHA;
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
