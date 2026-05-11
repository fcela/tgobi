import { useMemo, useRef, useState } from "react";
import type { BrushTool, DotplotPanel } from "@/store/types";
import type { Column, DataFrame } from "@/lib/data/types";
import { useAppStore } from "@/store";
import { bitGet, bitSet, pointInPolygon, type Point2D } from "@/lib/brush/hitTest";
import { getPalette } from "@/lib/color/palettes";
import { formatRowLabel } from "@/lib/data/format";

const WIDTH = 640;
const HEIGHT = 320;
const LEFT = 42;
const RIGHT = 14;
const TOP = 18;
const BOTTOM = 58;
const PLOT_W = WIDTH - LEFT - RIGHT;
const PLOT_H = HEIGHT - TOP - BOTTOM;
const DOT_R = 3;
const DOT_STEP = DOT_R * 2 + 1; // 7px centre-to-centre

export interface DotplotProps {
  panel: DotplotPanel;
}

interface DotBucket {
  label: string;
  rows: number[];
}

interface DotItem {
  row: number;
  bucketIdx: number;
  stackPos: number; // 0-based from bottom
  cx: number;
  cy: number;
  value: number;
}

export function Dotplot({ panel }: DotplotProps) {
  const df = useAppStore((s) => s.df);
  const selection = useAppStore((s) => s.selection);
  const pinnedRows = useAppStore((s) => s.tools.pinnedRows);
  const labelVar = useAppStore((s) => s.tools.labelVar);
  const brush = useAppStore((s) => s.brush);
  const activeTool = useAppStore((s) => s.tools.active);
  const setActiveBrush = useAppStore((s) => s.setActiveBrush);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const setSelectionShape = useAppStore((s) => s.setSelectionShape);
  const removePanel = useAppStore((s) => s.removePanel);
  const palette = useAppStore((s) => s.color.palette);
  const paintPalette = useMemo(() => getPalette(palette), [palette]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    x0: number;
    y0: number;
    tool: typeof brush.tool;
    path: Point2D[] | null;
    mask: Uint8Array;
  } | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const tour = useAppStore((s) => s.tour);
  const tourProj = useAppStore((s) => s.tour.proj);
  const tourActivePanelId = useAppStore((s) => s.tour.activePanelId);
  const tourShape = useAppStore((s) => s.tour.shape);

  const isTourActive =
    tourActivePanelId === panel.id &&
    tourShape === "1d" &&
    tourProj != null &&
    df != null &&
    tourProj.length === df.nrow;

  const { buckets, dots, isNumeric } = useMemo(() => {
    if (isTourActive && tourProj != null && df != null) {
      const n = df.nrow;
      const missing = new Uint8Array(Math.ceil(n / 8));
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(tourProj[i]!)) {
          missing[i >> 3] = (missing[i >> 3]! | (1 << (i & 7)));
        }
      }
      return buildDotsFromValues(tourProj, missing, n, panel.bins);
    }
    return buildDots(df, panel.variable, panel.bins);
  }, [df, panel.variable, panel.bins, isTourActive, tourProj]);

  const bucketStep = buckets.length > 0 ? PLOT_W / buckets.length : PLOT_W;
  const pinnedLabels = useMemo(() => {
    if (!df) return [];
    const dotByRow = new Map(dots.map((dot) => [dot.row, dot]));
    const labels: Array<{ row: number; x: number; y: number; label: string }> = [];
    for (let row = 0; row < df.nrow; row++) {
      if (!bitGet(pinnedRows, row)) continue;
      const dot = dotByRow.get(row);
      if (!dot) continue;
      labels.push({
        row,
        x: dot.cx + 6,
        y: Math.max(TOP + 10, dot.cy - 6),
        label: formatRowLabel(df, row, labelVar),
      });
    }
    return labels;
  }, [df, dots, pinnedRows, labelVar]);

  const publishDotBrush = (
    rect: { x0: number; y0: number; x1: number; y1: number },
    path: Point2D[] | null,
    tool: typeof brush.tool,
  ): Uint8Array | null => {
    if (!df) return null;
    const mask = new Uint8Array(Math.ceil(df.nrow / 8));
    const x0 = Math.min(rect.x0, rect.x1);
    const y0 = Math.min(rect.y0, rect.y1);
    const x1 = Math.max(rect.x0, rect.x1);
    const y1 = Math.max(rect.y0, rect.y1);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.max(1e-9, (x1 - x0) / 2);
    const ry = Math.max(1e-9, (y1 - y0) / 2);
    for (const dot of dots) {
      let inside = false;
      if (tool === "lasso") {
        inside = path != null && path.length >= 3 && pointInPolygon(dot.cx, dot.cy, path);
      } else if (tool === "ellipse") {
        const dx = (dot.cx - cx) / rx;
        const dy = (dot.cy - cy) / ry;
        inside = dx * dx + dy * dy <= 1;
      } else {
        inside = dot.cx >= x0 && dot.cx <= x1 && dot.cy >= y0 && dot.cy <= y1;
      }
      if (inside) bitSet(mask, dot.row);
    }
    setSelectionMask(mask);
    return mask;
  };

  const pointForEvent = (e: React.MouseEvent<SVGSVGElement>): Point2D | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) {
      const target = e.target as Element | null;
      const dotRowAttr = target?.getAttribute("data-dot-row");
      if (dotRowAttr != null) {
        const row = Number(dotRowAttr);
        const dot = dots.find((d) => d.row === row);
        if (dot) return { x: dot.cx, y: dot.cy };
      }
    }
    return {
      x: ((e.clientX - box.left) / Math.max(1, box.width)) * WIDTH,
      y: ((e.clientY - box.top) / Math.max(1, box.height)) * HEIGHT,
    };
  };

  const bucketIndexForEvent = (e: React.MouseEvent<SVGSVGElement>): number | null => {
    const target = e.target as Element | null;
    const fromTarget = target?.closest("[data-bucket-index]")?.getAttribute("data-bucket-index");
    if (fromTarget != null) return Number(fromTarget);

    const svg = svgRef.current;
    if (!svg || buckets.length === 0) return null;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / Math.max(1, box.width)) * WIDTH;
    const idx = Math.floor((x - LEFT) / bucketStep);
    if (idx < 0 || idx >= buckets.length) return null;
    return idx;
  };

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== "brush") return;
    if (!df) return;
    const p = pointForEvent(e);
    if (!p) return;
    const path = brush.tool === "lasso" ? [p] : null;
    const rect = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    const mask = publishDotBrush(rect, path, brush.tool);
    if (mask) dragRef.current = { x0: p.x, y0: p.y, tool: brush.tool, path, mask };
    setActiveBrush(panel.id, rect, path);
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

    // Check if hovering a dot
    const target = e.target as Element | null;
    const dotRowAttr = target?.getAttribute("data-dot-row");
    const dotValAttr = target?.getAttribute("data-dot-value");
    if (dotRowAttr != null && dotValAttr != null) {
      setTip({
        text: `row ${dotRowAttr}: ${panel.variable}=${dotValAttr}`,
        x: e.clientX,
        y: e.clientY,
      });
    } else {
      const idx = bucketIndexForEvent(e);
      if (idx != null && buckets[idx]) {
        setTip({
          text: `${buckets[idx]!.label}: ${buckets[idx]!.rows.length} rows`,
          x: e.clientX,
          y: e.clientY,
        });
      } else {
        setTip(null);
      }
    }

    if (activeTool !== "brush" || !dragRef.current) return;
    const p = pointForEvent(e);
    if (!p) return;
    const drag = dragRef.current;
    let path = drag.path;
    const rect = { x0: drag.x0, y0: drag.y0, x1: p.x, y1: p.y };
    if (drag.tool === "lasso") {
      path = appendLassoPoint(path ?? [], p);
      drag.path = path;
      setActiveBrush(panel.id, pathBounds(path), path);
    } else {
      setActiveBrush(panel.id, rect);
    }
    const mask = publishDotBrush(rect, path, drag.tool);
    if (mask) dragRef.current.mask = mask;
  };

  const onMouseUp = () => {
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
    setActiveBrush(null, null);
  };

  const headerLabel = isTourActive
    ? `tour: ${tour.activeVars.join(", ")}`
    : `dot: ${panel.variable}`;

  if (!isNumeric) {
    return (
      <div className="plot-card" data-tool={activeTool}>
        <div className="plot-head">
          <span className="vars">{headerLabel}</span>
          <button
            className="close"
            aria-label={`remove plot ${panel.id}`}
            onClick={() => removePanel(panel.id)}
          >
            x
          </button>
        </div>
        <div className="plot-empty">Non-numeric variable — dotplot requires numeric or integer data.</div>
      </div>
    );
  }

  return (
    <div className="plot-card" data-tool={activeTool}>
      <div className="plot-head">
        <span className="vars">{headerLabel}</span>
        <button
          className="close"
          aria-label={`remove plot ${panel.id}`}
          onClick={() => removePanel(panel.id)}
        >
          x
        </button>
      </div>
      {buckets.length === 0 ? (
        <div className="plot-empty">No plottable values.</div>
      ) : (
        <div className="plot-body" ref={bodyRef}>
          <svg
            ref={svgRef}
            className="dotplot"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`dotplot ${panel.variable}`}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => {
              setTip(null);
              onMouseUp();
            }}
          >
            <line className="axis" x1={LEFT} y1={TOP + PLOT_H} x2={WIDTH - RIGHT} y2={TOP + PLOT_H} />
            <line className="axis" x1={LEFT} y1={TOP} x2={LEFT} y2={TOP + PLOT_H} />
            {brush.activePanelId === panel.id && renderBrushOverlay(brush.tool, brush.activeRect, brush.activePath)}
            {/* Invisible hit-target rects per bucket for easier brush interaction */}
            {buckets.map((bucket, i) => {
              const x = LEFT + i * bucketStep;
              return (
                <rect
                  key={`hit-${i}`}
                  data-bucket-index={i}
                  x={x}
                  y={TOP}
                  width={bucketStep}
                  height={PLOT_H}
                  fill="transparent"
                />
              );
            })}
            {dots.map((dot) => {
              const isShadowed = bitGet(selection.shadow, dot.row);
              const isSelected = bitGet(selection.mask, dot.row);
              const paintColor = selection.paint[dot.row] ?? 0;
              const paintShape = selection.shape[dot.row] ?? 0;
              const fill = paintColor > 0
                ? paintPalette[(paintColor - 1) % paintPalette.length]!
                : isShadowed
                ? "#cccccc"
                : "#4e79a7";
              const opacity = isShadowed ? 0.35 : 1;
              return (
                <g key={`dot-${dot.row}`}>
                  {isSelected && (
                    renderDotShape(dot, DOT_R + 2.5, paintShape, "#ffd400", 0.7)
                  )}
                  {renderDotShape(
                    dot,
                    DOT_R,
                    paintShape,
                    fill,
                    opacity,
                    {
                      "data-dot-row": dot.row,
                      "data-dot-value": dot.value,
                      "data-testid": `dot-${panel.variable}-${dot.row}`,
                    },
                  )}
                </g>
              );
            })}
            {pinnedLabels.map((label) => (
              <text
                key={`pinned-${label.row}`}
                className="plot-svg-label"
                data-testid={`pinned-dot-label-${label.row}`}
                x={label.x}
                y={label.y}
              >
                {label.label}
              </text>
            ))}
            {/* X-axis labels (first and last bucket) */}
            {buckets.length > 0 && (
              <>
                <text
                  className="bar-label"
                  x={LEFT + bucketStep * 0.5}
                  y={TOP + PLOT_H + 16}
                  textAnchor="middle"
                >
                  {abbreviate(buckets[0]!.label)}
                </text>
                {buckets.length > 1 && (
                  <text
                    className="bar-label"
                    x={LEFT + bucketStep * (buckets.length - 0.5)}
                    y={TOP + PLOT_H + 16}
                    textAnchor="middle"
                  >
                    {abbreviate(buckets[buckets.length - 1]!.label)}
                  </text>
                )}
              </>
            )}
            {/* Variable name label centred below */}
            <text
              className="bar-label"
              x={LEFT + PLOT_W / 2}
              y={TOP + PLOT_H + 38}
              textAnchor="middle"
              fontWeight="bold"
            >
              {isTourActive ? `tour: ${tour.activeVars.join(", ")}` : panel.variable}
            </text>
          </svg>
        </div>
      )}
      {tip && <div className="plot-tooltip" style={{ left: tip.x + 8, top: tip.y + 8 }}>{tip.text}</div>}
    </div>
  );
}

