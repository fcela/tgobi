import { useEffect, useMemo, useRef, useState } from "react";
import type { BarchartPanel } from "@/store/types";
import type { Column, DataFrame } from "@/lib/data/types";
import { useAppStore } from "@/store";
import { bitGet, bitSet } from "@/lib/brush/hitTest";
import { getPalette } from "@/lib/color/palettes";

const WIDTH = 640;
const HEIGHT = 320;
const LEFT = 42;
const RIGHT = 14;
const TOP = 18;
const BOTTOM = 58;
const PLOT_W = WIDTH - LEFT - RIGHT;
const PLOT_H = HEIGHT - TOP - BOTTOM;

export interface BarchartProps {
  panel: BarchartPanel;
}

interface BarBucket {
  label: string;
  rows: number[];
  count: number;
  selected: number;
  shadowed: number;
  painted: Map<number, number>;
}

export function Barchart({ panel }: BarchartProps) {
  const df = useAppStore((s) => s.df);
  const selection = useAppStore((s) => s.selection);
  const brush = useAppStore((s) => s.brush);
  const activeTool = useAppStore((s) => s.tools.active);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const setSelectionShape = useAppStore((s) => s.setSelectionShape);
  const setBarchartBins = useAppStore((s) => s.setBarchartBins);
  const removePanel = useAppStore((s) => s.removePanel);
  const palette = useAppStore((s) => s.color.palette);
  const paintPalette = useMemo(() => getPalette(palette), [palette]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ start: number; mask: Uint8Array } | null>(null);
  const windowMouseUpRef = useRef<(() => void) | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (windowMouseUpRef.current) {
        window.removeEventListener("mouseup", windowMouseUpRef.current);
        windowMouseUpRef.current = null;
      }
    };
  }, []);

  const bars = useMemo(
    () => buildBars(df, panel.variable, panel.bins, selection),
    [df, panel.variable, panel.bins, selection],
  );
  const col = df?.column(panel.variable);
  const canBin = col?.type === "numeric" || col?.type === "integer" || col?.type === "date";
  const binValue = Math.max(1, Math.min(40, Math.floor(panel.bins)));
  const maxCount = Math.max(1, ...bars.map((b) => b.count));
  const barStep = bars.length > 0 ? PLOT_W / bars.length : PLOT_W;
  const gap = Math.min(8, Math.max(2, barStep * 0.18));

  const publishRange = (a: number, b: number): Uint8Array | null => {
    if (!df || bars.length === 0) return null;
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(bars.length - 1, Math.max(a, b));
    const mask = new Uint8Array(Math.ceil(df.nrow / 8));
    for (let i = lo; i <= hi; i++) {
      for (const row of bars[i]!.rows) bitSet(mask, row);
    }
    setSelectionMask(mask);
    return mask;
  };

  const barIndexForEvent = (e: React.MouseEvent<SVGSVGElement>): number | null => {
    const target = e.target as Element | null;
    const fromTarget = target?.closest("[data-bar-index]")?.getAttribute("data-bar-index");
    if (fromTarget != null) return Number(fromTarget);

    const svg = svgRef.current;
    if (!svg || bars.length === 0) return null;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / Math.max(1, box.width)) * WIDTH;
    const idx = Math.floor((x - LEFT) / barStep);
    if (idx < 0 || idx >= bars.length) return null;
    return idx;
  };

  const clearWindowMouseUp = () => {
    if (!windowMouseUpRef.current) return;
    window.removeEventListener("mouseup", windowMouseUpRef.current);
    windowMouseUpRef.current = null;
  };

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== "brush") return;
    const idx = barIndexForEvent(e);
    if (idx == null) return;
    const mask = publishRange(idx, idx);
    if (mask) dragRef.current = { start: idx, mask };
    clearWindowMouseUp();
    const onGlobalUp = () => finishBrush();
    windowMouseUpRef.current = onGlobalUp;
    window.addEventListener("mouseup", onGlobalUp);
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const idx = barIndexForEvent(e);
    if (idx == null) {
      setTip(null);
      return;
    }

    const bar = bars[idx]!;
    setTip({
      text: `${bar.label}: ${bar.count} rows`,
      x: e.clientX,
      y: e.clientY,
    });

    if (activeTool !== "brush" || !dragRef.current) return;
    const mask = publishRange(dragRef.current.start, idx);
    if (mask) dragRef.current.mask = mask;
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

  return (
    <div className="plot-card" data-tool={activeTool}>
      <div className="plot-head">
        <span className="vars">bar: {panel.variable}</span>
        {canBin && (
          <label className="bin-slider">
            <span>Bins {binValue}</span>
            <input
              type="range"
              min={1}
              max={40}
              step={1}
              value={binValue}
              aria-label={`bins for ${panel.variable}`}
              onChange={(e) => setBarchartBins(panel.id, Number(e.currentTarget.value))}
            />
          </label>
        )}
        <button
          className="close"
          aria-label={`remove plot ${panel.id}`}
          onClick={() => removePanel(panel.id)}
        >
          x
        </button>
      </div>
      {bars.length === 0 ? (
        <div className="plot-empty">No plottable values.</div>
      ) : (
        <div className="plot-body" ref={bodyRef}>
          <svg
            ref={svgRef}
            className="barchart"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`barchart ${panel.variable}`}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => {
              setTip(null);
            }}
          >
            <line className="axis" x1={LEFT} y1={TOP + PLOT_H} x2={WIDTH - RIGHT} y2={TOP + PLOT_H} />
            <line className="axis" x1={LEFT} y1={TOP} x2={LEFT} y2={TOP + PLOT_H} />
            {bars.map((bar, i) => {
              const fullH = (bar.count / maxCount) * PLOT_H;
              const selectedH = (bar.selected / maxCount) * PLOT_H;
              const shadowH = (bar.shadowed / maxCount) * PLOT_H;
              const x = LEFT + i * barStep + gap / 2;
              const w = Math.max(2, barStep - gap);
              const y = TOP + PLOT_H - fullH;
              const label = abbreviate(bar.label);
              const topPaint = dominantPaint(bar.painted);
              const paintColor = topPaint ? paintPalette[(topPaint - 1) % paintPalette.length] : null;
              return (
                <g key={`${bar.label}-${i}`}>
                  <rect
                    className="bar"
                    data-bar-index={i}
                    data-testid={`bar-${panel.variable}-${i}`}
                    x={x}
                    y={y}
                    width={w}
                    height={fullH}
                  />
                  {paintColor && (
                    <rect
                      className="bar-painted"
                      data-bar-index={i}
                      x={x}
                      y={y}
                      width={w}
                      height={fullH}
                      fill={paintColor}
                    />
                  )}
                  {shadowH > 0 && (
                    <rect
                      className="bar-shadowed"
                      data-bar-index={i}
                      x={x}
                      y={TOP + PLOT_H - shadowH}
                      width={w}
                      height={shadowH}
                    />
                  )}
                  {selectedH > 0 && (
                    <rect
                      className="bar-selected"
                      data-bar-index={i}
                      x={x}
                      y={TOP + PLOT_H - selectedH}
                      width={w}
                      height={selectedH}
                    />
                  )}
                  <text
                    className="bar-label"
                    x={x + w / 2}
                    y={TOP + PLOT_H + 16}
                    textAnchor="middle"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      {tip && <div className="plot-tooltip" style={{ left: tip.x + 8, top: tip.y + 8 }}>{tip.text}</div>}
    </div>
  );
}

function buildBars(
  df: DataFrame | null,
  variable: string,
  bins: number,
  selection: { mask: Uint8Array; paint: Uint8Array; shadow: Uint8Array },
): BarBucket[] {
  if (!df) return [];
  const col = df.column(variable);
  if (!col) return [];
  const rowsByLabel = bucketRows(df, col, bins);
  return rowsByLabel.map(([label, rows]) => {
    let selected = 0;
    let shadowed = 0;
    const painted = new Map<number, number>();
    for (const row of rows) {
      if (bitGet(selection.mask, row)) selected++;
      if (bitGet(selection.shadow, row)) shadowed++;
      const paint = selection.paint[row] ?? 0;
      if (paint > 0) painted.set(paint, (painted.get(paint) ?? 0) + 1);
    }
    return { label, rows, count: rows.length, selected, shadowed, painted };
  });
}

function bucketRows(df: DataFrame, col: Column, bins: number): Array<[string, number[]]> {
  if (col.type === "categorical") {
    const out = col.levels.map((level): [string, number[]] => [level, []]);
    const missing: number[] = [];
    for (let i = 0; i < df.nrow; i++) {
      if (col.missing.isMissing(i)) missing.push(i);
      else out[col.codes[i]!]![1].push(i);
    }
    if (missing.length > 0) out.push(["missing", missing]);
    return out.filter(([, rows]) => rows.length > 0);
  }

  if (col.type !== "numeric" && col.type !== "integer" && col.type !== "date") return [];

  const values: number[] = [];
  for (let i = 0; i < df.nrow; i++) {
    if (!col.missing.isMissing(i)) values.push(col.values[i]!);
  }
  if (values.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    const rows: number[] = [];
    for (let i = 0; i < df.nrow; i++) if (!col.missing.isMissing(i)) rows.push(i);
    return [[formatValue(min), rows]];
  }

  const binCount = Math.max(1, Math.min(40, Math.floor(bins)));
  const out: Array<[string, number[]]> = [];
  for (let b = 0; b < binCount; b++) {
    const lo = min + (b / binCount) * (max - min);
    const hi = min + ((b + 1) / binCount) * (max - min);
    out.push([`${formatValue(lo)}-${formatValue(hi)}`, []]);
  }
  for (let i = 0; i < df.nrow; i++) {
    if (col.missing.isMissing(i)) continue;
    const v = col.values[i]!;
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor(((v - min) / (max - min)) * binCount)));
    out[idx]![1].push(i);
  }
  return out.filter(([, rows]) => rows.length > 0);
}

function dominantPaint(painted: Map<number, number>): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const [paint, count] of painted) {
    if (count > bestCount) {
      best = paint;
      bestCount = count;
    }
  }
  return best;
}

function abbreviate(label: string): string {
  return label.length > 12 ? `${label.slice(0, 11)}...` : label;
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return v.toFixed(1).replace(/\.0$/, "");
  return v.toFixed(2).replace(/\.?0+$/, "");
}
