import { useEffect, useMemo, useRef, useState } from "react";
import type { MissingPatternPanel } from "@/store/types";
import { useAppStore } from "@/store";
import { missingnessPatterns, variableMissingSummaries, rowMissingCounts } from "@/lib/data/missingness";
import { bitGet, bitSet } from "@/lib/brush/hitTest";

const WIDTH = 640;
const HEIGHT = 400;
const LEFT = 100;
const RIGHT = 40;
const TOP = 24;
const BOTTOM = 80;
const PLOT_W = WIDTH - LEFT - RIGHT;
const PLOT_H = HEIGHT - TOP - BOTTOM;

export interface MissingPatternProps {
  panel: MissingPatternPanel;
}

export function MissingPattern({ panel }: MissingPatternProps) {
  const df = useAppStore((s) => s.df);
  const selection = useAppStore((s) => s.selection);
  const brush = useAppStore((s) => s.brush);
  const activeTool = useAppStore((s) => s.tools.active);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const removePanel = useAppStore((s) => s.removePanel);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPattern, setHoveredPattern] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const dragRef = useRef<{ patternStart: number; patternEnd: number } | null>(null);

  const varNames = useMemo(() => {
    if (!df) return [];
    return df.columns.map((c) => c.name);
  }, [df]);

  const patterns = useMemo(() => {
    if (!df) return [];
    return missingnessPatterns(df, varNames);
  }, [df, varNames]);

  const varSummaries = useMemo(() => {
    if (!df) return [];
    return variableMissingSummaries(df, varNames);
  }, [df, varNames]);

  const rowSummaries = useMemo(() => {
    if (!df) return [];
    return rowMissingCounts(df, varNames);
  }, [df, varNames]);

  const ncol = varNames.length;
  const nPatterns = patterns.length;
  const maxPatternCount = Math.max(1, ...patterns.map((p) => p.count));

  useEffect(() => {
    if (nPatterns > 0 && hoveredPattern === null) {
      setHoveredPattern(0);
    }
  }, [nPatterns, hoveredPattern]);

  if (!df || ncol === 0) {
    return (
      <div className="plot-card">
        <div className="plot-head">
          <span className="vars">Missing Pattern</span>
          <button className="close" aria-label={`remove plot ${panel.id}`} onClick={() => removePanel(panel.id)}>x</button>
        </div>
        <div className="plot-empty">No data loaded.</div>
      </div>
    );
  }

  const cellW = Math.max(4, Math.min(24, PLOT_W / Math.max(1, ncol)));
  const cellH = Math.max(4, Math.min(24, PLOT_H / Math.max(1, nPatterns)));
  const gridW = cellW * ncol;
  const gridH = cellH * nPatterns;

  const barWidth = Math.max(8, LEFT - 20);
  const barStep = gridH / Math.max(1, nPatterns);

  const selectPattern = (patternIdx: number) => {
    if (!df) return;
    if (patternIdx < 0 || patternIdx >= nPatterns) return;
    const pattern = patterns[patternIdx]!;
    const mask = new Uint8Array(Math.ceil(df.nrow / 8));
    for (const row of pattern.rows) bitSet(mask, row);
    setSelectionMask(mask);
  };

  const paintPattern = (patternIdx: number) => {
    if (!df) return;
    if (patternIdx < 0 || patternIdx >= nPatterns) return;
    const pattern = patterns[patternIdx]!;
    const nextPaint = new Uint8Array(selection.paint);
    for (const row of pattern.rows) {
      nextPaint[row] = brush.paintColor;
    }
    setSelectionPaint(nextPaint);
  };

  const onPatternMouseDown = (patternIdx: number) => {
    if (activeTool !== "brush") return;
    selectPattern(patternIdx);
    dragRef.current = { patternStart: patternIdx, patternEnd: patternIdx };
  };

  const onPatternMouseMove = (patternIdx: number) => {
    setHoveredPattern(patternIdx);
    if (activeTool !== "brush" || !dragRef.current) return;
    dragRef.current.patternEnd = patternIdx;
    const lo = Math.min(dragRef.current.patternStart, dragRef.current.patternEnd);
    const hi = Math.max(dragRef.current.patternStart, dragRef.current.patternEnd);
    if (!df) return;
    const mask = new Uint8Array(Math.ceil(df.nrow / 8));
    for (let p = lo; p <= hi; p++) {
      for (const row of patterns[p]!.rows) bitSet(mask, row);
    }
    setSelectionMask(mask);
  };

  const onPatternMouseUp = () => {
    if (!dragRef.current || !df) return;
    if (brush.mode === "persistent") {
      const lo = Math.min(dragRef.current.patternStart, dragRef.current.patternEnd);
      const hi = Math.max(dragRef.current.patternStart, dragRef.current.patternEnd);
      const nextPaint = new Uint8Array(selection.paint);
      for (let p = lo; p <= hi; p++) {
        for (const row of patterns[p]!.rows) {
          nextPaint[row] = brush.paintColor;
        }
      }
      setSelectionPaint(nextPaint);
    }
    setSelectionMask(new Uint8Array(Math.ceil(df.nrow / 8)));
    dragRef.current = null;
  };

  const varsWithMissing = varSummaries.filter((v) => v.missing > 0);

  return (
    <div className="plot-card" data-tool={activeTool}>
      <div className="plot-head">
        <span className="vars">Missing Pattern ({nPatterns} patterns, {varsWithMissing.length}/{ncol} vars with missing)</span>
        <button className="close" aria-label={`remove plot ${panel.id}`} onClick={() => removePanel(panel.id)}>x</button>
      </div>
      <svg
        ref={svgRef}
        className="missing-pattern"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="missingness pattern plot"
        onMouseUp={onPatternMouseUp}
        onMouseLeave={() => { setHoveredPattern(null); setHoveredCol(null); }}
      >
        <line className="axis" x1={LEFT} y1={TOP + gridH} x2={LEFT + gridW} y2={TOP + gridH} />
        <line className="axis" x1={LEFT} y1={TOP} x2={LEFT} y2={TOP + gridH} />

        {patterns.map((pattern, pi) => {
          const y = TOP + pi * barStep;
          const barH = barStep * 0.7;
          const barW = (pattern.count / maxPatternCount) * barWidth;
          let selectedInPattern = 0;
          for (const row of pattern.rows) {
            if (bitGet(selection.mask, row)) selectedInPattern++;
          }
          const selectedW = (selectedInPattern / Math.max(1, pattern.count)) * barW;
          return (
            <g key={pattern.key}
              onMouseDown={() => onPatternMouseDown(pi)}
              onMouseMove={() => onPatternMouseMove(pi)}
            >
              <rect
                x={LEFT - barWidth - 8}
                y={y}
                width={barW}
                height={barH}
                fill="#6688bb"
                className="missing-bar"
              />
              {selectedW > 0 && (
                <rect
                  x={LEFT - barWidth - 8}
                  y={y}
                  width={selectedW}
                  height={barH}
                  fill="#ff6600"
                  className="missing-bar-selected"
                />
              )}
              {pattern.mask.map((isMiss, ci) => (
                <rect
                  key={ci}
                  x={LEFT + ci * cellW}
                  y={TOP + pi * cellH}
                  width={cellW - 1}
                  height={cellH - 1}
                  fill={isMiss ? "#dd3333" : "#33aa55"}
                  opacity={hoveredPattern === pi || hoveredCol === ci ? 1 : 0.75}
                  onMouseEnter={() => { setHoveredPattern(pi); setHoveredCol(ci); }}
                />
              ))}
              <text
                x={LEFT - 4}
                y={y + barH / 2 + 4}
                textAnchor="end"
                className="missing-count-label"
                fontSize={9}
              >
                {pattern.count}
              </text>
            </g>
          );
        })}

        {varNames.map((name, ci) => {
          const summary = varSummaries[ci];
          const missing = summary?.missing ?? 0;
          return (
            <g key={name}
              onMouseEnter={() => setHoveredCol(ci)}
              onMouseLeave={() => setHoveredCol(null)}
            >
              <text
                x={LEFT + ci * cellW + cellW / 2}
                y={TOP + gridH + 14}
                textAnchor="end"
                transform={`rotate(-45, ${LEFT + ci * cellW + cellW / 2}, ${TOP + gridH + 14})`}
                className="missing-var-label"
                fontSize={9}
                fill={missing > 0 ? "#dd3333" : "#33aa55"}
              >
                {name}
              </text>
            </g>
          );
        })}

        {hoveredPattern != null && hoveredPattern < nPatterns && (
          <text x={LEFT + gridW + 8} y={TOP + hoveredPattern * barStep + cellH / 2 + 3} fontSize={8} fill="#555">
            {patterns[hoveredPattern]!.rows.length} rows
          </text>
        )}
      </svg>
      <div className="missing-legend">
        <span className="legend-item"><span className="legend-swatch" style={{ background: "#dd3333" }} />missing</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: "#33aa55" }} />observed</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: "#ff6600" }} />selected</span>
      </div>
    </div>
  );
}
