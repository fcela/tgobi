import { pcaProject } from "@/lib/projection/pca";
import { mdsProject } from "@/lib/projection/mds";
import { icaProject } from "@/lib/projection/ica";
import { tsneProject } from "@/lib/projection/tsne";
import { umapProject } from "@/lib/projection/umap";
import type { ProjectionMethod, ProjectionResult } from "@/lib/projection/types";

type InMessage = {
  data: Float64Array;
  n: number;
  p: number;
  nComponents: number;
  method: ProjectionMethod;
  tsnePerplexity: number;
  tsneIterations: number;
  umapNNeighbors: number;
  umapMinDist: number;
};

type OutMessage =
  | { kind: "result"; result: ProjectionResult }
  | { kind: "error"; error: string };

self.onmessage = (e: MessageEvent<InMessage>) => {
  try {
    const { data, n, p, nComponents, method, tsnePerplexity, tsneIterations, umapNNeighbors, umapMinDist } = e.data;

    let result: ProjectionResult;
    switch (method) {
      case "pca":
        result = pcaProject(data, n, p, nComponents);
        break;
      case "mds":
        result = mdsProject(data, n, p, nComponents);
        break;
      case "ica":
        result = icaProject(data, n, p, nComponents);
        break;
      case "tsne":
        result = tsneProject(data, n, p, nComponents, tsnePerplexity, tsneIterations);
        break;
      case "umap":
        result = umapProject(data, n, p, nComponents, umapNNeighbors, umapMinDist);
        break;
      default:
        throw new Error(`Unknown projection method: ${method}`);
    }

    const msg: OutMessage = { kind: "result", result };
    const transferables: ArrayBuffer[] = [];
    if (result.embedding.buffer instanceof ArrayBuffer) transferables.push(result.embedding.buffer);
    if (result.loadings && result.loadings.buffer instanceof ArrayBuffer) transferables.push(result.loadings.buffer);
    (self as unknown as Worker).postMessage(msg, transferables);
  } catch (err) {
    const msg: OutMessage = { kind: "error", error: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};
