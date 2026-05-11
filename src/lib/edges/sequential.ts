import type { Edges } from "@/lib/edges/types";

export function sequentialEdges(nrow: number): Edges {
  const nedge = Math.max(0, nrow - 1);
  const source = new Int32Array(nedge);
  const target = new Int32Array(nedge);
  for (let i = 0; i < nedge; i++) {
    source[i] = i;
    target[i] = i + 1;
  }
  return { source, target, directed: false };
}
