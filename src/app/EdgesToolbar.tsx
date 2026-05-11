import { useRef, useState } from "react";
import { useAppStore } from "@/store";
import { parseEdgesCsv, parseEdgesJson } from "@/lib/io/edges";
import type { EdgeColorMode, EdgeEditMode } from "@/store/types";

const COLOR_MODES: { value: EdgeColorMode; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "endpoint", label: "Endpoint" },
  { value: "paint", label: "Paint" },
  { value: "attribute", label: "Attribute" },
];

const EDIT_MODES: { value: EdgeEditMode; label: string }[] = [
  { value: "none", label: "Off" },
  { value: "add", label: "Add" },
  { value: "delete", label: "Delete" },
];

export function EdgesToolbar() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const df = useAppStore((s) => s.df);
  const edges = useAppStore((s) => s.edges);
  const setEdgesLayer = useAppStore((s) => s.setEdgesLayer);
  const connectRowsInOrder = useAppStore((s) => s.connectRowsInOrder);
  const clearEdges = useAppStore((s) => s.clearEdges);
  const setEdgesVisible = useAppStore((s) => s.setEdgesVisible);
  const setEdgeAlpha = useAppStore((s) => s.setEdgeAlpha);
  const setEdgeColorMode = useAppStore((s) => s.setEdgeColorMode);
  const setEdgeColorAttr = useAppStore((s) => s.setEdgeColorAttr);
  const setEdgeEditMode = useAppStore((s) => s.setEdgeEditMode);
  const setLinkNodesToEdges = useAppStore((s) => s.setLinkNodesToEdges);
  const setLinkEdgesToNodes = useAppStore((s) => s.setLinkEdgesToNodes);

  const hasLayer = edges.layer != null;
  const edgeCount = edges.layer?.source.length ?? 0;
  const attrColumns = edges.layer?.attrs
    ? edges.layer.attrs.columns.map((c) => c.name)
    : [];

  const handleFile = async (file: File) => {
    if (!df) return;
    setError(null);
    try {
      const lower = file.name.toLowerCase();
      const text = await file.text();
      if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
        setEdgesLayer(parseEdgesCsv(text, df.nrow, lower.endsWith(".tsv") ? "\t" : undefined), "custom");
      } else if (lower.endsWith(".json")) {
        setEdgesLayer(parseEdgesJson(JSON.parse(text), df.nrow), "custom");
      } else {
        throw new Error(`Unsupported edge file extension: ${file.name}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="edges-toolbar">
      <span style={{ color: "var(--text-dim)" }}>Lines:</span>
      <label className="edge-file-button">
        Load
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void handleFile(file);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </label>
      <button
        type="button"
        aria-label="connect rows"
        disabled={!df || df.nrow < 2}
        onClick={connectRowsInOrder}
      >
        Connect
      </button>
      <label className="toolbar-check" title="Show lines">
        <input
          type="checkbox"
          aria-label="show lines"
          disabled={!hasLayer}
          checked={hasLayer && edges.visible}
          onChange={(e) => setEdgesVisible(e.currentTarget.checked)}
        />
        Show
      </label>
      <input
        className="edge-alpha-slider"
        type="range"
        aria-label="line alpha"
        min={0.02}
        max={1}
        step={0.02}
        disabled={!hasLayer}
        value={edges.alpha}
        onChange={(e) => setEdgeAlpha(parseFloat(e.currentTarget.value))}
      />
      <select
        aria-label="edge color mode"
        disabled={!hasLayer}
        value={edges.colorMode}
        onChange={(e) => setEdgeColorMode(e.currentTarget.value as EdgeColorMode)}
      >
        {COLOR_MODES.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      {edges.colorMode === "attribute" && (
        <select
          aria-label="edge color attribute"
          disabled={!hasLayer || attrColumns.length === 0}
          value={edges.colorAttr ?? ""}
          onChange={(e) => setEdgeColorAttr(e.currentTarget.value || null)}
        >
          <option value="">—</option>
          {attrColumns.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      )}
      <label className="toolbar-check" title="Link nodes to edges">
        <input
          type="checkbox"
          aria-label="link nodes to edges"
          disabled={!hasLayer}
          checked={edges.linkNodesToEdges}
          onChange={(e) => setLinkNodesToEdges(e.currentTarget.checked)}
        />
        N-&gt;E
      </label>
      <label className="toolbar-check" title="Link edges to nodes">
        <input
          type="checkbox"
          aria-label="link edges to nodes"
          disabled={!hasLayer}
          checked={edges.linkEdgesToNodes}
          onChange={(e) => setLinkEdgesToNodes(e.currentTarget.checked)}
        />
        E-&gt;N
      </label>
      <span style={{ color: "var(--text-dim)" }}>Edit:</span>
      <select
        aria-label="line edit mode"
        disabled={!df || df.nrow < 2}
        value={edges.editMode}
        onChange={(e) => setEdgeEditMode(e.currentTarget.value as EdgeEditMode)}
      >
        {EDIT_MODES.map((m) => (
          <option key={m.value} value={m.value} disabled={m.value === "delete" && !hasLayer}>
            {m.label}
          </option>
        ))}
      </select>
      <button type="button" disabled={!hasLayer} onClick={clearEdges}>Clear</button>
      {hasLayer && <small>{edgeCount}</small>}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
