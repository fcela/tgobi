import { makeMat } from "@/lib/linalg/types";
import type { Mat } from "@/lib/linalg/types";
import { multiply } from "@/lib/linalg/matmul";
import { randomBasis, mulberry32 } from "@/lib/linalg/random";
import { tourPath } from "@/lib/linalg/geodesic";
import { projectionPursuitTarget } from "@/lib/tour-pp/optimizer";
import { projectionPursuitValueForProjection } from "@/lib/tour-pp/indices";
import type { ProjectionPursuitIndex } from "@/lib/tour-pp/indices";

type InMessage =
  | {
      kind: "init";
      X: Float64Array;
      n: number;
      p: number;
      k: 1 | 2;
      speed: number;
      seed: number;
      mode: "grand" | "pp";
      ppIndex: ProjectionPursuitIndex;
      classLabels: Int32Array | null;
      frozenRows: Uint8Array;
    }
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "setMode"; mode: "grand" | "pp"; ppIndex: ProjectionPursuitIndex; classLabels: Int32Array | null }
  | { kind: "setSpeed"; speed: number }
  | { kind: "setFrozenRows"; frozenRows: Uint8Array }
  | { kind: "setBasis"; basis: Float64Array }
  | { kind: "stop" };

type OutMessage = { kind: "frame"; basis: Float64Array; proj: Float64Array; t: number; ppValue: number | null };

let X: Mat | null = null;
let n = 0, p = 0, k: 1 | 2 = 2;
let speed = 1200;
let mode: "grand" | "pp" = "grand";
let ppIndex: ProjectionPursuitIndex = "holes";
let classLabels: Int32Array | null = null;
let rng = mulberry32(1);
let curr: Mat | null = null;
let currentFrame: Mat | null = null;
let target: Mat | null = null;
let path: ((t: number) => Mat) | null = null;
let frozenRows = new Uint8Array(0);
let frozenValues: Float64Array | null = null;
let t = 0;
let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

const GRAND_TARGET_FRACTION = 0.6;
const TIMER_MS = 16;

function newTarget(start?: Mat): void {
  if (!X) return;
  curr = start ?? currentFrame ?? curr ?? randomBasis(p, k, rng);
  currentFrame = curr;
  if (mode === "pp") {
    target = projectionPursuitTarget(X, curr, ppIndex, rng, {}, classLabels).basis;
  } else {
    const randomTarget = randomBasis(p, k, rng);
    target = tourPath(curr, randomTarget)(GRAND_TARGET_FRACTION);
  }
  target = applyFrozenRows(target);
  path = tourPath(curr, target);
  t = 0;
}

function tick(): void {
  if (!running || !X || !path || !curr || !target) return;
  t += 1 / Math.max(1, speed);
  if (t >= 1) {
    newTarget(currentFrame ?? path(1));
  }
  const B = applyFrozenRows(path(easeProgress(t)));
  currentFrame = B;
  const proj = multiply(X, B).values;
  const ppValue = mode === "pp" ? projectionPursuitValueForProjection(makeMat(n, k, proj), ppIndex, classLabels) : null;
  const basisCopy = new Float64Array(B.values);
  const msg: OutMessage = { kind: "frame", basis: basisCopy, proj, t, ppValue };
  // proj is transferable — saves a copy on the way out
  (self as unknown as Worker).postMessage(msg, [proj.buffer]);
}

function startTimer(): void {
  if (timer != null) return;
  timer = setInterval(tick, TIMER_MS);
}

