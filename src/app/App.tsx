import { useState } from "react";
import { Layout } from "@/app/Layout";
import { PlotGrid } from "@/app/PlotGrid";
import { VariablePanel } from "@/app/VariablePanel";
import { TourPanel } from "@/app/TourPanel";
import { VariableCircle } from "@/app/VariableCircle";
import { SavedViews } from "@/app/SavedViews";
import { EmptyState } from "@/app/EmptyState";
import { SchemaPreview } from "@/app/SchemaPreview";
import { AddPlotMenu } from "@/app/AddPlotMenu";
import { BrushToolbar } from "@/app/BrushToolbar";
import { ColorToolbar } from "@/app/ColorToolbar";
import { SelectionToolbar } from "@/app/SelectionToolbar";
import { EdgesToolbar } from "@/app/EdgesToolbar";
import { CaseList } from "@/app/CaseList";
import type { LoadedData } from "@/app/loadFile";
import type { ColumnType, DataFrame } from "@/lib/data/types";
import { useAppStore } from "@/store";
import { bitGet } from "@/lib/brush/hitTest";
import { useTourWorker } from "@/lib/tour/useTourWorker";

export function App() {
  useTourWorker();

  const df = useAppStore((s) => s.df);
  const setData = useAppStore((s) => s.setData);
  const setEdgesLayer = useAppStore((s) => s.setEdgesLayer);
  const setSpec = useAppStore((s) => s.setSpec);
  const clear = useAppStore((s) => s.clear);
  const selection = useAppStore((s) => s.selection);
  const tools = useAppStore((s) => s.tools);
  const [pending, setPending] = useState<LoadedData | null>(null);

  const commit = (committed: LoadedData, overrides: Record<string, ColumnType>) => {
    const final = applyOverrides(committed.df, overrides);
    setData(final);
    if (committed.edges) setEdgesLayer(committed.edges, "custom");
    setSpec(final.columns.map((c) => ({ name: c.name, type: c.type, included: true })));
    setPending(null);
  };

  const main = df ? <PlotGrid /> : <EmptyState onLoaded={(d) => setPending(d)} />;
  const dfToCommit = pending;

  const toolbar = (
    <>
      <div className="toolbar-controls">
        {df && (
          <>
            <div className="toolbar-row toolbar-row-primary">
              <AddPlotMenu />
              <BrushToolbar />
              <ColorToolbar />
              <button className="toolbar-button" onClick={() => clear()}>
                Replace data
              </button>
            </div>
            <div className="toolbar-row toolbar-row-secondary">
              <SelectionToolbar />
              <EdgesToolbar />
            </div>
          </>
        )}
      </div>
      <strong className="app-brand">tgobi</strong>
    </>
  );

  let selCount = 0, paintCount = 0, shadowCount = 0, pinCount = 0;
  if (df) {
    for (let i = 0; i < df.nrow; i++) {
      if (bitGet(selection.mask, i)) selCount++;
      if (selection.paint[i]! > 0) paintCount++;
      if (bitGet(selection.shadow, i)) shadowCount++;
      if (bitGet(tools.pinnedRows, i)) pinCount++;
    }
  }

  const status = df
    ? <span>
        {df.nrow - shadowCount} of {df.nrow} visible
        {selCount > 0 && ` · ${selCount} selected`}
        {paintCount > 0 && ` · ${paintCount} painted`}
        {pinCount > 0 && ` · ${pinCount} pinned`}
      </span>
    : <span>no data</span>;

  return (
    <>
      <Layout
        toolbar={toolbar}
        left={<VariablePanel />}
        main={main}
        right={
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <TourPanel />
            <VariableCircle />
            <SavedViews />
            <CaseList />
          </div>
        }
        status={status}
      />
      {dfToCommit && (
        <SchemaPreview
          df={dfToCommit.df}
          onCancel={() => setPending(null)}
          onCommit={(overrides) => commit(dfToCommit, overrides)}
        />
      )}
    </>
  );
}

function applyOverrides(df: DataFrame, overrides: Record<string, ColumnType>): DataFrame {
  // M1 limitation carries forward to M2: overrides are advisory only.
  // Real coercion lives in a later milestone (re-inference under the
  // schema-preview UI). Reading `overrides` here keeps it in scope.
  if (Object.keys(overrides).length === 0) return df;
  return df;
}
