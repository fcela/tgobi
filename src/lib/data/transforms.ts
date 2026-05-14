import type { Column, DataFrame, DeriveSpec, NumericColumn } from "@/lib/data/types";
import { makeNumericColumn } from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

export function applyTransform(
  spec: DeriveSpec,
  source: Column,
  newName: string,
  df?: DataFrame,
): NumericColumn {
  if (spec.kind === "jitter") {
    return applyJitterTransform(spec, source, newName);
  }
  if (spec.kind === "missingIndicator") {
    return applyMissingIndicatorTransform(source, newName);
  }
  if (spec.kind === "imputeFixed") {
    return applyImputeFixedTransform(spec, source, newName);
  }
  if (spec.kind === "imputeRandom") {
    return applyImputeRandomTransform(spec, source, newName);
  }
  if (spec.kind === "imputeConditional") {
    return applyImputeConditionalTransform(spec, source, newName, df);
  }

  if (source.type !== "numeric" && source.type !== "integer") {
    throw new Error(`transform ${spec.kind} requires numeric or integer source, got ${source.type}`);
  }
  const n = source.length;
  const sv = source.values; // Float64Array | Int32Array (numeric indexing OK either way)
  const sm = source.missing;
  const out = new Float64Array(n);
  const outMask = new BitMissingMask(n);

  switch (spec.kind) {
    case "log":
      for (let i = 0; i < n; i++) {
        if (sm.isMissing(i)) { outMask.setMissing(i, true); continue; }
        const v = sv[i]!;
        if (v > 0) out[i] = Math.log(v);
        else outMask.setMissing(i, true);
      }
      break;
    case "sqrt":
      for (let i = 0; i < n; i++) {
        if (sm.isMissing(i)) { outMask.setMissing(i, true); continue; }
        const v = sv[i]!;
        if (v >= 0) out[i] = Math.sqrt(v);
        else outMask.setMissing(i, true);
      }
      break;
    case "negate":
      for (let i = 0; i < n; i++) {
        if (sm.isMissing(i)) { outMask.setMissing(i, true); continue; }
        out[i] = -sv[i]!;
      }
      break;
    case "power": {
      const exponent = spec.exponent;
      for (let i = 0; i < n; i++) {
        if (sm.isMissing(i)) { outMask.setMissing(i, true); continue; }
        const v = Math.pow(sv[i]!, exponent);
        if (Number.isFinite(v)) out[i] = v;
        else outMask.setMissing(i, true);
      }
      break;
    }
    case "standardize": {
      let count = 0, sum = 0;
      for (let i = 0; i < n; i++) if (!sm.isMissing(i)) { sum += sv[i]!; count++; }
      const mean = count > 0 ? sum / count : 0;
      let ss = 0;
      for (let i = 0; i < n; i++) if (!sm.isMissing(i)) { const d = sv[i]! - mean; ss += d * d; }
      const sd = count > 1 ? Math.sqrt(ss / (count - 1)) : 0;
      for (let i = 0; i < n; i++) {
        if (sm.isMissing(i)) { outMask.setMissing(i, true); continue; }
        out[i] = sd > 0 ? (sv[i]! - mean) / sd : 0;
      }
      break;
    }
    case "rank": {
      const idx: number[] = [];
      for (let i = 0; i < n; i++) if (!sm.isMissing(i)) idx.push(i);
      idx.sort((a, b) => sv[a]! - sv[b]!);
      // average tied ranks
      let i = 0;
      while (i < idx.length) {
        let j = i + 1;
        while (j < idx.length && sv[idx[j]!]! === sv[idx[i]!]!) j++;
        const avg = ((i + 1) + j) / 2; // 1-based ranks averaged: (i+1)+(i+2)+...+j over (j-i) terms
        for (let k = i; k < j; k++) out[idx[k]!] = avg;
        i = j;
      }
      for (let k = 0; k < n; k++) if (sm.isMissing(k)) outMask.setMissing(k, true);
      break;
    }
  }

  return makeNumericColumn(newName, out, outMask);
}

function applyJitterTransform(
  spec: Extract<DeriveSpec, { kind: "jitter" }>,
  source: Column,
  newName: string,
): NumericColumn {
  if (source.type !== "numeric" && source.type !== "integer" && source.type !== "categorical") {
    throw new Error(`transform jitter requires numeric, integer, or categorical source, got ${source.type}`);
  }
  if (!Number.isFinite(spec.amplitude) || spec.amplitude < 0) {
    throw new Error("transform jitter requires a non-negative finite amplitude");
  }
  if (!Number.isFinite(spec.seed)) {
    throw new Error("transform jitter requires a finite seed");
  }

  const n = source.length;
  const out = new Float64Array(n);
  const outMask = new BitMissingMask(n);
  const seed = Math.trunc(spec.seed);
  for (let i = 0; i < n; i++) {
    if (source.missing.isMissing(i)) {
      outMask.setMissing(i, true);
      continue;
    }
    const base = source.type === "categorical" ? source.codes[i]! : source.values[i]!;
    const offset = (rowRandom(seed, i) * 2 - 1) * spec.amplitude;
    out[i] = base + offset;
  }
  return makeNumericColumn(newName, out, outMask);
}

