import { pcaProject } from "@/lib/projection/pca";
import { mdsProject } from "@/lib/projection/mds";
import { icaProject } from "@/lib/projection/ica";
import { tsneProject } from "@/lib/projection/tsne";
import { umapProject } from "@/lib/projection/umap";
import { procrustesAlign } from "@/lib/projection/procrustes";
import type { ProjectionMethod, ProjectionResult } from "@/lib/projection/types";

type InMessage =
  | {
      kind: "project";
      data: Float64Array;
      n: number;
      p: number;
      nComponents: number;
      method: ProjectionMethod;
      tsnePerplexity: number;
      tsneIterations: number;
      umapNNeighbors: number;
      umapMinDist: number;
    }
  | {
      kind: "compareDR";
      data: Float64Array;
      n: number;
      p: number;
      tsnePerplexity: number;
      tsneIterations: number;
      umapNNeighbors: number;
      umapMinDist: number;
    };

type OutMessage =
  | { kind: "result"; result: ProjectionResult }
  | { kind: "compareResult"; morphEmbeddings: { label: string; embedding: Float64Array }[] }
  | { kind: "error"; error: string };

self.onmessage = (e: MessageEvent<InMessage>) => {
  try {
    if (e.data.kind === "compareDR") {
      const { data, n, p, tsnePerplexity, tsneIterations, umapNNeighbors, umapMinDist } = e.data;
      const refEmbed = pcaProject(data, n, p, 2).embedding;
      const methods: { key: ProjectionMethod; label: string; fn: () => Float64Array }[] = [
        { key: "pca", label: "PCA", fn: () => refEmbed },
        { key: "mds", label: "MDS", fn: () => mdsProject(data, n, p, 2).embedding },
        { key: "ica", label: "ICA", fn: () => icaProject(data, n, p, 2).embedding },
        { key: "tsne", label: "t-SNE", fn: () => tsneProject(data, n, p, 2, tsnePerplexity, tsneIterations).embedding },
        { key: "umap", label: "UMAP", fn: () => umapProject(data, n, p, 2, umapNNeighbors, umapMinDist).embedding },
      ];
      const morphEmbeddings: { label: string; embedding: Float64Array }[] = [];
      const transferables: ArrayBuffer[] = [];
      for (const { key, label, fn } of methods) {
        let embed: Float64Array;
        if (key === "pca") {
          embed = refEmbed;
        } else {
          const rawEmbed = fn();
          embed = procrustesAlign(refEmbed, rawEmbed, n);
        }
        morphEmbeddings.push({ label, embedding: embed });
        if (embed.buffer instanceof ArrayBuffer) transferables.push(embed.buffer);
      }
      (self as unknown as Worker).postMessage({ kind: "compareResult", morphEmbeddings } as OutMessage, transferables);
      return;
    }

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
