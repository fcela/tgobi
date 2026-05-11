import type { Mat } from "@/lib/linalg/types";
import { multiply } from "@/lib/linalg/matmul";

export type ProjectionPursuitIndex = "holes" | "centralMass" | "lda" | "pca" | "kurtosis";

export const PROJECTION_PURSUIT_INDEX_LABELS: Record<ProjectionPursuitIndex, string> = {
  holes: "Holes",
  centralMass: "Central Mass",
  lda: "LDA",
  pca: "PCA variance",
  kurtosis: "Kurtosis",
};

export function projectionPursuitValue(
  X: Mat,
  B: Mat,
  index: ProjectionPursuitIndex,
  classLabels?: Int32Array | null,
): number {
  const Y = multiply(X, B);
  return projectionPursuitValueForProjection(Y, index, classLabels);
}

export function projectionPursuitValueForProjection(
  Y: Mat,
  index: ProjectionPursuitIndex,
  classLabels?: Int32Array | null,
): number {
  if (Y.nrow === 0) return 0;
  switch (index) {
    case "holes":
      return 1 - centralDensity(Y);
    case "centralMass":
      return centralDensity(Y);
    case "lda":
      return classLabels ? ldaSeparation(Y, classLabels) : 0;
    case "pca":
      return totalVariance(Y);
    case "kurtosis":
      return Math.abs(radialKurtosisExcess(Y));
  }
}

function centralDensity(Y: Mat): number {
  const { means, sds } = standardizingMoments(Y);
  let sum = 0;
  for (let i = 0; i < Y.nrow; i++) {
    let r2 = 0;
    for (let j = 0; j < Y.ncol; j++) {
      const z = (Y.values[i * Y.ncol + j]! - means[j]!) / sds[j]!;
      r2 += z * z;
    }
    sum += Math.exp(-0.5 * r2);
  }
  return sum / Y.nrow;
}

function totalVariance(Y: Mat): number {
  const { means } = standardizingMoments(Y);
  let sumVar = 0;
  for (let j = 0; j < Y.ncol; j++) {
    let ss = 0;
    for (let i = 0; i < Y.nrow; i++) {
      const d = Y.values[i * Y.ncol + j]! - means[j]!;
      ss += d * d;
    }
    sumVar += ss / Math.max(1, Y.nrow - 1);
  }
  return sumVar;
}

function radialKurtosisExcess(Y: Mat): number {
  const { means, sds } = standardizingMoments(Y);
  let m4 = 0;
  for (let i = 0; i < Y.nrow; i++) {
    let r2 = 0;
    for (let j = 0; j < Y.ncol; j++) {
      const z = (Y.values[i * Y.ncol + j]! - means[j]!) / sds[j]!;
      r2 += z * z;
    }
    m4 += r2 * r2;
  }
  m4 /= Y.nrow;
  const normalReference = Y.ncol * (Y.ncol + 2);
  return m4 - normalReference;
}

function ldaSeparation(Y: Mat, labels: Int32Array): number {
  if (labels.length !== Y.nrow) {
    throw new Error(`ldaSeparation: labels length ${labels.length} != ${Y.nrow}`);
  }

  const classes = new Map<number, { count: number; sum: Float64Array; mean: Float64Array }>();
  const overall = new Float64Array(Y.ncol);
  let nValid = 0;

  for (let i = 0; i < Y.nrow; i++) {
    const label = labels[i]!;
    if (label < 0) continue;
    let cls = classes.get(label);
    if (!cls) {
      cls = { count: 0, sum: new Float64Array(Y.ncol), mean: new Float64Array(Y.ncol) };
      classes.set(label, cls);
    }
    cls.count++;
    nValid++;
    for (let j = 0; j < Y.ncol; j++) {
      const y = Y.values[i * Y.ncol + j]!;
      cls.sum[j] = cls.sum[j]! + y;
      overall[j] = overall[j]! + y;
    }
  }

  if (nValid < 2 || classes.size < 2) return 0;

  for (let j = 0; j < Y.ncol; j++) overall[j] = overall[j]! / nValid;
  for (const cls of classes.values()) {
    for (let j = 0; j < Y.ncol; j++) cls.mean[j] = cls.sum[j]! / cls.count;
  }

  let between = 0;
  for (const cls of classes.values()) {
    let d2 = 0;
    for (let j = 0; j < Y.ncol; j++) {
      const d = cls.mean[j]! - overall[j]!;
      d2 += d * d;
    }
    between += cls.count * d2;
  }

  let within = 0;
  for (let i = 0; i < Y.nrow; i++) {
    const label = labels[i]!;
    if (label < 0) continue;
    const cls = classes.get(label)!;
    for (let j = 0; j < Y.ncol; j++) {
      const d = Y.values[i * Y.ncol + j]! - cls.mean[j]!;
      within += d * d;
    }
  }

  return between / (within + 1e-9);
}

function standardizingMoments(Y: Mat): { means: Float64Array; sds: Float64Array } {
  const means = new Float64Array(Y.ncol);
  const sds = new Float64Array(Y.ncol);
  for (let j = 0; j < Y.ncol; j++) {
    let sum = 0;
    for (let i = 0; i < Y.nrow; i++) sum += Y.values[i * Y.ncol + j]!;
    const mean = sum / Y.nrow;
    means[j] = mean;

    let ss = 0;
    for (let i = 0; i < Y.nrow; i++) {
      const d = Y.values[i * Y.ncol + j]! - mean;
      ss += d * d;
    }
    const variance = ss / Math.max(1, Y.nrow - 1);
    sds[j] = Math.sqrt(variance) || 1;
  }
  return { means, sds };
}
