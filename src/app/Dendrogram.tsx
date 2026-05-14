import { useMemo } from "react";
import type { DendrogramData } from "@/lib/clustering/types";

interface DendrogramProps {
  data: DendrogramData;
  k: number;
  width?: number;
  height?: number;
  onCutChange?: (k: number) => void;
}

export function Dendrogram({
  data,
  k,
  width = 280,
  height = 160,
  onCutChange,
}: DendrogramProps) {
  const { merges, leafOrder, maxHeight } = data;
  const nLeaves = leafOrder.length;

  const margin = { top: 4, right: 8, bottom: 4, left: 4 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const xScale = (leafIdx: number) =>
    margin.left + (leafIdx + 0.5) / nLeaves * innerW;
  const yScale = (h: number) =>
    margin.top + innerH - (h / Math.max(maxHeight, 1e-12)) * innerH;

  // compute leaf x-positions
  const leafX = useMemo(() => {
    const xPositions = new Float64Array(nLeaves);
    const posMap = new Map<number, number>();
    for (let i = 0; i < nLeaves; i++) posMap.set(leafOrder[i]!, i);
    for (let i = 0; i < nLeaves; i++) xPositions[i] = xScale(i);
    return { xPositions, posMap };
  }, [nLeaves, leafOrder, innerW, margin.left]);

  // compute merge node positions
  const mergeX = useMemo(() => {
    const xArr = new Float64Array(merges.length);
    for (let m = 0; m < merges.length; m++) {
      const merge = merges[m]!;
      const leftX = merge.left < nLeaves
        ? leafX.xPositions[merge.left]!
        : xArr[merge.left - nLeaves]!;
      const rightX = merge.right < nLeaves
        ? leafX.xPositions[merge.right]!
        : xArr[merge.right - nLeaves]!;
      xArr[m] = (leftX + rightX) / 2;
    }
    return xArr;
  }, [merges, nLeaves, leafX]);

  // cut height for k clusters
  const cutHeight = useMemo(() => {
    if (merges.length === 0) return 0;
    const sortedHeights = merges.map((m) => m.height).sort((a, b) => a - b);
    const idx = Math.max(0, sortedHeights.length - k);
    return sortedHeights[idx] ?? 0;
  }, [merges, k]);

  // build SVG paths
  const paths = useMemo(() => {
    const result: Array<{ d: string; isLeft?: boolean }> = [];
    for (let m = 0; m < merges.length; m++) {
      const merge = merges[m]!;
      const myX = mergeX[m]!;
      const myY = yScale(merge.height);
      const leftX = merge.left < nLeaves
        ? leafX.xPositions[merge.left]!
        : mergeX[merge.left - nLeaves]!;
      const leftY = merge.left < nLeaves
        ? yScale(0)
        : yScale(merges[merge.left - nLeaves]!.height);
      const rightX = merge.right < nLeaves
        ? leafX.xPositions[merge.right]!
        : mergeX[merge.right - nLeaves]!;
      const rightY = merge.right < nLeaves
        ? yScale(0)
        : yScale(merges[merge.right - nLeaves]!.height);

      // U-shaped connector: left child up, across, right child down
      result.push({
        d: `M${leftX},${leftY} V${myY} H${rightX} V${rightY}`,
        isLeft: merge.height < cutHeight,
      });
    }
    return result;
  }, [merges, mergeX, nLeaves, leafX, maxHeight, cutHeight]);

  const handleCutDrag = (e: React.MouseEvent<SVGLineElement>) => {
    const svg = e.currentTarget.closest("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const y = e.clientY - rect.top - margin.top;
    const ratio = 1 - y / innerH;
    const h = Math.max(0, Math.min(maxHeight, ratio * maxHeight));
    // find k from cut height
    let count = 1;
    for (const merge of merges) {
      if (merge.height >= h) count++;
    }
    const newK = Math.min(nLeaves, Math.max(2, count));
    onCutChange?.(newK);
  };

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", maxWidth: "100%" }}
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={p.isLeft ? "#6cf" : "#555"}
          strokeWidth={1}
        />
      ))}
      {maxHeight > 0 && (
        <line
          x1={margin.left}
          y1={yScale(cutHeight)}
          x2={width - margin.right}
          y2={yScale(cutHeight)}
          stroke="#f4a261"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          style={{ cursor: "ns-resize" }}
          onMouseDown={handleCutDrag}
        />
      )}
    </svg>
  );
}