function stopTimer(): void {
  if (timer == null) return;
  clearInterval(timer);
  timer = null;
}

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  switch (msg.kind) {
    case "init":
      X = makeMat(msg.n, msg.p, new Float64Array(msg.X));
      n = msg.n; p = msg.p; k = msg.k;
      speed = msg.speed;
      mode = msg.mode;
      ppIndex = msg.ppIndex;
      classLabels = msg.classLabels ? new Int32Array(msg.classLabels) : null;
      rng = mulberry32(msg.seed);
      curr = randomBasis(p, k, rng);
      currentFrame = curr;
      frozenRows = new Uint8Array(p);
      frozenValues = new Float64Array(p * k);
      updateFrozenRows(msg.frozenRows, false);
      newTarget();
      running = true;
      startTimer();
      break;
    case "play":
      running = true;
      startTimer();
      break;
    case "pause":
      running = false;
      stopTimer();
      break;
    case "setSpeed":
      speed = msg.speed;
      break;
    case "setFrozenRows":
      updateFrozenRows(msg.frozenRows, true);
      break;
    case "setMode":
      {
        const nextClassLabels = msg.classLabels ? new Int32Array(msg.classLabels) : null;
        const changed =
          mode !== msg.mode ||
          ppIndex !== msg.ppIndex ||
          !sameLabels(classLabels, nextClassLabels);
        mode = msg.mode;
        ppIndex = msg.ppIndex;
        classLabels = nextClassLabels;
        if (changed) newTarget(currentFrame ?? curr ?? undefined);
      }
      break;
    case "setBasis":
      curr = makeMat(p, k, new Float64Array(msg.basis));
      currentFrame = curr;
      recaptureFrozenValues();
      newTarget();
      break;
    case "stop":
      running = false;
      stopTimer();
      X = null; classLabels = null; curr = null; currentFrame = null; target = null; path = null;
      frozenRows = new Uint8Array(0); frozenValues = null; t = 0;
      break;
  }
};

function updateFrozenRows(nextRows: Uint8Array, retarget: boolean): void {
  const next = new Uint8Array(p);
  for (let i = 0; i < Math.min(p, nextRows.length); i++) next[i] = nextRows[i] ? 1 : 0;
  if (!frozenValues || frozenValues.length !== p * k) frozenValues = new Float64Array(p * k);

  const source = currentFrame ?? curr;
  if (source) {
    for (let row = 0; row < p; row++) {
      if (next[row] && !frozenRows[row]) copyRow(source, frozenValues, row);
      if (!next[row]) clearFrozenRow(row);
    }
  }

  frozenRows = next;
  if (retarget && source) {
    currentFrame = applyFrozenRows(source);
    curr = currentFrame;
    newTarget(currentFrame);
  }
}

function recaptureFrozenValues(): void {
  const source = currentFrame ?? curr;
  if (!source || !frozenValues) return;
  for (let row = 0; row < p; row++) {
    if (frozenRows[row]) copyRow(source, frozenValues, row);
  }
}

function applyFrozenRows(candidate: Mat): Mat {
  if (!hasFrozenRows() || !frozenValues) return candidate;
  if (candidate.nrow !== p || candidate.ncol !== k) return candidate;
  return k === 1 ? applyFrozenRows1D(candidate) : applyFrozenRows2D(candidate);
}

function applyFrozenRows1D(candidate: Mat): Mat {
  const out = new Float64Array(candidate.values);
  let fixedNorm = 0;
  let movingNorm = 0;
  let movingCount = 0;

  for (let row = 0; row < p; row++) {
    if (frozenRows[row]) {
      const value = frozenValues![row]!;
      out[row] = value;
      fixedNorm += value * value;
    } else {
      const value = out[row]!;
      movingNorm += value * value;
      movingCount++;
    }
  }

  const remaining = Math.max(0, 1 - fixedNorm);
  if (movingCount === 0) return makeMat(p, 1, out);
  if (movingNorm < 1e-12) {
    let first = true;
    for (let row = 0; row < p; row++) {
      if (frozenRows[row]) continue;
      out[row] = first ? Math.sqrt(remaining) : 0;
      first = false;
    }
    return makeMat(p, 1, out);
  }

  const scale = Math.sqrt(remaining / movingNorm);
  for (let row = 0; row < p; row++) {
    if (!frozenRows[row]) out[row] = out[row]! * scale;
  }
  return makeMat(p, 1, out);
}

