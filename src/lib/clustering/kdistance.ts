export function kDistance(
  data: number[][],
  k: number,
): Float64Array {
  const n = data.length;
  if (n === 0) return new Float64Array(0);

  const dist = (a: number[], b: number[]): number => {
    let sum = 0;
    for (let d = 0; d < a.length; d++) {
      const diff = a[d]! - b[d]!;
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  };

  const kthDists = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const dists: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      dists.push(dist(data[i]!, data[j]!));
    }
    dists.sort((a, b) => a - b);
    kthDists[i] = dists[Math.min(k - 1, dists.length - 1)] ?? 0;
  }

  kthDists.sort();
  return kthDists;
}
