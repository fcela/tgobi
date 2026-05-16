import { useAppStore } from "@/store";
import type { ColorEncoding } from "@/store/types";
import { HelpPopover } from "@/app/HelpPopover";

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
      <HelpPopover content={<><p className="help-title">Color Encoding</p><p>How point colors are determined. Color is one of the most powerful visual channels — it lets you see group structure, gradients, and outliers at a glance.</p><div className="help-measures"><span className="mname">fixed</span><span className="mdesc">All points are the same color. Simplest view, good for focusing on position.</span><span className="mname">brushed groups</span><span className="mdesc">Color by your paint groups (brushed clusters). Each paint color group gets a distinct color. Essential for seeing how your labeled groups distribute across plots.</span><span className="mname">by variable</span><span className="mdesc">Color by a data column. Numeric variables get a gradient; categorical variables get distinct colors. Choose the variable and color scale below.</span></div></>} />
      <select
        aria-label="color encoding"
        value={encoding.kind}
        onChange={(e) => onEncodingChange(e.target.value)}
      >
        <option value="fixed">fixed</option>
        <option value="paint" title="Color points by brushed/painted group">brushed groups</option>
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
          <HelpPopover content={<><p className="help-title">Color Scale</p><div className="help-measures"><span className="mname">categorical</span><span className="mdesc">Distinct colors for each unique value. Use for groups with no ordering (species, region).</span><span className="mname">sequential</span><span className="mdesc">Gradient from light to dark. Use for ordered numeric values (temperature, income). Darker = higher.</span><span className="mname">diverging</span><span className="mdesc">Two-tone gradient with a neutral midpoint. Use when there's a meaningful center (zero, average, threshold). Blue = below, red = above.</span></div></>} />
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
      <HelpPopover content={<><p className="help-title">Color Palette</p><p>The set of colors used for encoding. Different palettes are optimized for different purposes.</p><div className="help-measures"><span className="mname">tableau10</span><span className="mdesc">10 distinct, well-separated colors. Good default for categorical data.</span><span className="mname">viridis</span><span className="mdesc">Perceptually uniform gradient (blue → green → yellow). Excellent for sequential data — equal steps in data look like equal steps in color.</span><span className="mname">RdBu</span><span className="mdesc">Red-Blue diverging. Good for data with a meaningful midpoint.</span></div></>} />
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
      <HelpPopover content={<><p className="help-title">Convex Hulls</p><p>Draw convex hull outlines around groups of points.</p><p><b>Color</b>: Hulls around groups defined by a categorical color variable. Shows the spatial extent of each category.</p><p><b>Paint</b>: Hulls around your brushed/painted groups. Useful for seeing how groups separate in the plot.</p></>} />
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
