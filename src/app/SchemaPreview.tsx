import { useState } from "react";
import type { ColumnType, DataFrame } from "@/lib/data/types";

export interface SchemaPreviewProps {
  df: DataFrame;
  onCancel: () => void;
  onCommit: (overrides: Record<string, ColumnType>) => void;
}

const ALLOWED_OVERRIDES: ReadonlyArray<ColumnType> = ["numeric", "integer", "categorical"];

export function SchemaPreview({ df, onCancel, onCommit }: SchemaPreviewProps) {
  const [overrides, setOverrides] = useState<Record<string, ColumnType>>({});

  const change = (name: string, type: ColumnType) =>
    setOverrides((cur) => ({ ...cur, [name]: type }));

  return (
    <div className="modal-overlay" role="dialog" aria-label="confirm schema">
      <div className="modal">
        <header>Schema preview — {df.nrow} rows, {df.columns.length} columns</header>
        <div className="body">
          {df.columns.map((c) => {
            const previewVals = previewOf(c, df.nrow);
            const current = overrides[c.name] ?? c.type;
            return (
              <div className="schema-row" key={c.name}>
                <span className="colname">{c.name}</span>
                <select
                  aria-label={`type for ${c.name}`}
                  value={current}
                  onChange={(e) => change(c.name, e.target.value as ColumnType)}
                >
                  {ALLOWED_OVERRIDES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  {c.type === "date" && <option value="date">date</option>}
                </select>
                <span className="preview" title={previewVals}>{previewVals}</span>
              </div>
            );
          })}
        </div>
        <footer>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={() => onCommit(overrides)}>
            Load
          </button>
        </footer>
      </div>
    </div>
  );
}

function previewOf(c: { name: string; length: number;
                       type: ColumnType;
                       values?: ArrayLike<number>;
                       codes?: ArrayLike<number>;
                       levels?: ReadonlyArray<string>;
                       missing: { isMissing: (i: number) => boolean }; },
                   nrow: number): string {
  const k = Math.min(5, nrow);
  const out: string[] = [];
  for (let i = 0; i < k; i++) {
    if (c.missing.isMissing(i)) { out.push("·"); continue; }
    if (c.type === "categorical" && c.codes && c.levels) {
      out.push(c.levels[c.codes[i]!] ?? "?");
    } else if (c.values) {
      out.push(String(c.values[i]));
    } else out.push("?");
  }
  if (nrow > k) out.push("…");
  return out.join(", ");
}
