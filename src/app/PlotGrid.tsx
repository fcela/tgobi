import { useAppStore } from "@/store";
import { TileTree } from "@/app/TileTree";

export function PlotGrid() {
  const root = useAppStore((s) => s.plots.root);
  const panels = useAppStore((s) => s.plots.panels);

  if (!root || panels.length === 0) {
    return (
      <div className="plot-grid empty">
        <div className="empty-hint">Use <strong>+ Plot</strong> to add a plot.</div>
      </div>
    );
  }

  return (
    <div className="plot-grid tile-grid">
      <TileTree node={root} />
    </div>
  );
}
