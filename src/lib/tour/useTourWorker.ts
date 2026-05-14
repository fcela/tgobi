import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { toStandardisedMatrix } from "@/lib/tour/standardize";
import { bitGet } from "@/lib/brush/hitTest";

// Vite worker import — resolved at build time (see src/workers/worker-types.d.ts):
import TourWorker from "@/workers/tour.worker.ts?worker";

export function useTourWorker(): void {
  const df = useAppStore((s) => s.df);
  const tour = useAppStore((s) => s.tour);
  const spec = useAppStore((s) => s.spec);
  const shadow = useAppStore((s) => s.selection.shadow);
  const paint = useAppStore((s) => s.selection.paint);
  const setTourFrame = useAppStore((s) => s.setTourFrame);

  const workerRef = useRef<Worker | null>(null);

  const scalingKey = tour.activeVars.map((v) => {
    const s = spec.find((vs) => vs.name === v);
    return `${v}:${s?.scaling ?? ""}`;
  }).join(",");

  // Spin up / tear down the worker as `activePanelId` toggles.
  useEffect(() => {
    if (tour.activePanelId == null || !df || tour.activeVars.length < (tour.shape === "2d" ? 2 : 1)) {
      // ensure no worker around
      if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
      return;
    }

    const worker = new TourWorker() as Worker;
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<{ kind: "frame"; basis: Float64Array; proj: Float64Array; t: number; ppValue?: number | null }>) => {
      const { basis, proj, t, ppValue } = e.data;
      setTourFrame(basis, proj, t, ppValue);
    };

    const X = toStandardisedMatrix(df, tour.activeVars, shadow, spec);
    const classLabels = buildClassLabelsFromPaint(paint, shadow, df.nrow);
    const k = tour.shape === "1d" ? 1 : 2;
    worker.postMessage(
      {
        kind: "init",
        X: X.values,
        n: X.nrow,
        p: X.ncol,
        k,
        speed: tour.speed,
        seed: Math.floor(Math.random() * 1e9),
        mode: tour.mode,
        ppIndex: tour.ppIndex,
        classLabels,
        frozenRows: buildFrozenRows(tour.activeVars, tour.frozenVars),
      },
    );

    return () => {
      worker.postMessage({ kind: "stop" });
      worker.terminate();
      workerRef.current = null;
    };
    // Re-init on var/shape/df change. Speed and mode changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [df, tour.activePanelId, tour.shape, tour.activeVars.join(","), scalingKey, shadow]);

  // Play/pause
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    w.postMessage({ kind: tour.isPlaying ? "play" : "pause" });
  }, [tour.isPlaying]);

  // Speed change (no re-init)
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    w.postMessage({ kind: "setSpeed", speed: tour.speed });
  }, [tour.speed]);

  // Freeze/release individual variables without restarting the worker.
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    w.postMessage({
      kind: "setFrozenRows",
      frozenRows: buildFrozenRows(tour.activeVars, tour.frozenVars),
    });
  }, [tour.activeVars, tour.frozenVars]);

  // Manual tour: update a frozen variable's contribution
  useEffect(() => {
    const w = workerRef.current;
    if (!w || tour.manualVar == null) return;
    const varIndex = tour.activeVars.indexOf(tour.manualVar);
    if (varIndex < 0) return;
    w.postMessage({ kind: "setManualValue", varIndex, value: tour.manualValue });
  }, [tour.manualVar, tour.manualValue, tour.activeVars]);

  // Switch between a free grand tour and PP-guided targets without restarting.
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    const classLabels = buildClassLabelsFromPaint(paint, shadow, df?.nrow ?? 0);
    w.postMessage({ kind: "setMode", mode: tour.mode, ppIndex: tour.ppIndex, classLabels });
  }, [df, shadow, paint, tour.mode, tour.ppIndex]);

  // Restore view → setBasis on the worker (it'll continue from there)
  useEffect(() => {
    const w = workerRef.current;
    if (!w || !tour.basis) return;
    if (tour.t === 1 && !tour.isPlaying) {
      w.postMessage({ kind: "setBasis", basis: new Float64Array(tour.basis) });
    }
  }, [tour.basis, tour.t, tour.isPlaying]);
}

function buildFrozenRows(activeVars: ReadonlyArray<string>, frozenVars: ReadonlyArray<string>): Uint8Array {
  const frozen = new Set(frozenVars);
  const rows = new Uint8Array(activeVars.length);
  for (let i = 0; i < activeVars.length; i++) {
    rows[i] = frozen.has(activeVars[i]!) ? 1 : 0;
  }
  return rows;
}

function buildClassLabelsFromPaint(paint: Uint8Array, shadow: Uint8Array, nrow: number): Int32Array | null {
  const n = Math.min(nrow, paint.length, shadow.length * 8);
  if (n === 0) return null;

  let hasAnyPaint = false;
  for (let i = 0; i < n; i++) {
    if (paint[i]! > 0 && !bitGet(shadow, i)) {
      hasAnyPaint = true;
      break;
    }
  }
  if (!hasAnyPaint) return null;

  // Map paint values to consecutive class labels starting at 0
  const paintToClass = new Map<number, number>();
  const labels = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (bitGet(shadow, i)) continue;
    const p = paint[i]!;
    if (p <= 0) continue;
    let cls = paintToClass.get(p);
    if (cls === undefined) {
      cls = paintToClass.size;
      paintToClass.set(p, cls);
    }
    labels[i] = cls;
  }

  return paintToClass.size >= 2 ? labels : null;
}
