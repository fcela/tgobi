const SQRT2PI = Math.sqrt(2 * Math.PI);

function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / SQRT2PI;
}

export interface KDEGrid {
  values: Float64Array;
  nx: number;
  ny: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function kde2d(
  x: Float64Array | Int32Array,
  y: Float64Array | Int32Array,
  xMissing: Uint8Array,
  yMissing: Uint8Array,
  shadow: Uint8Array,
  gridRes = 64,
  bandwidth?: number,
): KDEGrid | null {
  const n = x.length;
  if (n === 0) return null;

  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const xm = (xMissing.length > 0 && ((xMissing[i >> 3]! >> (i & 7)) & 1) !== 0);
    const ym = (yMissing.length > 0 && ((yMissing[i >> 3]! >> (i & 7)) & 1) !== 0);
    if (xm || ym) continue;
    const sh = shadow.length > 0 && ((shadow[i >> 3]! >> (i & 7)) & 1) !== 0;
    if (sh) continue;
    const xv = x[i]!, yv = y[i]!;
    if (xv < xMin) xMin = xv;
    if (xv > xMax) xMax = xv;
    if (yv < yMin) yMin = yv;
    if (yv > yMax) yMax = yv;
    count++;
  }
  if (count === 0 || !isFinite(xMin)) return null;

  const xPad = (xMax - xMin) * 0.05 || 0.5;
  const yPad = (yMax - yMin) * 0.05 || 0.5;
  xMin -= xPad; xMax += xPad;
  yMin -= yPad; yMax += yPad;

  const nx = gridRes;
  const ny = gridRes;
  const dx = (xMax - xMin) / (nx - 1);
  const dy = (yMax - yMin) / (ny - 1);

  if (bandwidth == null) {
    bandwidth = Math.max(dx, dy) * 1.5;
  }
  const h = bandwidth;

  const grid = new Float64Array(nx * ny);

  const hSq2 = 2 * h * h;
  const invHSq2PI = 1 / (h * h * 2 * Math.PI);

  for (let i = 0; i < n; i++) {
    const xm = (xMissing.length > 0 && ((xMissing[i >> 3]! >> (i & 7)) & 1) !== 0);
    const ym = (yMissing.length > 0 && ((yMissing[i >> 3]! >> (i & 7)) & 1) !== 0);
    if (xm || ym) continue;
    const sh = shadow.length > 0 && ((shadow[i >> 3]! >> (i & 7)) & 1) !== 0;
    if (sh) continue;
    const xv = x[i]!, yv = y[i]!;

    const iMin = Math.max(0, Math.floor((xv - 3 * h - xMin) / dx));
    const iMax = Math.min(nx - 1, Math.ceil((xv + 3 * h - xMin) / dx));
    const jMin = Math.max(0, Math.floor((yv - 3 * h - yMin) / dy));
    const jMax = Math.min(ny - 1, Math.ceil((yv + 3 * h - yMin) / dy));

    for (let j = jMin; j <= jMax; j++) {
      const gy = yMin + j * dy;
      const dyv = yv - gy;
      const ky = Math.exp(-dyv * dyv / hSq2);
      for (let ii = iMin; ii <= iMax; ii++) {
        const gx = xMin + ii * dx;
        const dxv = xv - gx;
        const kx = Math.exp(-dxv * dxv / hSq2);
        grid[j * nx + ii]! += kx * ky * invHSq2PI;
      }
    }
  }

  for (let k = 0; k < grid.length; k++) grid[k]! /= count;

  return { values: grid, nx, ny, xMin, yMin: yMin, xMax, yMax };
}

export interface ContourLevel {
  value: number;
  paths: Array<Array<{ x: number; y: number }>>;
}

export function computeContourLevels(kde: KDEGrid, nLevels = 6): number[] {
  let maxVal = 0;
  for (let k = 0; k < kde.values.length; k++) {
    if (kde.values[k]! > maxVal) maxVal = kde.values[k]!;
  }
  if (maxVal === 0) return [];
  const levels: number[] = [];
  for (let i = 1; i <= nLevels; i++) {
    levels.push((i / (nLevels + 1)) * maxVal);
  }
  return levels;
}

