import { useAppStore } from "@/store";
import { bitGet, bitSet, bitClear } from "@/lib/brush/hitTest";
import type { BrushTarget } from "@/store/types";

const BRUSH_TARGETS: { value: BrushTarget; label: string }[] = [
  { value: "nodes", label: "Nodes" },
  { value: "edges", label: "Edges" },
  { value: "both", label: "Both" },
];

type SelectionIconKind = "exclude" | "include" | "invert" | "isolate" | "restore" | "brush" | "identify";

function SelectionIcon({ kind }: { kind: SelectionIconKind }) {
  return <span className={`selection-icon ${kind}`} aria-hidden="true" />;
}

export function SelectionToolbar() {
  const df = useAppStore((s) => s.df);
  const selection = useAppStore((s) => s.selection);
  const setSelectionShadow = useAppStore((s) => s.setSelectionShadow);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const activeTool = useAppStore((s) => s.tools.active);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const brushTarget = useAppStore((s) => s.brush.target);
  const setBrushTarget = useAppStore((s) => s.setBrushTarget);
  const hasEdges = useAppStore((s) => s.edges.layer != null);

  const exclude = () => {
    if (!df) return;
    const sh = new Uint8Array(selection.shadow);
    for (let i = 0; i < df.nrow; i++) if (bitGet(selection.mask, i)) bitSet(sh, i);
    setSelectionShadow(sh);
  };
  const include = () => {
    if (!df) return;
    const sh = new Uint8Array(selection.shadow);
    for (let i = 0; i < df.nrow; i++) if (bitGet(selection.mask, i)) bitClear(sh, i);
    setSelectionShadow(sh);
  };
  const invert = () => {
    if (!df) return;
    const sh = new Uint8Array(selection.shadow);
    for (let i = 0; i < df.nrow; i++) {
      if (bitGet(sh, i)) bitClear(sh, i); else bitSet(sh, i);
    }
    // make sure the excess bits in the last byte stay zero (so popcount/all-zero work)
    const remainder = df.nrow & 7;
    if (remainder > 0) sh[sh.length - 1] = sh[sh.length - 1]! & ((1 << remainder) - 1);
    setSelectionShadow(sh);
  };
  const excludeAllBut = () => {
    if (!df) return;
    const sh = new Uint8Array(selection.shadow.length);
    for (let i = 0; i < df.nrow; i++) if (!bitGet(selection.mask, i)) bitSet(sh, i);
    setSelectionShadow(sh);
  };
  const restoreAll = () => {
    setSelectionShadow(new Uint8Array(selection.shadow.length));
    if (df) setSelectionMask(new Uint8Array(Math.ceil(df.nrow / 8)));
  };

  return (
    <div className="selection-toolbar">
      <span style={{ color: "var(--text-dim)" }}>Selection:</span>
      <button className="selection-icon-button" aria-label="Exclude" title="Exclude selected rows" onClick={exclude}>
        <SelectionIcon kind="exclude" />
      </button>
      <button className="selection-icon-button" aria-label="Include" title="Include selected rows" onClick={include}>
        <SelectionIcon kind="include" />
      </button>
      <button className="selection-icon-button" aria-label="Invert" title="Invert visible rows" onClick={invert}>
        <SelectionIcon kind="invert" />
      </button>
      <button
        className="selection-icon-button"
        aria-label="Exclude all but selected"
        title="Keep only selected rows visible"
        onClick={excludeAllBut}
      >
        <SelectionIcon kind="isolate" />
      </button>
      <button className="selection-icon-button" aria-label="Restore all" title="Restore all rows" onClick={restoreAll}>
        <SelectionIcon kind="restore" />
      </button>
      <span style={{ color: "var(--text-dim)" }}>Tool:</span>
      <div className="mode-toggle selection-tool-toggle" role="group" aria-label="tool">
        <button
          className={activeTool === "brush" ? "active" : ""}
          aria-label="Brush"
          title="Brush tool"
          onClick={() => setActiveTool("brush")}
        >
          <SelectionIcon kind="brush" />
        </button>
        <button
          className={activeTool === "identify" ? "active" : ""}
          aria-label="Identify"
          title="Identify tool"
          onClick={() => setActiveTool("identify")}
        >
          <SelectionIcon kind="identify" />
        </button>
      </div>
      {hasEdges && (
        <>
          <span style={{ width: 12 }} />
          <span style={{ color: "var(--text-dim)" }}>Target:</span>
          <select
            aria-label="brush target"
            value={brushTarget}
            onChange={(e) => setBrushTarget(e.currentTarget.value as BrushTarget)}
          >
            {BRUSH_TARGETS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </>
      )}
  </div>
  );
}
