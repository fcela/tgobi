import type { Column, DeriveSpec, NumericColumn } from "@/lib/data/types";
import { makeNumericColumn } from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

export function applyTransform(
  spec: DeriveSpec,
  source: Column,
  newName: string,
): NumericColumn {
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
