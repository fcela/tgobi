// Static 2D kd-tree.
//
// Construction is O(n log n). Storage is O(n) — no per-node allocation
// beyond the index array.
//
// Storage layout: a single Int32Array `nodes` of length `n`, holding the
// permutation of point indices in median-split kd-tree order. The split
// dimension at depth d is d % 2.
export class KdTree2D {
  readonly #xy: Float64Array;
  readonly #idx: Int32Array;            // permutation
  readonly n: number;

  constructor(xy: Float64Array) {
    if (xy.length === 0) throw new Error("KdTree2D: empty point set");
    if (xy.length % 2 !== 0) throw new Error("KdTree2D: xy length must be even");
    this.#xy = xy;
    this.n = xy.length / 2;
    this.#idx = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) this.#idx[i] = i;
    this.#build(0, this.n, 0);
  }

  #build(lo: number, hi: number, depth: number): void {
    if (hi - lo <= 1) return;
    const mid = (lo + hi) >> 1;
    const dim = depth % 2;
    this.#nthElement(lo, hi, mid, dim);
    this.#build(lo, mid, depth + 1);
    this.#build(mid + 1, hi, depth + 1);
  }

  // Quickselect that places the median at `mid` and partitions around it.
  #nthElement(lo: number, hi: number, k: number, dim: number): void {
    while (lo < hi - 1) {
      const pivot = this.#partition(lo, hi, dim);
      if (pivot === k) return;
      if (pivot < k) lo = pivot + 1; else hi = pivot;
    }
  }

  #partition(lo: number, hi: number, dim: number): number {
    const xy = this.#xy;
    const idx = this.#idx;
    const pivotIdx = lo + ((hi - lo) >> 1);
    const pivotVal = xy[2 * idx[pivotIdx]! + dim]!;
    // move pivot to end
    [idx[pivotIdx], idx[hi - 1]] = [idx[hi - 1]!, idx[pivotIdx]!];
    let store = lo;
    for (let i = lo; i < hi - 1; i++) {
      if (xy[2 * idx[i]! + dim]! < pivotVal) {
        [idx[i], idx[store]] = [idx[store]!, idx[i]!];
        store++;
      }
    }
    [idx[store], idx[hi - 1]] = [idx[hi - 1]!, idx[store]!];
    return store;
  }

  nearest(qx: number, qy: number): number {
    const best = { idx: -1, d2: Infinity };
    this.#nearest(0, this.n, 0, qx, qy, best);
    return best.idx;
  }

  point(i: number): { x: number; y: number } {
    if (i < 0 || i >= this.n) throw new Error(`KdTree2D: point index out of range: ${i}`);
    return { x: this.#xy[2 * i]!, y: this.#xy[2 * i + 1]! };
  }

  #nearest(
    lo: number, hi: number, depth: number,
    qx: number, qy: number,
    best: { idx: number; d2: number },
  ): void {
    if (hi - lo === 0) return;
    const mid = (lo + hi) >> 1;
    const i = this.#idx[mid]!;
    const px = this.#xy[2 * i]!, py = this.#xy[2 * i + 1]!;
    const dx = qx - px, dy = qy - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < best.d2) { best.d2 = d2; best.idx = i; }

    const dim = depth % 2;
    const split = dim === 0 ? px : py;
    const q = dim === 0 ? qx : qy;
    const goLeft = q < split;
    if (goLeft) this.#nearest(lo, mid, depth + 1, qx, qy, best);
    else this.#nearest(mid + 1, hi, depth + 1, qx, qy, best);
    // check the other side if the splitting plane is within best distance
    const planeDist = q - split;
    if (planeDist * planeDist < best.d2) {
      if (goLeft) this.#nearest(mid + 1, hi, depth + 1, qx, qy, best);
      else this.#nearest(lo, mid, depth + 1, qx, qy, best);
    }
  }

  *range(x0: number, y0: number, x1: number, y1: number): Generator<number> {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    yield* this.#range(0, this.n, 0, x0, y0, x1, y1);
  }

  *#range(
    lo: number, hi: number, depth: number,
    x0: number, y0: number, x1: number, y1: number,
  ): Generator<number> {
    if (hi - lo === 0) return;
    const mid = (lo + hi) >> 1;
    const i = this.#idx[mid]!;
    const px = this.#xy[2 * i]!, py = this.#xy[2 * i + 1]!;
    if (px >= x0 && px <= x1 && py >= y0 && py <= y1) yield i;

    const dim = depth % 2;
    const split = dim === 0 ? px : py;
    const lo0 = dim === 0 ? x0 : y0;
    const hi0 = dim === 0 ? x1 : y1;
    if (lo0 <= split) yield* this.#range(lo, mid, depth + 1, x0, y0, x1, y1);
    if (hi0 >= split) yield* this.#range(mid + 1, hi, depth + 1, x0, y0, x1, y1);
  }
}
