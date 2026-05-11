import { useAppStore } from "@/store";
import type { ColorEncoding } from "@/store/types";

export function ColorToolbar() {
  const df = useAppStore((s) => s.df);
  const encoding = useAppStore((s) => s.color.encoding);
  const palette = useAppStore((s) => s.color.palette);
  const hulls = useAppStore((s) => s.hulls);
  const setColorEncoding = useAppStore((s) => s.setColorEncoding);
  const setColorPalette = useAppStore((s) => s.setColorPalette);
  const setColorHullsVisible = useAppStore((s) => s.setColorHullsVisible);
  const setPaintHullsVisible = useAppStore((s) => s.setPaintHullsVisible);

  const colorHullsAvailable =
    encoding.kind === "byVar" &&
    encoding.scale === "categorical" &&
    df?.column(encoding.var)?.type === "categorical";

  const onEncodingChange = (kind: string) => {
    if (kind === "fixed") setColorEncoding({ kind: "fixed" });
    else if (kind === "paint") setColorEncoding({ kind: "paint" });
    else if (kind === "byVar" && df && df.columns.length > 0) {
      const c = df.columns[0]!;
      const scale = c.type === "categorical" ? "categorical" : "sequential";
      setColorEncoding({ kind: "byVar", var: c.name, scale });
    }
  };

  const onVarChange = (name: string) => {
    if (encoding.kind !== "byVar" || !df) return;
    const c = df.column(name);
    const scale = c?.type === "categorical" ? "categorical" : "sequential";
    setColorEncoding({ kind: "byVar", var: name, scale } as ColorEncoding);
  };

  const onScaleChange = (scale: string) => {
    if (encoding.kind !== "byVar") return;
    if (scale !== "categorical" && scale !== "sequential" && scale !== "diverging") return;
    setColorEncoding({ kind: "byVar", var: encoding.var, scale });
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
      <span style={{ color: "var(--text-dim)" }}>Color:</span>
      <select
        aria-label="color encoding"
        value={encoding.kind}
        onChange={(e) => onEncodingChange(e.target.value)}
      >
        <option value="fixed">fixed</option>
        <option value="paint">paint</option>
        <option value="byVar" disabled={!df || df.columns.length === 0}>by variable</option>
      </select>
      {encoding.kind === "byVar" && df && (
        <>
          <select
            aria-label="color variable"
            value={encoding.var}
            onChange={(e) => onVarChange(e.target.value)}
          >
            {df.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <select
            aria-label="color scale"
            value={encoding.scale}
            onChange={(e) => onScaleChange(e.target.value)}
          >
            <option value="categorical">categorical</option>
            <option value="sequential">sequential</option>
            <option value="diverging">diverging</option>
          </select>
        </>
      )}
      <select
        aria-label="palette"
        value={palette}
        onChange={(e) => setColorPalette(e.target.value)}
      >
        <option value="tableau10">tableau10</option>
        <option value="viridis">viridis</option>
        <option value="RdBu">RdBu</option>
      </select>
      <span style={{ width: 12 }} />
      <span style={{ color: "var(--text-dim)" }}>Hulls:</span>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={hulls.colorGroups}
          disabled={!colorHullsAvailable}
          onChange={(e) => setColorHullsVisible(e.currentTarget.checked)}
        />
        Color
      </label>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={hulls.paintGroups}
          onChange={(e) => setPaintHullsVisible(e.currentTarget.checked)}
        />
        Paint
      </label>
    </div>
  );
}
