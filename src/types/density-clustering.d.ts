declare module "density-clustering" {
  export class DBSCAN {
    run(data: number[][], eps: number, minPts: number): number[][];
    noise: number[];
  }
  export class KMEANS {
    run(data: number[][], k: number): number[][];
  }
  export class OPTICS {
    run(data: number[][], eps: number, minPts: number): number[][];
    noise: number[];
    reachabilityDistances: number[];
  }
}