function renderDotShape(
  dot: DotItem,
  r: number,
  shapeIdx: number,
  fill: string,
  opacity: number,
  attrs: Record<string, string | number> = {},
) {
  const common = {
    fill,
    opacity,
    "data-bucket-index": dot.bucketIdx,
    ...attrs,
  };
  if (shapeIdx === 2) {
    return <rect x={dot.cx - r} y={dot.cy - r} width={r * 2} height={r * 2} {...common} />;
  }
  if (shapeIdx === 3) {
    const points = `${dot.cx},${dot.cy - r * 1.25} ${dot.cx + r * 1.2},${dot.cy + r} ${dot.cx - r * 1.2},${dot.cy + r}`;
    return <polygon points={points} {...common} />;
  }
  if (shapeIdx === 4) {
    const points = `${dot.cx},${dot.cy - r * 1.35} ${dot.cx + r * 1.35},${dot.cy} ${dot.cx},${dot.cy + r * 1.35} ${dot.cx - r * 1.35},${dot.cy}`;
    return <polygon points={points} {...common} />;
  }
  return <circle cx={dot.cx} cy={dot.cy} r={r} {...common} />;
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

function renderBrushOverlay(
  tool: BrushTool,
  rect: { x0: number; y0: number; x1: number; y1: number } | null,
  path: ReadonlyArray<Point2D> | null,
) {
  const common = {
    fill: "rgba(102,204,255,0.10)",
    stroke: "rgba(102,204,255,0.85)",
    strokeWidth: 1,
    pointerEvents: "none" as const,
  };
  if (tool === "lasso" && path && path.length > 0) {
    const points = path.map((p) => `${p.x},${p.y}`).join(" ");
    return <polygon points={points} {...common} />;
  }
  if (!rect) return null;
  const x = Math.min(rect.x0, rect.x1);
  const y = Math.min(rect.y0, rect.y1);
  const w = Math.abs(rect.x1 - rect.x0);
  const h = Math.abs(rect.y1 - rect.y0);
  if (tool === "ellipse") {
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={Math.max(0.5, w / 2)} ry={Math.max(0.5, h / 2)} {...common} />;
  }
  return <rect x={x} y={y} width={w} height={h} {...common} />;
}

function buildDotsFromValues(
  values: Float64Array,
  missing: Uint8Array,
  n: number,
  bins: number,
): { buckets: DotBucket[]; dots: DotItem[]; isNumeric: boolean } {
  const empty = { buckets: [], dots: [], isNumeric: true };

  const rawBuckets = bucketRowsFromValues(values, missing, n, bins);
  if (rawBuckets.length === 0) return empty;

  const dots: DotItem[] = [];
  const bottomY = TOP + PLOT_H - DOT_R;
  const maxStack = Math.floor(PLOT_H / DOT_STEP);

  for (let i = 0; i < rawBuckets.length; i++) {
    const [label, rows, colValues] = rawBuckets[i]!;
    const cx = LEFT + (i + 0.5) * (PLOT_W / rawBuckets.length);
    const capped = rows.slice(0, maxStack);
    for (let s = 0; s < capped.length; s++) {
      const row = capped[s]!;
      const cy = bottomY - s * DOT_STEP;
      dots.push({ row, bucketIdx: i, stackPos: s, cx, cy, value: colValues[s]! });
    }
  }

  const buckets: DotBucket[] = rawBuckets.map(([label, rows]) => ({ label, rows }));
  return { buckets, dots, isNumeric: true };
}

function bucketRowsFromValues(
  values: Float64Array,
  missing: Uint8Array,
  n: number,
  bins: number,
): Array<[string, number[], number[]]> {
  const validRows: Array<{ row: number; value: number }> = [];
  for (let i = 0; i < n; i++) {
    const isMissing = (missing[i >> 3]! & (1 << (i & 7))) !== 0;
    if (!isMissing && Number.isFinite(values[i]!)) {
      validRows.push({ row: i, value: values[i]! });
    }
  }
  if (validRows.length === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const { value } of validRows) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (min === max) {
    const rows = validRows.map((r) => r.row);
    const vals = validRows.map((r) => r.value);
    return [[formatValue(min), rows, vals]];
  }

  const binCount = Math.max(1, Math.min(40, Math.floor(bins)));
  const out: Array<[string, number[], number[]]> = [];
  for (let b = 0; b < binCount; b++) {
    const lo = min + (b / binCount) * (max - min);
    const hi = min + ((b + 1) / binCount) * (max - min);
    out.push([`${formatValue(lo)}-${formatValue(hi)}`, [], []]);
  }
  for (const { row, value } of validRows) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor(((value - min) / (max - min)) * binCount)));
    out[idx]![1].push(row);
    out[idx]![2].push(value);
  }
  return out.filter(([, rows]) => rows.length > 0);
}

