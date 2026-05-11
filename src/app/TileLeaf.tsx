import { useState } from "react";
import type { TileLeaf as TileLeafType, PlotPanel } from "@/store/types";
import { useAppStore } from "@/store";
import { Scatter } from "@/plots/scatter/Scatter";
import { Barchart } from "@/plots/barchart/Barchart";
import { Dotplot } from "@/plots/dotplot/Dotplot";
import { Scatmat } from "@/plots/scatmat/Scatmat";
import { Parcoords } from "@/plots/parcoords/Parcoords";

interface TileLeafProps {
  node: TileLeafType;
}

const PANEL_DRAG_MIME = "application/x-tgobi-panel";

export function TileLeaf({ node }: TileLeafProps) {
  const panels = useAppStore((s) => s.plots.panels);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const movePanelToTile = useAppStore((s) => s.movePanelToTile);
  const [dropPosition, setDropPosition] = useState<"center" | "left" | "right" | "top" | "bottom" | null>(null);

  const activePanel = node.activeTab != null ? panels.find((p) => p.id === node.activeTab) : null;

  const handleDragStart = (e: React.DragEvent, panelId: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(PANEL_DRAG_MIME, String(panelId));
    e.dataTransfer.setData("text/plain", String(panelId));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropPosition(dropPositionForEvent(e));
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(PANEL_DRAG_MIME) || e.dataTransfer.getData("text/plain");
    const panelId = Number(raw);
    const position = dropPositionForEvent(e);
    setDropPosition(null);
    if (!Number.isInteger(panelId)) return;
    movePanelToTile(panelId, node.id, position);
  };

  return (
    <div
      className="tile-leaf"
      data-drop={dropPosition ?? undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {node.tabs.length > 0 && (
        <div className="tile-tabs">
          {node.tabs.map((panelId) => {
            const p = panels.find((x) => x.id === panelId);
            const label = p ? panelLabel(p) : `#${panelId}`;
            const isActive = panelId === node.activeTab;
            return (
              <div
                key={panelId}
                className={`tile-tab${isActive ? " active" : ""}`}
                draggable
                onDragStart={(e) => handleDragStart(e, panelId)}
                onClick={() => setActiveTab(node.id, panelId)}
                title="Drag to reorganize"
              >
                <span className="tile-tab-label">{label}</span>
                <button
                  className="tile-tab-close"
                  aria-label={`close plot ${panelId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(node.id, panelId);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="tile-content">
        {activePanel ? (
          renderPanel(activePanel)
        ) : node.tabs.length === 0 ? (
          <div className="tile-empty">No panel</div>
        ) : null}
      </div>
    </div>
  );
}

function panelLabel(panel: PlotPanel): string {
  if (panel.kind === "scatter") return `${panel.x} × ${panel.y}`;
  if (panel.kind === "barchart") return panel.variable;
  if (panel.kind === "dotplot") return panel.variable;
  if (panel.kind === "scatmat") return `scatmat(${panel.variables.length})`;
  return `parcoords(${panel.variables.length})`;
}

function dropPositionForEvent(e: React.DragEvent<HTMLDivElement>): "center" | "left" | "right" | "top" | "bottom" {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const left = x / Math.max(1, rect.width);
  const top = y / Math.max(1, rect.height);
  const edge = 0.24;
  if (left < edge) return "left";
  if (left > 1 - edge) return "right";
  if (top < edge) return "top";
  if (top > 1 - edge) return "bottom";
  return "center";
}

function renderPanel(panel: PlotPanel) {
  switch (panel.kind) {
    case "scatter":
      return <Scatter panel={panel} />;
    case "barchart":
      return <Barchart panel={panel} />;
    case "dotplot":
      return <Dotplot panel={panel} />;
    case "scatmat":
      return <Scatmat panel={panel} />;
    case "parcoords":
      return <Parcoords panel={panel} />;
  }
}
