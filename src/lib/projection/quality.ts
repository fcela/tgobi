export interface DRQualityMetrics {
  trustworthiness: number;
  continuity: number;
  shepardOrigDists: Float64Array;
  shepardEmbDists: Float64Array;
  shepardDeltas: Float64Array;
}

export function computeDRQuality(
  origData: Float64Array,
  embedding: Float64Array,
  n: number,
  pOrig: number,
  pEmb: number,
  k: number = 10,
): DRQualityMetrics {
  const kClamped = Math.min(k, n - 2);

  const origDists = pairwiseDistances(origData, n, pOrig);
  const embDists = pairwiseDistances(embedding, n, pEmb);

  const origRanking = computeFullRanking(origDists, n);
  const embRanking = computeFullRanking(embDists, n);

  const trustworthiness = computeTrustworthiness(origRanking, embRanking, n, kClamped);
  const continuity = computeContinuity(origRanking, embRanking, n, kClamped);

  const sampleSize = Math.min(500, (n * (n - 1)) / 2);
  const { origSample, embSample, deltas } = sampleShepard(origDists, embDists, n, sampleSize);

  return {
    trustworthiness,
    continuity,
    shepardOrigDists: origSample,
    shepardEmbDists: embSample,
    shepardDeltas: deltas,
  };
}

function pairwiseDistances(data: Float64Array, n: number, p: number): Float64Array {
  const dists = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sum = 0;
      for (let c = 0; c < p; c++) {
        const d = data[i * p + c]! - data[j * p + c]!;
        sum += d * d;
      }
      const dist = Math.sqrt(sum);
      dists[i * n + j] = dist;
      dists[j * n + i] = dist;
    }
  }
  return dists;
}

function computeFullRanking(dists: Float64Array, n: number): Int32Array {
  const m = n - 1;
  const ranking = new Int32Array(n * m);
  for (let i = 0; i < n; i++) {
    const indices: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      indices.push(j);
    }
    indices.sort((a, b) => dists[i * n + a]! - dists[i * n + b]!);
    for (let r = 0; r < m; r++) {
      ranking[i * m + r] = indices[r]!;
    }
  }
  return ranking;
}

function computeTrustworthiness(
  origRanking: Int32Array,
  embRanking: Int32Array,
  n: number,
  k: number,
): number {
  const m = n - 1;
  let totalPenalty = 0;
  for (let i = 0; i < n; i++) {
    const origTopK = new Set<number>();
    for (let kk = 0; kk < k; kk++) origTopK.add(origRanking[i * m + kk]!);
    for (let kk = 0; kk < k; kk++) {
      const j = embRanking[i * m + kk]!;
      if (!origTopK.has(j)) {
        const rank = findRank(origRanking, i, m, j);
        totalPenalty += rank - k + 1;
      }
    }
  }
  if (n <= 1 || k <= 0) return 1;
  const denom = n * k * (2 * n - 3 * k - 1);
  if (denom <= 0) return 1;
  return 1 - (2 / denom) * totalPenalty;
}

function computeContinuity(
  origRanking: Int32Array,
  embRanking: Int32Array,
  n: number,
  k: number,
): number {
  const m = n - 1;
  let totalPenalty = 0;
  for (let i = 0; i < n; i++) {
    const embTopK = new Set<number>();
    for (let kk = 0; kk < k; kk++) embTopK.add(embRanking[i * m + kk]!);
    for (let kk = 0; kk < k; kk++) {
      const j = origRanking[i * m + kk]!;
      if (!embTopK.has(j)) {
        const rank = findRank(embRanking, i, m, j);
        totalPenalty += rank - k + 1;
      }
    }
  }
  if (n <= 1 || k <= 0) return 1;
  const denom = n * k * (2 * n - 3 * k - 1);
  if (denom <= 0) return 1;
  return 1 - (2 / denom) * totalPenalty;
}

function findRank(ranking: Int32Array, i: number, m: number, target: number): number {
  for (let r = 0; r < m; r++) {
    if (ranking[i * m + r]! === target) return r;
  }
  return m;
}

function sampleShepard(
  origDists: Float64Array,
  embDists: Float64Array,
  n: number,
  sampleSize: number,
): { origSample: Float64Array; embSample: Float64Array; deltas: Float64Array } {
  const totalPairs = (n * (n - 1)) / 2;
  const step = Math.max(1, totalPairs / sampleSize);
  const out = Math.min(sampleSize, totalPairs);

  const origSample = new Float64Array(out);
  const embSample = new Float64Array(out);
  const deltas = new Float64Array(out);

  let idx = 0;
  let count = 0;
  for (let i = 0; i < n && count < out; i++) {
    for (let j = i + 1; j < n && count < out; j++) {
      if (idx % Math.round(step) === 0 || totalPairs <= sampleSize) {
        const od = origDists[i * n + j]!;
        const ed = embDists[i * n + j]!;
        origSample[count] = od;
        embSample[count] = ed;
        deltas[count] = od - ed;
        count++;
      }
      idx++;
    }
  }

  return { origSample: origSample.slice(0, count), embSample: embSample.slice(0, count), deltas: deltas.slice(0, count) };
}