function buildDots(
  df: DataFrame | null,
  variable: string,
  bins: number,
): { buckets: DotBucket[]; dots: DotItem[]; isNumeric: boolean } {
  const empty = { buckets: [], dots: [], isNumeric: true };
  if (!df) return empty;
  const col = df.column(variable);
  if (!col) return empty;

  if (col.type !== "numeric" && col.type !== "integer") {
    return { buckets: [], dots: [], isNumeric: false };
  }

  const rawBuckets = bucketRows(df, col, bins);
  if (rawBuckets.length === 0) return empty;

  const dots: DotItem[] = [];
  const bottomY = TOP + PLOT_H - DOT_R; // bottom of the plot area
  const maxStack = Math.floor(PLOT_H / DOT_STEP);

  for (let i = 0; i < rawBuckets.length; i++) {
    const [label, rows, colValues] = rawBuckets[i]!;
    const cx = LEFT + (i + 0.5) * (rawBuckets.length > 0 ? (PLOT_W / rawBuckets.length) : PLOT_W);
    const capped = rows.slice(0, maxStack);
    for (let s = 0; s < capped.length; s++) {
      const row = capped[s]!;
      const cy = bottomY - s * DOT_STEP;
      dots.push({
        row,
        bucketIdx: i,
        stackPos: s,
        cx,
        cy,
        value: colValues[s]!,
      });
    }
    rawBuckets[i] = [label, rows, colValues]; // unchanged, just for typing clarity
  }

  const buckets: DotBucket[] = rawBuckets.map(([label, rows]) => ({ label, rows }));
  return { buckets, dots, isNumeric: true };
}

