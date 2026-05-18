export type ClassificationMethod = "knn" | "naivebayes" | "randomforest" | "logistic";

export interface ClassificationResult {
  predictions: Int16Array;
  nClasses: number;
  sizes: number[];
  featureImportance?: number[];
  /**
   * Per-prediction × per-class probability, row-major
   * (length = predictions.length × nClasses). Each row sums to ~1.
   * Always populated by every classifier (the per-method probability
   * derivation is documented in that classifier's file).
   */
  probabilities: Float32Array;
}
