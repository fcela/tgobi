export type ProjectionMethod = "pca" | "mds" | "tsne" | "umap" | "ica";

export interface ProjectionResult {
  embedding: Float64Array;
  nComponents: number;
  explainedVar: number[] | null;
  stress: number | null;
  loadings: Float64Array | null;
  varImportance: number[] | null;
}
