export interface DownsampledSeries {
  x: Float64Array;
  yMin: Float64Array;
  yMax: Float64Array;
  indices: Int32Array;
  binCount: number;
}

export function minMaxDecimate(
  xValues: Float64Array,
  yValues: Float64Array,
  xMissing: Uint8Array,
  yMissing: Uint8Array,
  targetBins: number,
  shadow?: Uint8Array,
): DownsampledSeries {
  const n = xValues.length;
  if (n === 0) {
    return { x: new Float64Array(0), yMin: new Float64Array(0), yMax: new Float64Array(0), indices: new Int32Array(0), binCount: 0 };
  }

  const validIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (bitGet(xMissing, i) || bitGet(yMissing, i) || (shadow && bitGet(shadow, i))) continue;
    validIndices.push(i);
  }

  if (validIndices.length <= targetBins * 2) {
    const len = validIndices.length;
    const x = new Float64Array(len);
    const yMin = new Float64Array(len);
    const yMax = new Float64Array(len);
    const indices = new Int32Array(len);
    for (let j = 0; j < len; j++) {
      const i = validIndices[j]!;
      x[j] = xValues[i]!;
      yMin[j] = yValues[i]!;
      yMax[j] = yValues[i]!;
      indices[j] = i;
    }
    return { x, yMin, yMax, indices, binCount: len };
  }

  const vb = viewBounds(xValues, xMissing);
  const xRange = vb.xMax - vb.xMin;
  if (xRange <= 0) {
    const len = validIndices.length;
    const x = new Float64Array(len);
    const yMin = new Float64Array(len);
    const yMax = new Float64Array(len);
    const indices = new Int32Array(len);
    for (let j = 0; j < len; j++) {
      const i = validIndices[j]!;
      x[j] = xValues[i]!;
      yMin[j] = yValues[i]!;
      yMax[j] = yValues[i]!;
      indices[j] = i;
    }
    return { x, yMin, yMax, indices, binCount: len };
  }

  const binWidth = xRange / targetBins;
  const xArr = new Float64Array(targetBins);
  const yMinArr = new Float64Array(targetBins);
  const yMaxArr = new Float64Array(targetBins);
  const idxArr = new Int32Array(targetBins);
  let binCount = 0;
  let vi = 0;

  while (vi < validIndices.length) {
    const i0 = validIndices[vi]!;
    const binStart = vb.xMin + binCount * binWidth;
    const binEnd = binStart + binWidth;
    let minY = yValues[i0]!;
    let maxY = yValues[i0]!;
    let minIdx = i0;
    let maxIdx = i0;
    let sumX = xValues[i0]!;
    let count = 1;
    vi++;
    while (vi < validIndices.length) {
      const i = validIndices[vi]!;
      if (xValues[i]! >= binEnd) break;
      const yv = yValues[i]!;
      if (yv < minY) { minY = yv; minIdx = i; }
      if (yv > maxY) { maxY = yv; maxIdx = i; }
      sumX += xValues[i]!;
      count++;
      vi++;
    }
    if (binCount >= targetBins) break;
    xArr[binCount] = sumX / count;
    if (minIdx <= maxIdx) {
      yMinArr[binCount] = minY;
      yMaxArr[binCount] = maxY;
      idxArr[binCount] = minIdx;
    } else {
      yMinArr[binCount] = minY;
      yMaxArr[binCount] = maxY;
      idxArr[binCount] = maxIdx;
    }
    binCount++;
  }

  return {
    x: xArr.subarray(0, binCount),
    yMin: yMinArr.subarray(0, binCount),
    yMax: yMaxArr.subarray(0, binCount),
    indices: idxArr.subarray(0, binCount),
    binCount,
  };
}

function viewBounds(x: Float64Array, xMissing: Uint8Array) {
  let xMin = Infinity;
  let xMax = -Infinity;
  for (let i = 0; i < x.length; i++) {
    if (bitGet(xMissing, i)) continue;
    const v = x[i]!;
    if (v < xMin) xMin = v;
    if (v > xMax) xMax = v;
  }
  if (!isFinite(xMin)) { xMin = 0; xMax = 1; }
  const pad = (xMax - xMin) * 0.05 || 1;
  return { xMin: xMin - pad, xMax: xMax + pad };
}

function bitGet(mask: Uint8Array, i: number): number {
  const byte = i >> 3;
  if (byte >= mask.length) return 0;
  return (mask[byte]! >> (i & 7)) & 1;
}
