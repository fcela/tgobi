import { computeMapper } from "@/lib/mapper";
import { mapperSweep, type SweepResult } from "@/lib/mapper/sweep";
import type { MapperParams } from "@/lib/mapper";

type InMessage =
  | { kind: "compute"; values: Float64Array; missing: Uint8Array; nRows: number; dataCols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array; name: string }>; params: MapperParams }
  | { kind: "sweep"; values: Float64Array; missing: Uint8Array; nRows: number; dataCols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array; name: string }>; params: MapperParams; intervalRange: number[]; overlapRange: number[] };

type OutMessage =
  | { kind: "graph"; graph: ReturnType<typeof computeMapper> }
  | { kind: "sweep"; results: SweepResult[] }
  | { kind: "error"; error: string };

self.onmessage = (e: MessageEvent<InMessage>) => {
  try {
    const msg = e.data;
    if (msg.kind === "compute") {
      const { values, missing, nRows, dataCols, params } = msg;
      const graph = computeMapper(values, missing, nRows, dataCols, params);
      (self as unknown as Worker).postMessage({ kind: "graph", graph } as OutMessage);
    } else if (msg.kind === "sweep") {
      const { values, missing, nRows, dataCols, params, intervalRange, overlapRange } = msg;
      const results = mapperSweep(values, missing, nRows, dataCols, params, intervalRange, overlapRange);
      (self as unknown as Worker).postMessage({ kind: "sweep", results } as OutMessage);
    }
  } catch (err) {
    const out: OutMessage = { kind: "error", error: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(out);
  }
};
