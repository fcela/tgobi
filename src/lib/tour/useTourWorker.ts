import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { toStandardisedMatrix } from "@/lib/tour/standardize";
import { bitGet } from "@/lib/brush/hitTest";
import type { Column, DataFrame } from "@/lib/data/types";

// Vite worker import — resolved at build time (see src/workers/worker-types.d.ts):
import TourWorker from "@/workers/tour.worker.ts?worker";

export function useTourWorker(): void {
  const df = useAppStore((s) => s.df);
  const tour = useAppStore((s) => s.tour);
  const shadow = useAppStore((s) => s.selection.shadow);
  const setTourFrame = useAppStore((s) => s.setTourFrame);

  const workerRef = useRef<Worker | null>(null);

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

    const X = toStandardisedMatrix(df, tour.activeVars, shadow);
    const classLabels = buildClassLabels(df, tour.ppIndex === "lda" ? tour.ppClassVar : null, shadow);
    const k = (tour.shape === "1d" ? 1 : 2) as 1 | 2;
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
  }, [df, tour.activePanelId, tour.shape, tour.activeVars.join(","), shadow]);

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

  // Switch between a free grand tour and PP-guided targets without restarting.
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    const classLabels = buildClassLabels(df, tour.ppIndex === "lda" ? tour.ppClassVar : null, shadow);
    w.postMessage({ kind: "setMode", mode: tour.mode, ppIndex: tour.ppIndex, classLabels });
  }, [df, shadow, tour.mode, tour.ppIndex, tour.ppClassVar]);

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

function buildClassLabels(df: DataFrame | null, classVar: string | null, shadow: Uint8Array): Int32Array | null {
  if (!df || !classVar) return null;
  const col = df.column(classVar);
  if (!col) return null;

  const labels = new Int32Array(df.nrow);
  labels.fill(-1);
  const codeByValue = new Map<string, number>();
  for (let i = 0; i < df.nrow; i++) {
    if (bitGet(shadow, i) || col.missing.isMissing(i)) continue;
    const key = classKey(col, i);
    if (key == null) continue;
    let code = codeByValue.get(key);
    if (code === undefined) {
      code = codeByValue.size;
      codeByValue.set(key, code);
    }
    labels[i] = code;
  }
  return labels;
}

function classKey(col: Column, row: number): string | null {
  if (col.type === "categorical") return `c:${col.codes[row]!}`;
  if (col.type === "integer") return `i:${col.values[row]!}`;
  const value = col.values[row]!;
  return Number.isFinite(value) ? `n:${value}` : null;
}
