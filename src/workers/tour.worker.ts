import { makeMat } from "@/lib/linalg/types";
import type { Mat } from "@/lib/linalg/types";
import { multiply } from "@/lib/linalg/matmul";
import { randomBasis, mulberry32 } from "@/lib/linalg/random";
import { gramSchmidt } from "@/lib/linalg/qr";
import { tourPath } from "@/lib/linalg/geodesic";
import { applyFrozenRowsPure } from "@/lib/linalg/frozen";
import { projectionPursuitTarget } from "@/lib/tour-pp/optimizer";
import { projectionPursuitValueForProjection } from "@/lib/tour-pp/indices";
import type { ProjectionPursuitIndex } from "@/lib/tour-pp/indices";
import { buildKeyframeSpline, arcLengthToU } from "@/lib/linalg/catmullRom";
import type { KeyframeSpline } from "@/lib/linalg/catmullRom";

type InMessage =
  | {
    kind: "init";
    X: Float64Array;
    n: number;
    p: number;
    k: 1 | 2;
    speed: number;
    seed: number;
    mode: "grand" | "pp" | "manual" | "guided" | "langevin";
    ppIndex: ProjectionPursuitIndex;
    classLabels: Int32Array | null;
    frozenRows: Uint8Array;
  }
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "setMode"; mode: "grand" | "pp" | "manual" | "guided" | "langevin"; ppIndex: ProjectionPursuitIndex; classLabels: Int32Array | null }
  | { kind: "setSpeed"; speed: number }
  | { kind: "setFrozenRows"; frozenRows: Uint8Array }
  | { kind: "setManualValue"; varIndex: number; value: number }
  | { kind: "setBasis"; basis: Float64Array }
  | { kind: "setKeyframes"; keyframes: Float64Array[] }
  | { kind: "setScrubberT"; t: number }
  | { kind: "setLangevinParams"; step: number; diffusion: number }
  | { kind: "stop" };

type OutMessage = { kind: "frame"; basis: Float64Array; proj: Float64Array; t: number; ppValue: number | null };

let X: Mat | null = null;
let n = 0, p = 0, k: 1 | 2 = 2;
let speed = 1200;
let mode: "grand" | "pp" | "manual" | "guided" | "langevin" = "grand";
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

let keyframeSpline: KeyframeSpline | null = null;
let guidedU = 0;
let guidedDirection: 1 | -1 = 1;
let scrubberT = -1;

let langevinStep = 0.05;
let langevinDiffusion = 1.0;

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
  if (!running || !X) return;

  if (mode === "guided" && keyframeSpline && keyframeSpline.numKeyframes >= 2) {
    tickGuided();
    return;
  }

  if (mode === "langevin") {
    tickLangevin();
    return;
  }

  if (!path || !curr || !target) return;
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
  (self as unknown as Worker).postMessage(msg, [proj.buffer]);
}