export function marchingSquares(
  kde: KDEGrid,
  level: number,
): Array<Array<{ x: number; y: number }>> {
  const { values, nx, ny, xMin, yMin, xMax, yMax } = kde;
  const dx = (xMax - xMin) / (nx - 1);
  const dy = (yMax - yMin) / (ny - 1);

  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const tl = values[j * nx + i]!;
      const tr = values[j * nx + i + 1]!;
      const br = values[(j + 1) * nx + i + 1]!;
      const bl = values[(j + 1) * nx + i]!;

      const code = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
      if (code === 0 || code === 15) continue;

      const x0 = xMin + i * dx;
      const x1 = xMin + (i + 1) * dx;
      const y0 = yMin + j * dy;
      const y1 = yMin + (j + 1) * dy;

      const interp = (a: number, b: number) => {
        const d = b - a;
        if (d === 0) return 0.5;
        return (level - a) / d;
      };

      const top = { x: x0 + interp(tl, tr) * dx, y: y0 };
      const right = { x: x1, y: y0 + interp(tr, br) * dy };
      const bottom = { x: x0 + interp(bl, br) * dx, y: y1 };
      const left = { x: x0, y: y0 + interp(tl, bl) * dy };

      switch (code) {
        case 1: case 14: edges.push({ x1: left.x, y1: left.y, x2: bottom.x, y2: bottom.y }); break;
        case 2: case 13: edges.push({ x1: bottom.x, y1: bottom.y, x2: right.x, y2: right.y }); break;
        case 3: case 12: edges.push({ x1: left.x, y1: left.y, x2: right.x, y2: right.y }); break;
        case 4: case 11: edges.push({ x1: top.x, y1: top.y, x2: right.x, y2: right.y }); break;
        case 5: edges.push({ x1: top.x, y1: top.y, x2: left.x, y2: left.y }); edges.push({ x1: bottom.x, y1: bottom.y, x2: right.x, y2: right.y }); break;
        case 6: case 9: edges.push({ x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y }); break;
        case 7: case 8: edges.push({ x1: top.x, y1: top.y, x2: left.x, y2: left.y }); break;
        case 10: edges.push({ x1: left.x, y1: left.y, x2: bottom.x, y2: bottom.y }); edges.push({ x1: top.x, y1: top.y, x2: right.x, y2: right.y }); break;
      }
    }
  }

  if (edges.length === 0) return [];

  const adjacency = new Map<string, Array<{ idx: number; isStart: boolean }>>();
  const key = (x: number, y: number) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    const k1 = key(e.x1, e.y1);
    const k2 = key(e.x2, e.y2);
    if (!adjacency.has(k1)) adjacency.set(k1, []);
    if (!adjacency.has(k2)) adjacency.set(k2, []);
    adjacency.get(k1)!.push({ idx: i, isStart: true });
    adjacency.get(k2)!.push({ idx: i, isStart: false });
  }

  const used = new Uint8Array(edges.length);
  const paths: Array<Array<{ x: number; y: number }>> = [];

  for (let start = 0; start < edges.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const path: Array<{ x: number; y: number }> = [{ x: edges[start]!.x1, y: edges[start]!.y1 }];
    let curX = edges[start]!.x2;
    let curY = edges[start]!.y2;
    path.push({ x: curX, y: curY });

    let maxIter = edges.length;
    while (maxIter-- > 0) {
      const curKey = key(curX, curY);
      const neighbors = adjacency.get(curKey);
      if (!neighbors) break;
      let found = false;
      for (const n of neighbors) {
        if (used[n.idx]) continue;
        used[n.idx] = 1;
        const e = edges[n.idx]!;
        if (n.isStart) {
          curX = e.x2; curY = e.y2;
        } else {
          curX = e.x1; curY = e.y1;
        }
        path.push({ x: curX, y: curY });
        found = true;
        break;
      }
      if (!found) break;
    }

    if (path.length >= 3) paths.push(path);
  }

  return paths;
}
