import Papa from "papaparse";
import type { Edges } from "@/lib/edges/types";
import type { DataFrame } from "@/lib/data/types";
import { parseJson } from "@/lib/io/json";

export function parseEdgesCsv(text: string, nrow: number, delimiter?: string): Edges {
  if (text.trim().length === 0) throw new Error("edge CSV input is empty");
  const result = Papa.parse<Record<string, string>>(text, {
    delimiter,
    skipEmptyLines: true,
    header: true,
  });
  if (result.errors.length > 0) {
    const e = result.errors[0]!;
    throw new Error(`edge CSV parse error at row ${e.row}: ${e.message}`);
  }
  return buildEdgesFromRecords(result.data, nrow);
}

export function parseEdgesJson(input: unknown, nrow: number): Edges {
  if (!Array.isArray(input)) {
    throw new Error("edge JSON must be an array of records");
  }
  return buildEdgesFromRecords(input as Array<Record<string, unknown>>, nrow);
}

export function buildEdgesFromRecords(rows: Array<Record<string, unknown>>, nrow: number): Edges {
  if (nrow < 1) throw new Error("cannot load edges without node rows");
  const pairs: Array<[number, number]> = [];
  const rawPairs: Array<[unknown, unknown]> = [];
  const edgeRows: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const source = firstValue(row, ["source", "src", "from"]);
    const target = firstValue(row, ["target", "destination", "dest", "dst", "to"]);
    if (source == null && target == null) continue;
    rawPairs.push([source, target]);
    edgeRows.push(row);
  }
  if (rawPairs.length === 0) {
    throw new Error("edge data needs source/target columns");
  }

  const numeric = rawPairs.map(([source, target]) => [
    parseEndpoint(source, "source"),
    parseEndpoint(target, "target"),
  ] as [number, number]);
  const oneBased = inferOneBased(numeric, nrow);
  for (const [source, target] of numeric) {
    const a = oneBased ? source - 1 : source;
    const b = oneBased ? target - 1 : target;
    if (a < 0 || b < 0 || a >= nrow || b >= nrow) {
      throw new Error(`edge endpoint out of range: ${source} -> ${target}`);
    }
    pairs.push([a, b]);
  }

  const source = new Int32Array(pairs.length);
  const target = new Int32Array(pairs.length);
  for (let i = 0; i < pairs.length; i++) {
    source[i] = pairs[i]![0];
    target[i] = pairs[i]![1];
  }
  return makeEdges(source, target, buildEdgeAttrs(edgeRows));
}

export function buildEdgesFromEndpointPairs(
  rawPairs: ReadonlyArray<readonly [string, string]>,
  nrow: number,
  idByRowId = new Map<string, number>(),
  attrRows?: ReadonlyArray<Record<string, unknown>>,
): Edges | null {
  if (rawPairs.length === 0) return null;
  const parsed: Array<[number, number]> = [];
  const numericPairs: Array<[number, number]> = [];
  const deferred: Array<readonly [string, string]> = [];

  for (const [sourceRaw, targetRaw] of rawPairs) {
    const sourceId = idByRowId.get(sourceRaw);
    const targetId = idByRowId.get(targetRaw);
    if (sourceId != null && targetId != null) {
      parsed.push([sourceId, targetId]);
      continue;
    }
    deferred.push([sourceRaw, targetRaw]);
    numericPairs.push([parseEndpoint(sourceRaw, "source"), parseEndpoint(targetRaw, "target")]);
  }

  if (numericPairs.length > 0) {
    const oneBased = inferOneBased(numericPairs, nrow);
    for (let i = 0; i < numericPairs.length; i++) {
      const [source, target] = numericPairs[i]!;
      const a = oneBased ? source - 1 : source;
      const b = oneBased ? target - 1 : target;
      if (a < 0 || b < 0 || a >= nrow || b >= nrow) {
        const [rawSource, rawTarget] = deferred[i]!;
        throw new Error(`edge endpoint out of range: ${rawSource} -> ${rawTarget}`);
      }
      parsed.push([a, b]);
    }
  }

  const source = new Int32Array(parsed.length);
  const target = new Int32Array(parsed.length);
  for (let i = 0; i < parsed.length; i++) {
    source[i] = parsed[i]![0];
    target[i] = parsed[i]![1];
  }
  return makeEdges(source, target, buildEdgeAttrs(attrRows));
}

function makeEdges(source: Int32Array, target: Int32Array, attrs: DataFrame | undefined): Edges {
  return attrs ? { source, target, directed: false, attrs } : { source, target, directed: false };
}

function firstValue(row: Record<string, unknown>, names: ReadonlyArray<string>): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return null;
}

function buildEdgeAttrs(rows: ReadonlyArray<Record<string, unknown>> | undefined): DataFrame | undefined {
  if (!rows || rows.length === 0) return undefined;
  const attrRows = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!isEndpointName(key)) out[key] = value;
    }
    return out;
  });
  if (!attrRows.some((row) => Object.keys(row).length > 0)) return undefined;
  return parseJson(attrRows);
}

function isEndpointName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "source" ||
    lower === "src" ||
    lower === "from" ||
    lower === "target" ||
    lower === "destination" ||
    lower === "dest" ||
    lower === "dst" ||
    lower === "to"
  );
}

function parseEndpoint(value: unknown, name: string): number {
  if (value == null || value === "") throw new Error(`edge ${name} endpoint is missing`);
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n)) throw new Error(`edge ${name} endpoint must be an integer: ${String(value)}`);
  return n;
}

function inferOneBased(pairs: ReadonlyArray<readonly [number, number]>, nrow: number): boolean {
  let min = Infinity;
  let max = -Infinity;
  for (const [source, target] of pairs) {
    min = Math.min(min, source, target);
    max = Math.max(max, source, target);
  }
  if (min >= 1 && max <= nrow) return true;
  return false;
}