function bucketRows(
  df: DataFrame,
  col: Column,
  bins: number,
): Array<[string, number[], number[]]> {
  // Only numeric/integer — extract values
  const colValues = col as Extract<Column, { type: "numeric" | "integer" }>;

  const validRows: Array<{ row: number; value: number }> = [];
  for (let i = 0; i < df.nrow; i++) {
    if (!col.missing.isMissing(i)) {
      validRows.push({ row: i, value: colValues.values[i]! });
    }
  }
  if (validRows.length === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const { value } of validRows) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (min === max) {
    const rows = validRows.map((r) => r.row);
    const vals = validRows.map((r) => r.value);
    return [[formatValue(min), rows, vals]];
  }

  const binCount = Math.max(1, Math.min(40, Math.floor(bins)));
  const out: Array<[string, number[], number[]]> = [];
  for (let b = 0; b < binCount; b++) {
    const lo = min + (b / binCount) * (max - min);
    const hi = min + ((b + 1) / binCount) * (max - min);
    out.push([`${formatValue(lo)}-${formatValue(hi)}`, [], []]);
  }
  for (const { row, value } of validRows) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor(((value - min) / (max - min)) * binCount)));
    out[idx]![1].push(row);
    out[idx]![2].push(value);
  }
  return out.filter(([, rows]) => rows.length > 0);
}

function abbreviate(label: string): string {
  return label.length > 12 ? `${label.slice(0, 11)}...` : label;
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return v.toFixed(1).replace(/\.0$/, "");
  return v.toFixed(2).replace(/\.?0+$/, "");
}
