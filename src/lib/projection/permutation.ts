export function permutationImportance(
  data: Float64Array,
  n: number,
  p: number,
  k: number,
  project: (data: Float64Array, n: number, p: number, k: number) => Float64Array,
  nPerm: number = 3,
): number[] {
  const baseEmbed = project(data, n, p, k);

  const importance: number[] = new Array(p).fill(0);

  for (let v = 0; v < p; v++) {
    let totalShift = 0;
    for (let perm = 0; perm < nPerm; perm++) {
      const shuffled = new Float64Array(data);
      const indices = new Array(n);
      for (let i = 0; i < n; i++) indices[i] = i;
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = indices[i]!;
        indices[i] = indices[j]!;
        indices[j] = tmp;
      }
      for (let i = 0; i < n; i++) {
        shuffled[i * p + v] = data[indices[i]! * p + v]!;
      }

      const permEmbed = project(shuffled, n, p, k);

      let shift = 0;
      for (let c = 0; c < k; c++) {
        const r = corr(
          baseEmbed, permEmbed, n, k, c,
        );
        shift += 1 - r * r;
      }
      totalShift += shift / k;
    }
    importance[v] = totalShift / nPerm;
  }

  const maxImp = Math.max(...importance, 1e-10);
  for (let v = 0; v < p; v++) importance[v] = importance[v]! / maxImp;

  return importance;
}

function corr(
  a: Float64Array,
  b: Float64Array,
  n: number,
  k: number,
  c: number,
): number {
  let meanA = 0, meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i * k + c]!;
    meanB += b[i * k + c]!;
  }
  meanA /= n;
  meanB /= n;

  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i * k + c]! - meanA;
    const db = b[i * k + c]! - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  const denom = Math.sqrt(varA * varB);
  return denom > 1e-10 ? cov / denom : 0;
}