function tickGuided(): void {
  if (!keyframeSpline || !X) return;

  if (scrubberT >= 0) {
    guidedU = scrubberT;
    scrubberT = -1;
  } else {
    guidedU += guidedDirection * (1 / Math.max(1, speed)) / keyframeSpline.totalArcLength;
    if (guidedU >= 1) { guidedU = 1; guidedDirection = -1; }
    if (guidedU <= 0) { guidedU = 0; guidedDirection = 1; }
  }

  const B = keyframeSpline.eval(guidedU);
  currentFrame = B;
  curr = B;
  const proj = multiply(X, B).values;
  const basisCopy = new Float64Array(B.values);
  const msg: OutMessage = { kind: "frame", basis: basisCopy, proj, t: guidedU, ppValue: null };
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

function rebuildSpline(kfBases: Float64Array[]): void {
  if (kfBases.length < 2) { keyframeSpline = null; return; }
  const mats = kfBases.map((b) => makeMat(p, k, new Float64Array(b)));
  keyframeSpline = buildKeyframeSpline(mats);
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
  case "setMode": {
    const nextClassLabels = msg.classLabels ? new Int32Array(msg.classLabels) : null;
    const changed = mode !== msg.mode || ppIndex !== msg.ppIndex || !sameLabels(classLabels, nextClassLabels);
    mode = msg.mode;
    ppIndex = msg.ppIndex;
    classLabels = nextClassLabels;
    if (mode === "guided") {
      guidedU = 0;
      guidedDirection = 1;
    } else if (mode === "langevin") {
      t = 0;
    } else if (changed) {
      newTarget(currentFrame ?? curr ?? undefined);
    }
    break;
  }
    case "setFrozenRows":
      updateFrozenRows(msg.frozenRows, true);
      break;
    case "setManualValue":
      if (frozenValues && msg.varIndex >= 0 && msg.varIndex < p) {
        const row = msg.varIndex;
        const mag = Math.max(-1, Math.min(1, msg.value));
        if (k === 1) {
          frozenValues[row] = mag;
        } else {
          const currMag = Math.sqrt(
            frozenValues[row * 2]! * frozenValues[row * 2]! +
            frozenValues[row * 2 + 1]! * frozenValues[row * 2 + 1]!
          );
          if (currMag < 1e-12) {
            frozenValues[row * 2] = mag;
            frozenValues[row * 2 + 1] = 0;
          } else {
            const scale = Math.abs(mag) < 1e-12 ? 0 : mag / currMag;
            frozenValues[row * 2] = frozenValues[row * 2]! * scale;
            frozenValues[row * 2 + 1] = frozenValues[row * 2 + 1]! * scale;
          }
        }
        if (!frozenRows[row]) {
          frozenRows[row] = 1;
          const source = currentFrame ?? curr;
          if (source) copyRow(source, frozenValues, row);
        }
        const source = currentFrame ?? curr;
        if (source) {
          currentFrame = applyFrozenRows(source);
          curr = currentFrame;
          newTarget(currentFrame);
        }
      }
      break;
    case "setBasis":
      curr = makeMat(p, k, new Float64Array(msg.basis));
      currentFrame = curr;
      recaptureFrozenValues();
      newTarget();
      break;
    case "setKeyframes":
      rebuildSpline(msg.keyframes);
      if (mode === "guided" && keyframeSpline) {
        guidedU = 0;
        guidedDirection = 1;
      }
      break;
  case "setScrubberT":
    if (mode === "guided") {
      scrubberT = Math.max(0, Math.min(1, msg.t));
      if (!running) {
        running = true;
        startTimer();
        setTimeout(() => { running = false; stopTimer(); }, 50);
      }
    }
    break;
  case "setLangevinParams":
    langevinStep = msg.step;
    langevinDiffusion = msg.diffusion;
    break;
  case "stop":
      running = false;
      stopTimer();
      X = null; classLabels = null; curr = null; currentFrame = null; target = null; path = null;
      frozenRows = new Uint8Array(0); frozenValues = null; t = 0;
      keyframeSpline = null; guidedU = 0; guidedDirection = 1; scrubberT = -1;
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
  return applyFrozenRowsPure(candidate, frozenRows, frozenValues);
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

function gauss(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function tickLangevin(): void {
  if (!X || !curr) return;
  const p = curr.nrow;
  const k = curr.ncol;
  const dt = langevinStep;
  const T = langevinDiffusion;

  const noise = new Float64Array(p * k);
  for (let i = 0; i < p * k; i++) {
    noise[i] = gauss(rng);
  }

  const CtN = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let r = 0; r < p; r++) {
        s += curr.values[r * k + i]! * noise[r * k + j]!;
      }
      CtN[i * k + j] = s;
    }
  }

  const tangent = new Float64Array(p * k);
  for (let r = 0; r < p; r++) {
    for (let c = 0; c < k; c++) {
      let val = noise[r * k + c]!;
      for (let j = 0; j < k; j++) {
        val -= curr.values[r * k + j]! * CtN[j * k + c]!;
      }
      tangent[r * k + c] = val;
    }
  }

  const scale = Math.sqrt(dt * 2 * T);
  const next = new Float64Array(p * k);
  for (let i = 0; i < p * k; i++) {
    next[i] = curr.values[i]! + scale * tangent[i]!;
  }

  let B_new: Mat;
  try {
    B_new = gramSchmidt(makeMat(p, k, next));
  } catch {
    return;
  }

  B_new = applyFrozenRows(B_new);
  currentFrame = B_new;
  curr = B_new;
  t += 1 / Math.max(1, speed);
  const proj = multiply(X, B_new).values;
  const basisCopy = new Float64Array(B_new.values);
  const msg: OutMessage = { kind: "frame", basis: basisCopy, proj, t, ppValue: null };
  (self as unknown as Worker).postMessage(msg, [proj.buffer]);
}

function sameLabels(a: Int32Array | null, b: Int32Array | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
