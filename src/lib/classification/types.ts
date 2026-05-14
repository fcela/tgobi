export type ClassificationMethod = "knn" | "naivebayes" | "randomforest";

export interface ClassificationResult {
  predictions: Int16Array;
  nClasses: number;
  sizes: number[];
}
