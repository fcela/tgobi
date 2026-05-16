import { computeAllPairs, type ScagnosticResult } from "@/lib/scagnostics";

type InMessage = {
  columns: Array<{
    name: string;
    type: string;
    values?: Float64Array | Int32Array;
    missing: { buffer: Uint8Array };
  }>;
  nrow: number;
  variables: string[];
};

type OutMessage =
  | { kind: "result"; results: ScagnosticResult[] }
  | { kind: "error"; error: string };

self.onmessage = (e: MessageEvent<InMessage>) => {
  try {
    const { columns, nrow, variables } = e.data;
    const df = { nrow, columns };
    const results = computeAllPairs(df, variables);
    const msg: OutMessage = { kind: "result", results };
    (self as unknown as Worker).postMessage(msg);
  } catch (err) {
    const msg: OutMessage = { kind: "error", error: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};
