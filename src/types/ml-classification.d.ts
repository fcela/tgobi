declare module "ml-knn" {
  export default class KNN {
    constructor(X: number[][], y: number[], options?: { k?: number });
    predict(X: number[][]): number[];
  }
}

declare module "ml-naivebayes" {
  export class GaussianNB {
    constructor();
    train(X: number[][], y: number[]): void;
    predict(X: number[][]): number[];
  }
  export class MultinomialNB {
    constructor();
    train(X: number[][], y: number[]): void;
    predict(X: number[][]): number[];
  }
}

declare module "ml-random-forest" {
  export class RandomForestClassifier {
    constructor(options?: { nEstimators?: number; maxDepth?: number; seed?: number });
    train(X: number[][], y: number[]): void;
    predict(X: number[][]): number[];
  }
  export class RandomForestRegression {
    constructor(options?: { nEstimators?: number; maxDepth?: number; seed?: number });
    train(X: number[][], y: number[]): void;
    predict(X: number[][]): number[];
  }
}
