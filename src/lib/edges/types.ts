import type { DataFrame } from "@/lib/data/types";

export interface Edges {
  readonly source: Int32Array;
  readonly target: Int32Array;
  readonly directed: boolean;
  readonly attrs?: DataFrame;
}
