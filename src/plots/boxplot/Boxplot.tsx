import { useEffect, useMemo, useRef, useState } from "react";
import type { BoxplotPanel } from "@/store/types";
import type { DataFrame } from "@/lib/data/types";
import { useAppStore } from "@/store";
import { bitGet, bitSet } from "@/lib/brush/hitTest";
import { getPalette } from "@/lib/color/palettes";

const WIDTH = 320;
const HEIGHT = 420;
const LEFT = 50;
const RIGHT = 18;
const TOP = 18;
const BOTTOM = 48;
const PLOT_W = WIDTH - LEFT - RIGHT;
const PLOT_H = HEIGHT - TOP - BOTTOM;
const MAX_BOXES = 12;
const MAX_OUTLIER_RADIUS = 3.5;

export interface BoxplotProps {
  panel: BoxplotPanel;
}

interface BoxStats {
  label: string;
  rows: number[];
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  whiskerLo: number;
  whiskerHi: number;
  outliers: { value: number; row: number }[];
  selected: number;
  shadowed: number;
  painted: Map<number, number>;
}

export function Boxplot({ panel }: BoxplotProps) {
  const df = useAppStore((s) => s.df);
  const selection = useAppStore((s) => s.selection);
  const brush = useAppStore((s) => s.brush);
  const activeTool = useAppStore((s) => s.tools.active);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const setSelectionShape = useAppStore((s) => s.setSelectionShape);
  const setBoxplotGroupVar = useAppStore((s) => s.setBoxplotGroupVar);
  const removePanel = useAppStore((s) => s.removePanel);
  const palette = useAppStore((s) => s.color.palette);
  const paintPalette = useMemo(() => getPalette(palette), [palette]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startIdx: number; yStart: number; yEnd: number; mask: Uint8Array } | null>(null);
  const windowMouseUpRef = useRef<(() => void) | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ y: number; h: number } | null>(null);

  const catVars = useMemo(() => {
    if (!df) return [];
    return df.columns.filter((c) => c.type === "categorical").map((c) => c.name);
  }, [df]);

  useEffect(() => {
    return () => {
      if (windowMouseUpRef.current) {
        window.removeEventListener("mouseup", windowMouseUpRef.current);
        windowMouseUpRef.current = null;
      }
    };
  }, []);

  const boxes = useMemo(
    () => buildBoxes(df, panel.variable, panel.groupVar, selection),
    [df, panel.variable, panel.groupVar, selection],
  );

  const allValues = useMemo(() => {
    const vals: number[] = [];
    for (const b of boxes) {
      vals.push(b.whiskerLo, b.whiskerHi);
      for (const o of b.outliers) vals.push(o.value);
    }
    return vals;
  }, [boxes]);

  const yMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const yMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const yPad = (yMax - yMin) * 0.05 || 0.5;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const toY = (v: number) => TOP + PLOT_H - ((v - yLo) / (yHi - yLo)) * PLOT_H;
  const fromY = (py: number) => yLo + ((TOP + PLOT_H - py) / PLOT_H) * (yHi - yLo);

  const boxCount = boxes.length || 1;
  const boxStep = PLOT_W / boxCount;
  const boxW = Math.min(boxStep * 0.6, 60);

  const rowsInRange = (idx: number, yA: number, yB: number): number[] => {
    const box = boxes[idx];
    if (!box) return [];
    const lo = Math.min(yA, yB);
    const hi = Math.max(yA, yB);
    return box.rows.filter((r) => {
      const col = df!.column(panel.variable);
      if (!col || col.type === "categorical" || col.missing.isMissing(r)) return false;
      const v = col.values[r]!;
      return v >= lo && v <= hi;
    });
  };

  const publishRange = (idx: number, yA: number, yB: number): Uint8Array | null => {
    if (!df) return null;
    const mask = new Uint8Array(Math.ceil(df.nrow / 8));
    for (const row of rowsInRange(idx, yA, yB)) bitSet(mask, row);
    setSelectionMask(mask);
    return mask;
  };

  const boxIndexForEvent = (e: React.MouseEvent<SVGSVGElement>): number | null => {
    const svg = svgRef.current;
    if (!svg || boxes.length === 0) return null;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / Math.max(1, box.width)) * WIDTH;
    const idx = Math.floor((x - LEFT) / boxStep);
    if (idx < 0 || idx >= boxes.length) return null;
    return idx;
  };

  const yForEvent = (e: React.MouseEvent<SVGSVGElement>): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const py = ((e.clientY - box.top) / Math.max(1, box.height)) * HEIGHT;
    if (py < TOP || py > TOP + PLOT_H) return null;
    return fromY(py);
  };

  const clearWindowMouseUp = () => {
    if (!windowMouseUpRef.current) return;
    window.removeEventListener("mouseup", windowMouseUpRef.current);
    windowMouseUpRef.current = null;
  };

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== "brush") return;
    const idx = boxIndexForEvent(e);
    const yVal = yForEvent(e);

    const target = e.target as Element | null;
    const fromTarget = target?.closest("[data-box-index]")?.getAttribute("data-box-index");
    const clickedBox = fromTarget != null ? Number(fromTarget) : idx;

    if (clickedBox != null && clickedBox >= 0 && clickedBox < boxes.length && yVal == null) {
      const mask = new Uint8Array(Math.ceil(df!.nrow / 8));
      for (const row of boxes[clickedBox]!.rows) bitSet(mask, row);
      setSelectionMask(mask);
      if (brush.mode === "persistent") {
        const nextPaint = new Uint8Array(selection.paint);
        const nextShape = new Uint8Array(selection.shape);
        for (const row of boxes[clickedBox]!.rows) {
          nextPaint[row] = brush.paintColor;
          nextShape[row] = brush.paintShape;
        }
        setSelectionPaint(nextPaint);
        setSelectionShape(nextShape);
        setSelectionMask(new Uint8Array(Math.ceil(df!.nrow / 8)));
      }
      dragRef.current = null;
      return;
    }

    if (idx == null || yVal == null) return;
    const mask = publishRange(idx, yVal, yVal);
    if (mask) dragRef.current = { startIdx: idx, yStart: yVal, yEnd: yVal, mask };
    setDragRect(null);
    clearWindowMouseUp();
    const onGlobalUp = () => finishBrush();
    windowMouseUpRef.current = onGlobalUp;
    window.addEventListener("mouseup", onGlobalUp);
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const idx = boxIndexForEvent(e);
    const yVal = yForEvent(e);

    if (idx != null && yVal != null && boxes[idx]) {
      const b = boxes[idx]!;
      setTip({
        text: `${b.label}: median=${fmt(b.median)} Q1=${fmt(b.q1)} Q3=${fmt(b.q3)} n=${b.rows.length}`,
        x: e.clientX,
        y: e.clientY,
      });
    } else {
      setTip(null);
    }

    if (activeTool !== "brush" || !dragRef.current) return;
    if (yVal == null) return;
    dragRef.current.yEnd = yVal;
    setDragRect({
      y: Math.min(toY(dragRef.current.yStart), toY(yVal)),
      h: Math.abs(toY(yVal) - toY(dragRef.current.yStart)),
    });
    const mask = publishRange(dragRef.current.startIdx, dragRef.current.yStart, yVal);
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
    setDragRect(null);
  };

  const onMouseUp = () => {
    finishBrush();
  };

  const handleGroupVar = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setBoxplotGroupVar(panel.id, e.target.value || null);
  };

  const headLabel = panel.groupVar
    ? `box: ${panel.variable} by ${panel.groupVar}`
    : `box: ${panel.variable}`;

  return (
    <div className="plot-card" data-tool={activeTool}>
      <div className="plot-head">
        <span className="vars">{headLabel}</span>
        {catVars.length > 0 && (
          <label className="bin-slider">
            <span>Group</span>
            <select
              aria-label={`group variable for ${panel.variable} boxplot`}
              value={panel.groupVar ?? ""}
              onChange={handleGroupVar}
            >
              <option value="">(none)</option>
              {catVars.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
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
      {boxes.length === 0 ? (
        <div className="plot-empty">No plottable values.</div>
      ) : (
        <div className="plot-body">
          <svg
            ref={svgRef}
            className="boxplot"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`boxplot ${panel.variable}`}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => {
              setTip(null);
            }}
          >
            <line className="axis" x1={LEFT} y1={TOP + PLOT_H} x2={WIDTH - RIGHT} y2={TOP + PLOT_H} />
            <line className="axis" x1={LEFT} y1={TOP} x2={LEFT} y2={TOP + PLOT_H} />
            {boxes.map((b, i) => {
              const cx = LEFT + i * boxStep + boxStep / 2;
              const topPaint = dominantPaint(b.painted);
              const paintColor = topPaint ? paintPalette[(topPaint - 1) % paintPalette.length] : null;
              const boxTop = toY(b.q3);
              const boxBot = toY(b.q1);
              const medY = toY(b.median);
              const wLoY = toY(b.whiskerLo);
              const wHiY = toY(b.whiskerHi);
              const halfW = boxW / 2;
              return (
                <g key={`${b.label}-${i}`} data-box-index={i}>
                  <line
                    className="boxplot-whisker"
                    x1={cx}
                    y1={wHiY}
                    x2={cx}
                    y2={boxTop}
                    data-box-index={i}
                  />
                  <line
                    className="boxplot-whisker"
                    x1={cx}
                    y1={boxBot}
                    x2={cx}
                    y2={wLoY}
                    data-box-index={i}
                  />
                  <line
                    className="boxplot-cap"
                    x1={cx - halfW * 0.5}
                    y1={wHiY}
                    x2={cx + halfW * 0.5}
                    y2={wHiY}
                    data-box-index={i}
                  />
                  <line
                    className="boxplot-cap"
                    x1={cx - halfW * 0.5}
                    y1={wLoY}
                    x2={cx + halfW * 0.5}
                    y2={wLoY}
                    data-box-index={i}
                  />
                  <rect
                    className="boxplot-box"
                    data-box-index={i}
                    data-testid={`box-${panel.variable}-${i}`}
                    x={cx - halfW}
                    y={boxTop}
                    width={boxW}
                    height={Math.max(1, boxBot - boxTop)}
                  />
                  {paintColor && (
                    <rect
                      className="boxplot-box-painted"
                      data-box-index={i}
                      x={cx - halfW}
                      y={boxTop}
                      width={boxW}
                      height={Math.max(1, boxBot - boxTop)}
                      fill={paintColor}
                    />
                  )}
                  <line
                    className="boxplot-median"
                    x1={cx - halfW}
                    y1={medY}
                    x2={cx + halfW}
                    y2={medY}
                    data-box-index={i}
                  />
                  {b.outliers.map((o, j) => (
                    <circle
                      key={j}
                      className="boxplot-outlier"
                      data-box-index={i}
                      data-testid={`outlier-${panel.variable}-${i}-${j}`}
                      cx={cx}
                      cy={toY(o.value)}
                      r={MAX_OUTLIER_RADIUS}
                    />
                  ))}
                  <text
                    className="bar-label"
                    x={cx}
                    y={TOP + PLOT_H + 16}
                    textAnchor="middle"
                  >
                    {abbreviate(b.label)}
                  </text>
                </g>
              );
            })}
            {dragRect && (
              <rect
                className="brush-rect"
                x={LEFT}
                y={dragRect.y}
                width={PLOT_W}
                height={Math.max(1, dragRect.h)}
              />
            )}
          </svg>
        </div>
      )}
      {tip && (
        <div className="plot-tooltip" style={{ left: tip.x + 8, top: tip.y + 8 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

function buildBoxes(
  df: DataFrame | null,
  variable: string,
  groupVar: string | null,
  selection: { mask: Uint8Array; paint: Uint8Array; shadow: Uint8Array },
): BoxStats[] {
  if (!df) return [];
  const col = df.column(variable);
  if (!col || (col.type !== "numeric" && col.type !== "integer")) return [];

  const groups: Array<[string, number[]]> = [];
  if (groupVar) {
    const gCol = df.column(groupVar);
    if (!gCol || gCol.type !== "categorical") {
      groups.push([variable, []]);
    } else {
      for (const level of gCol.levels) {
        groups.push([level, []]);
      }
      for (let i = 0; i < df.nrow; i++) {
        if (col.missing.isMissing(i) || gCol.missing.isMissing(i)) continue;
        const code = gCol.codes[i]!;
        groups[code]![1].push(i);
      }
    }
  } else {
    const allRows: number[] = [];
    for (let i = 0; i < df.nrow; i++) {
      if (!col.missing.isMissing(i)) allRows.push(i);
    }
    groups.push([variable, allRows]);
  }

  const nonEmpty = groups.filter(([, rows]) => rows.length > 0);
  if (nonEmpty.length === 0) return [];
  if (nonEmpty.length > MAX_BOXES) nonEmpty.length = MAX_BOXES;

  return nonEmpty.map(([label, rows]) => {
    const values: number[] = [];
    const rowByVal: Map<number, number[]> = new Map();
    for (const r of rows) {
      const v = col.values[r]!;
      values.push(v);
      const arr = rowByVal.get(v) ?? [];
      arr.push(r);
      rowByVal.set(v, arr);
    }
    values.sort((a, b) => a - b);

    const q1 = quantile(values, 0.25);
    const median = quantile(values, 0.5);
    const q3 = quantile(values, 0.75);
    const iqr = q3 - q1;
    const fenceLo = q1 - 1.5 * iqr;
    const fenceHi = q3 + 1.5 * iqr;

    let whiskerLo = values[0]!;
    let whiskerHi = values[values.length - 1]!;
    const outliers: { value: number; row: number }[] = [];

    for (const v of values) {
      if (v < fenceLo || v > fenceHi) {
        const matchRows = rowByVal.get(v) ?? [rows[0]!];
        outliers.push({ value: v, row: matchRows[0]! });
      }
    }

    for (const v of values) {
      if (v >= fenceLo) { whiskerLo = v; break; }
    }
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i]! <= fenceHi) { whiskerHi = values[i]!; break; }
    }

    let selected = 0;
    let shadowed = 0;
    const painted = new Map<number, number>();
    for (const r of rows) {
      if (bitGet(selection.mask, r)) selected++;
      if (bitGet(selection.shadow, r)) shadowed++;
      const p = selection.paint[r] ?? 0;
      if (p > 0) painted.set(p, (painted.get(p) ?? 0) + 1);
    }

    return {
      label,
      rows,
      min: values[0]!,
      q1,
      median,
      q3,
      max: values[values.length - 1]!,
      whiskerLo,
      whiskerHi,
      outliers,
      selected,
      shadowed,
      painted,
    };
  });
}

function quantile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (idx - lo) * (sorted[hi]! - sorted[lo]!);
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
  return label.length > 14 ? `${label.slice(0, 13)}...` : label;
}

function fmt(v: number): string {
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return v.toFixed(1).replace(/\.0$/, "");
  return v.toFixed(2).replace(/\.?0+$/, "");
}
