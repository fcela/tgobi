import { useMemo } from "react";
import { useAppStore } from "@/store";
import { bitClear, bitGet, bitSet } from "@/lib/brush/hitTest";
import { getPalette } from "@/lib/color/palettes";
import { formatCellValue, formatRowLabel } from "@/lib/data/format";

const MAX_RENDERED_CASES = 500;

export function CaseList() {
  const df = useAppStore((s) => s.df);
  const selection = useAppStore((s) => s.selection);
  const tools = useAppStore((s) => s.tools);
  const paletteName = useAppStore((s) => s.color.palette);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setIdentifyHover = useAppStore((s) => s.setIdentifyHover);
  const togglePinnedIdentify = useAppStore((s) => s.togglePinnedIdentify);
  const clearPinnedIdentify = useAppStore((s) => s.clearPinnedIdentify);
  const setIdentifyLabelVar = useAppStore((s) => s.setIdentifyLabelVar);

  const paintPalette = useMemo(() => getPalette(paletteName), [paletteName]);

  if (!df) {
    return <section className="case-panel empty">No cases</section>;
  }

  const rows = Array.from({ length: Math.min(df.nrow, MAX_RENDERED_CASES) }, (_, i) => i);
  const pinnedCount = countPinned(tools.pinnedRows, df.nrow);
  const inspectRow = validRow(tools.hoverRow, df.nrow)
    ? tools.hoverRow
    : firstPinnedRow(tools.pinnedRows, df.nrow);

  const toggleSelected = (row: number) => {
    const next = new Uint8Array(selection.mask);
    if (bitGet(next, row)) bitClear(next, row);
    else bitSet(next, row);
    setSelectionMask(next);
  };

  return (
    <section className="case-panel" aria-label="cases">
      <header>
        <span>Cases</span>
        <button
          type="button"
          disabled={pinnedCount === 0}
          onClick={clearPinnedIdentify}
        >
          Clear pins
        </button>
      </header>

      <label className="case-label-select">
        <span>Label</span>
        <select
          aria-label="case label variable"
          value={tools.labelVar ?? ""}
          onChange={(e) => setIdentifyLabelVar(e.target.value || null)}
        >
          <option value="">row number</option>
          {df.columns.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </label>

      <div className="case-inspector" aria-label="case inspector">
        {inspectRow == null ? (
          <span className="muted">No case</span>
        ) : (
          <>
            <strong>{formatRowLabel(df, inspectRow, tools.labelVar)}</strong>
            <div className="case-values">
              {df.columns.slice(0, 4).map((c) => (
                <span key={c.name}>
                  {c.name}: {formatCellValue(df, inspectRow, c.name)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="case-list" role="list" aria-label="case rows">
        {rows.map((row) => {
          const selected = bitGet(selection.mask, row);
          const pinned = bitGet(tools.pinnedRows, row);
          const shadowed = bitGet(selection.shadow, row);
          const paint = selection.paint[row] ?? 0;
          const paintColor = paint > 0 ? paintPalette[(paint - 1) % paintPalette.length] : null;
          return (
            <div
              key={row}
              role="listitem"
              className={[
                "case-row",
                selected ? "selected" : "",
                pinned ? "pinned" : "",
                shadowed ? "shadowed" : "",
              ].filter(Boolean).join(" ")}
              onMouseEnter={() => setIdentifyHover(row)}
              onMouseLeave={() => setIdentifyHover(null)}
            >
              <button
                type="button"
                className="case-row-main"
                aria-label={`case ${row + 1}`}
                onClick={() => toggleSelected(row)}
              >
                <span className="case-index">{row + 1}</span>
                {paintColor && <span className="case-swatch" style={{ background: paintColor }} />}
                <span className="case-name">{formatRowLabel(df, row, tools.labelVar)}</span>
              </button>
              <button
                type="button"
                className="case-pin"
                aria-label={`${pinned ? "unpin" : "pin"} case ${row + 1}`}
                title={pinned ? "unpin case" : "pin case"}
                onClick={() => togglePinnedIdentify(row)}
              >
                {pinned ? "●" : "○"}
              </button>
            </div>
          );
        })}
      </div>
      {df.nrow > MAX_RENDERED_CASES && (
        <div className="case-note">Showing first {MAX_RENDERED_CASES} of {df.nrow}</div>
      )}
    </section>
  );
}

function validRow(row: number | null, nrow: number): row is number {
  return row != null && row >= 0 && row < nrow;
}

function firstPinnedRow(pinned: Uint8Array, nrow: number): number | null {
  for (let i = 0; i < nrow; i++) if (bitGet(pinned, i)) return i;
  return null;
}

function countPinned(pinned: Uint8Array, nrow: number): number {
  let count = 0;
  for (let i = 0; i < nrow; i++) if (bitGet(pinned, i)) count++;
  return count;
}
