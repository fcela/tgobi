import { useAppStore } from "@/store";
import { getPalette } from "@/lib/color/palettes";
import type { BrushTool } from "@/store/types";

const BRUSH_TOOLS: Array<{ name: BrushTool; label: string }> = [
  { name: "rectangle", label: "Rectangle brush" },
  { name: "ellipse", label: "Ellipse brush" },
  { name: "lasso", label: "Freeform brush" },
];

const SHAPES = [
  { name: "circle", index: 1 },
  { name: "square", index: 2 },
  { name: "triangle", index: 3 },
  { name: "diamond", index: 4 },
] as const;

const BRUSH_COLOR_ORDER = [6, 2, 3, 4, 5, 1, 7, 8, 9, 10] as const;

export function BrushToolbar() {
  const mode = useAppStore((s) => s.brush.mode);
  const brushTool = useAppStore((s) => s.brush.tool);
  const paintColor = useAppStore((s) => s.brush.paintColor);
  const paintShape = useAppStore((s) => s.brush.paintShape);
  const palette = useAppStore((s) => s.color.palette);
  const setBrushMode = useAppStore((s) => s.setBrushMode);
  const setBrushTool = useAppStore((s) => s.setBrushTool);
  const setPaintColor = useAppStore((s) => s.setPaintColor);
  const setPaintShape = useAppStore((s) => s.setPaintShape);
  const colors = getPalette(palette);

  return (
    <div className="brush-toolbar">
      <span style={{ color: "var(--text-dim)" }}>Brush:</span>
      <div className="brush-tools" role="group" aria-label="brush geometry">
        {BRUSH_TOOLS.map(({ name, label }) => (
          <button
            key={name}
            aria-label={label}
            title={label}
            className={brushTool === name ? "active" : ""}
            onClick={() => setBrushTool(name)}
          >
            <BrushToolIcon tool={name} />
          </button>
        ))}
      </div>
      <label className="toolbar-check">
        <input
          type="checkbox"
          aria-label="persistent brush"
          checked={mode === "persistent"}
          onChange={(e) => setBrushMode(e.currentTarget.checked ? "persistent" : "transient")}
        />
        Persistent
      </label>
      <div className="swatches" role="group" aria-label="paint colors">
    {BRUSH_COLOR_ORDER.map((colorIndex, slot) => (
      <button
        key={colorIndex}
        aria-label={`paint color ${slot + 1}`}
        title={`Paint color ${slot + 1}`}
        className={paintColor === colorIndex ? "active" : ""}
        style={{ background: colors[(colorIndex - 1) % colors.length] }}
        onClick={() => setPaintColor(colorIndex)}
      />
    ))}
    <button
      key={0}
      aria-label="erase paint"
      title="Erase paint"
      className={paintColor === 0 ? "active" : ""}
      onClick={() => setPaintColor(0)}
    >
      &times;
    </button>
      </div>
      <div className="shape-buttons" role="group" aria-label="paint shapes">
        {SHAPES.map(({ name, index }) => (
          <button
            key={name}
            aria-label={`paint shape ${name}`}
            title={`Paint shape: ${name}`}
            className={paintShape === index ? "active" : ""}
            onClick={() => setPaintShape(index)}
          >
            <span className={`shape-icon ${name}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

function BrushToolIcon({ tool }: { tool: BrushTool }) {
  if (tool === "ellipse") {
    return (
      <svg className="brush-tool-svg" viewBox="0 0 24 18" aria-hidden="true">
        <ellipse cx="12" cy="9" rx="8" ry="5" />
      </svg>
    );
  }
  if (tool === "lasso") {
    return (
      <svg className="brush-tool-svg" viewBox="0 0 24 18" aria-hidden="true">
        <path d="M4 9.5c1.2-5.2 8.8-7.3 13.5-4.8 4.9 2.7 2.4 9.3-3.2 9.6-3.7.2-7.8-1.5-7.1-4.5.5-2.1 3.7-2.6 6.1-.8" />
      </svg>
    );
  }
  return (
    <svg className="brush-tool-svg" viewBox="0 0 24 18" aria-hidden="true">
      <rect x="5" y="4" width="14" height="10" />
    </svg>
  );
}