function applyFrozenRows2D(candidate: Mat): Mat {
  const out = new Float64Array(candidate.values);
  const movingRows: number[] = [];
  let f00 = 0;
  let f01 = 0;
  let f11 = 0;

  for (let row = 0; row < p; row++) {
    if (frozenRows[row]) {
      const x = frozenValues![row * 2]!;
      const y = frozenValues![row * 2 + 1]!;
      out[row * 2] = x;
      out[row * 2 + 1] = y;
      f00 += x * x;
      f01 += x * y;
      f11 += y * y;
    } else {
      movingRows.push(row);
    }
  }

  if (movingRows.length === 0) return makeMat(p, 2, out);
  const q = orthonormalMovingPair(candidate, movingRows);
  const sqrtS = sqrtSym2(1 - f00, -f01, 1 - f11);

  for (let i = 0; i < movingRows.length; i++) {
    const row = movingRows[i]!;
    const q0 = q.q0[i]!;
    const q1 = q.q1[i]!;
    out[row * 2] = q0 * sqrtS[0] + q1 * sqrtS[2];
    out[row * 2 + 1] = q0 * sqrtS[1] + q1 * sqrtS[3];
  }

  return makeMat(p, 2, out);
}

function orthonormalMovingPair(candidate: Mat, rows: number[]): { q0: Float64Array; q1: Float64Array } {
  const q0 = new Float64Array(rows.length);
  const q1 = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    q0[i] = candidate.values[row * 2]!;
    q1[i] = candidate.values[row * 2 + 1]!;
  }

  normalizeOrBasis(q0, 0);
  let dot = 0;
  for (let i = 0; i < rows.length; i++) dot += q0[i]! * q1[i]!;
  for (let i = 0; i < rows.length; i++) q1[i] = q1[i]! - dot * q0[i]!;
  normalizeOrBasis(q1, 1, q0);
  return { q0, q1 };
}

function normalizeOrBasis(values: Float64Array, preferredIndex: number, against?: Float64Array): void {
  let norm = vectorNorm(values);
  if (norm >= 1e-12) {
    for (let i = 0; i < values.length; i++) values[i] = values[i]! / norm;
    return;
  }

  values.fill(0);
  const start = Math.min(preferredIndex, Math.max(0, values.length - 1));
  for (let offset = 0; offset < values.length; offset++) {
    const idx = (start + offset) % values.length;
    values[idx] = 1;
    if (!against) return;
    let dot = 0;
    for (let i = 0; i < values.length; i++) dot += values[i]! * against[i]!;
    for (let i = 0; i < values.length; i++) values[i] = values[i]! - dot * against[i]!;
    norm = vectorNorm(values);
    if (norm >= 1e-12) {
      for (let i = 0; i < values.length; i++) values[i] = values[i]! / norm;
      return;
    }
    values.fill(0);
  }
}

function vectorNorm(values: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]! * values[i]!;
  return Math.sqrt(sum);
}

function sqrtSym2(a: number, b: number, d: number): [number, number, number, number] {
  const trace = a + d;
  const radius = Math.hypot(a - d, 2 * b);
  const lambda1 = Math.max(0, (trace + radius) / 2);
  const lambda2 = Math.max(0, (trace - radius) / 2);
  const s1 = Math.sqrt(lambda1);
  const s2 = Math.sqrt(lambda2);
  const angle = 0.5 * Math.atan2(2 * b, a - d);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    s1 * c * c + s2 * s * s,
    (s1 - s2) * c * s,
    (s1 - s2) * c * s,
    s1 * s * s + s2 * c * c,
  ];
}

function copyRow(source: Mat, targetValues: Float64Array, row: number): void {
  for (let col = 0; col < k; col++) {
    targetValues[row * k + col] = source.values[row * k + col]!;
  }
}

function clearFrozenRow(row: number): void {
  if (!frozenValues) return;
  for (let col = 0; col < k; col++) frozenValues[row * k + col] = 0;
}

function hasFrozenRows(): boolean {
  for (let i = 0; i < frozenRows.length; i++) {
    if (frozenRows[i]) return true;
  }
  return false;
}

function easeProgress(x: number): number {
  const t0 = Math.max(0, Math.min(1, x));
  return t0 * t0 * t0 * (t0 * (t0 * 6 - 15) + 10);
}

function sameLabels(a: Int32Array | null, b: Int32Array | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