function rowRandom(seed: number, row: number): number {
  let x = (seed | 0) ^ Math.imul(row + 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}

function applyMissingIndicatorTransform(
  source: Column,
  newName: string,
): NumericColumn {
  const n = source.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = source.missing.isMissing(i) ? 1 : 0;
  }
  return makeNumericColumn(newName, out, new BitMissingMask(n));
}

function applyImputeFixedTransform(
  spec: Extract<DeriveSpec, { kind: "imputeFixed" }>,
  source: Column,
  newName: string,
): NumericColumn {
  const n = source.length;
  const out = new Float64Array(n);
  const src = source.type === "categorical" ? source.codes : source.values;
  for (let i = 0; i < n; i++) {
    if (source.missing.isMissing(i)) {
      out[i] = spec.value;
    } else {
      out[i] = src[i]!;
    }
  }
  return makeNumericColumn(newName, out, new BitMissingMask(n));
}

function applyImputeRandomTransform(
  spec: Extract<DeriveSpec, { kind: "imputeRandom" }>,
  source: Column,
  newName: string,
): NumericColumn {
  const n = source.length;
  const out = new Float64Array(n);
  const src = source.type === "categorical" ? source.codes : source.values;
  const observed: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!source.missing.isMissing(i)) observed.push(src[i]!);
  }
  if (observed.length === 0) {
    return makeNumericColumn(newName, out, new BitMissingMask(n));
  }
  let state = Math.trunc(spec.seed) | 0;
  for (let i = 0; i < n; i++) {
    if (source.missing.isMissing(i)) {
      state = xorshift32(state);
      const idx = ((state >>> 0) / 0x100000000) * observed.length;
      out[i] = observed[Math.floor(idx)]!;
    } else {
      out[i] = src[i]!;
    }
  }
  return makeNumericColumn(newName, out, new BitMissingMask(n));
}

function applyImputeConditionalTransform(
  spec: Extract<DeriveSpec, { kind: "imputeConditional" }>,
  source: Column,
  newName: string,
  df?: DataFrame,
): NumericColumn {
  if (!df) {
    return applyImputeRandomTransform(
      { kind: "imputeRandom", source: spec.source, seed: spec.seed },
      source,
      newName,
    );
  }
  const condCol = df.column(spec.condVar);
  if (!condCol || condCol.type !== "categorical") {
    return applyImputeRandomTransform(
      { kind: "imputeRandom", source: spec.source, seed: spec.seed },
      source,
      newName,
    );
  }
  const n = source.length;
  const out = new Float64Array(n);
  const src = source.type === "categorical" ? source.codes : source.values;
  const byLevel = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (source.missing.isMissing(i) || condCol.missing.isMissing(i)) continue;
    const level = condCol.codes[i]!;
    let bucket = byLevel.get(level);
    if (!bucket) { bucket = []; byLevel.set(level, bucket); }
    bucket.push(src[i]!);
  }
  let state = Math.trunc(spec.seed) | 0;
  for (let i = 0; i < n; i++) {
    if (!source.missing.isMissing(i)) {
      out[i] = src[i]!;
      continue;
    }
    if (condCol.missing.isMissing(i)) {
      state = xorshift32(state);
      const allObserved: number[] = [];
      for (const vals of byLevel.values()) allObserved.push(...vals);
      if (allObserved.length === 0) { out[i] = 0; continue; }
      const idx = ((state >>> 0) / 0x100000000) * allObserved.length;
      out[i] = allObserved[Math.floor(idx)]!;
      continue;
    }
    const level = condCol.codes[i]!;
    const bucket = byLevel.get(level);
    if (!bucket || bucket.length === 0) {
      const allObserved: number[] = [];
      for (const vals of byLevel.values()) allObserved.push(...vals);
      if (allObserved.length === 0) { out[i] = 0; continue; }
      state = xorshift32(state);
      const idx = ((state >>> 0) / 0x100000000) * allObserved.length;
      out[i] = allObserved[Math.floor(idx)]!;
      continue;
    }
    state = xorshift32(state);
    const idx = ((state >>> 0) / 0x100000000) * bucket.length;
    out[i] = bucket[Math.floor(idx)]!;
  }
  return makeNumericColumn(newName, out, new BitMissingMask(n));
}

function xorshift32(state: number): number {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return x;
}
