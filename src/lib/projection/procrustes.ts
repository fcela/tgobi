export function procrustesAlign(
  X: Float64Array,
  Y: Float64Array,
  n: number,
): Float64Array {
  const mx0 = new Float64Array(2);
  const my0 = new Float64Array(2);
  for (let i = 0; i < n; i++) {
    mx0[0]! += X[i * 2]!;
    mx0[1]! += X[i * 2 + 1]!;
    my0[0]! += Y[i * 2]!;
    my0[1]! += Y[i * 2 + 1]!;
  }
  mx0[0]! /= n; mx0[1]! /= n;
  my0[0]! /= n; my0[1]! /= n;

  const Xc = new Float64Array(n * 2);
  const Yc = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    Xc[i * 2]! = X[i * 2]! - mx0[0]!;
    Xc[i * 2 + 1]! = X[i * 2 + 1]! - mx0[1]!;
    Yc[i * 2]! = Y[i * 2]! - my0[0]!;
    Yc[i * 2 + 1]! = Y[i * 2 + 1]! - my0[1]!;
  }

  let normX = 0, normY = 0;
  for (let i = 0; i < n * 2; i++) {
    normX += Xc[i]! * Xc[i]!;
    normY += Yc[i]! * Yc[i]!;
  }
  normX = Math.sqrt(normX);
  normY = Math.sqrt(normY);

  const scale = normY > 1e-12 ? normX / normY : 1;
  for (let i = 0; i < n * 2; i++) Yc[i]! = Yc[i]! * scale;

  const M = new Float64Array(4);
  for (let i = 0; i < n; i++) {
    const xc0 = Xc[i * 2]!, xc1 = Xc[i * 2 + 1]!;
    const yc0 = Yc[i * 2]!, yc1 = Yc[i * 2 + 1]!;
    M[0]! += xc0 * yc0;
    M[1]! += xc0 * yc1;
    M[2]! += xc1 * yc0;
    M[3]! += xc1 * yc1;
  }

  const { U, V } = svd2x2(M);

  const R = new Float64Array(4);
  R[0]! = V[0]! * U[0]! + V[2]! * U[2]!;
  R[1]! = V[0]! * U[1]! + V[2]! * U[3]!;
  R[2]! = V[1]! * U[0]! + V[3]! * U[2]!;
  R[3]! = V[1]! * U[1]! + V[3]! * U[3]!;

  const out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const yc0 = Yc[i * 2]!, yc1 = Yc[i * 2 + 1]!;
    out[i * 2]! = yc0 * R[0]! + yc1 * R[2]! + mx0[0]!;
    out[i * 2 + 1]! = yc0 * R[1]! + yc1 * R[3]! + mx0[1]!;
  }
  return out;
}

function svd2x2(M: Float64Array): { U: Float64Array; S: Float64Array; V: Float64Array } {
  const a = M[0]!, b = M[1]!, c = M[2]!, d = M[3]!;

  const s1 = a * a + b * b + c * c + d * d;

  const sigma1sq = Math.max(0, (s1 + Math.sqrt((a + d) * (a + d) + (b - c) * (b - c) - (a - d) * (a - d) - (b + c) * (b + c))) / 2);
  const sigma2sq = Math.max(0, (s1 - Math.sqrt((a + d) * (a + d) + (b - c) * (b - c) - (a - d) * (a - d) - (b + c) * (b + c))) / 2);

  const sigma1 = Math.sqrt(sigma1sq);
  const sigma2 = Math.sqrt(sigma2sq);

  const U = new Float64Array(4);
  const V = new Float64Array(4);

  if (sigma1 < 1e-12) {
    U[0]! = 1; U[1]! = 0; U[2]! = 0; U[3]! = 1;
    V[0]! = 1; V[1]! = 0; V[2]! = 0; V[3]! = 1;
    return { U, S: new Float64Array([0, 0]), V };
  }

  const v0 = a + c;
  const v1 = b + d;
  const v2 = -b + d;
  const v3 = a - c;

  const alpha = v0 * v0 + v2 * v2;
  const beta = v0 * v0 + v1 * v1;

  if (alpha < 1e-24 || beta < 1e-24) {
    U[0]! = 1; U[1]! = 0; U[2]! = 0; U[3]! = 1;
    V[0]! = 1; V[1]! = 0; V[2]! = 0; V[3]! = 1;
  } else {
    U[0]! = v0 / Math.sqrt(beta);
    U[1]! = v1 / Math.sqrt(beta);
    U[2]! = v2 / Math.sqrt(alpha);
    U[3]! = v3 / Math.sqrt(alpha);

    V[0]! = v0 / Math.sqrt(alpha);
    V[1]! = v2 / Math.sqrt(alpha);
    V[2]! = v1 / Math.sqrt(beta);
    V[3]! = v3 / Math.sqrt(beta);
  }

  const detU = U[0]! * U[3]! - U[1]! * U[2]!;
  const detV = V[0]! * V[3]! - V[1]! * V[2]!;
  if (detU * detV < 0) {
    if (detU < 0) {
      U[2]! = -U[2]!;
      U[3]! = -U[3]!;
    } else {
      V[2]! = -V[2]!;
      V[3]! = -V[3]!;
    }
  }

  return { U, S: new Float64Array([sigma1, sigma2]), V };
}
