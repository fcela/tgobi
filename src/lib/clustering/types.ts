export interface ClusterResult {
  assignments: Int16Array;
  k: number;
  sizes: number[];
}

export interface DendrogramNode {
  height: number;
  left: number;
  right: number;
  leafCount: number;
}

export interface DendrogramData {
  merges: DendrogramNode[];
  leafOrder: number[];
  maxHeight: number;
}
