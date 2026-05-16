export type ClassificationMethod = "knn" | "naivebayes" | "randomforest" | "logistic";

export interface ClassificationResult {
  predictions: Int16Array;
  nClasses: number;
  sizes: number[];
  featureImportance?: number[];
  probabilities?: Float32Array;
}
