import { useRef, useState, useEffect, lazy, Suspense } from "react";
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
import { HelpPopover } from "@/app/HelpPopover";
import { LessonOverlay } from "@/app/LessonOverlay";
import { LessonPicker } from "@/app/LessonPicker";
import { LESSONS } from "@/lib/lessons/definitions";

const ClusteringPanel = lazy(() => import("@/app/ClusteringPanel").then((m) => ({ default: m.ClusteringPanel })));
const ClassificationPanel = lazy(() => import("@/app/ClassificationPanel").then((m) => ({ default: m.ClassificationPanel })));
const ProjectionPanel = lazy(() => import("@/app/ProjectionPanel").then((m) => ({ default: m.ProjectionPanel })));
const ScagnosticsPanel = lazy(() => import("@/app/ScagnosticsPanel").then((m) => ({ default: m.ScagnosticsPanel })));
const MapperPanel = lazy(() => import("@/app/MapperPanel").then((m) => ({ default: m.MapperPanel })));
import type { LoadedData } from "@/app/loadFile";
import type { ColumnType, DataFrame } from "@/lib/data/types";
import { coerceDataFrame } from "@/lib/data/coerce";
import { useAppStore } from "@/store";
import { bitGet } from "@/lib/brush/hitTest";
import { useTourWorker } from "@/lib/tour/useTourWorker";
import { exportCsv, downloadCsv } from "@/lib/io/export";
import { useKeyboardShortcuts, SHORTCUTS } from "@/app/useKeyboardShortcuts";

export function App() {
  useTourWorker();
  useKeyboardShortcuts();

  const df = useAppStore((s) => s.df);
  const setData = useAppStore((s) => s.setData);
  const setEdgesLayer = useAppStore((s) => s.setEdgesLayer);
  const setSpec = useAppStore((s) => s.setSpec);
  const clear = useAppStore((s) => s.clear);
  const saveSession = useAppStore((s) => s.saveSession);
  const openSession = useAppStore((s) => s.openSession);
  const selection = useAppStore((s) => s.selection);
  const tools = useAppStore((s) => s.tools);
  const startLesson = useAppStore((s) => s.startLesson);
  const [lessonMenuOpen, setLessonMenuOpen] = useState(false);
  const lessonMenuRef = useRef<HTMLSpanElement | null>(null);
  // Close the lesson menu when the user clicks outside of it. Use
  // `pointerdown` so the close happens before React's click handlers, and
  // explicitly skip clicks inside the menu container so menu-item clicks
  // don't race the close.
  useEffect(() => {
    if (!lessonMenuOpen) return;
    const handler = (e: PointerEvent) => {
      if (lessonMenuRef.current && !lessonMenuRef.current.contains(e.target as Node)) {
        setLessonMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [lessonMenuOpen]);
  const [rightTab, setRightTab] = useState<"tour" | "projection" | "clustering" | "classification" | "scagnostics" | "mapper">("tour");
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
        <HelpPopover content={<><p className="help-title">Export CSV</p><p>Download the currently visible data as a CSV file. Respects shadowing — hidden (excluded) rows are omitted from the export.</p><p>Two extra columns are appended:</p><p><b>_paint_group</b>: the brushed group color index (0 = unpainted).</p><p><b>_cluster</b>: the cluster assignment from the most recent clustering result (empty if none).</p><p><b>Tip:</b> Use Export after painting groups or clustering to save your labels for use in other tools (R, Python, etc.).</p></>} />
        <button
            className="toolbar-button"
            title="Export visible rows to CSV"
            onClick={() => {
              if (!df) return;
              const csv = exportCsv(df, {
                visibleOnly: true,
                shadow: selection.shadow,
                paint: selection.paint,
                cluster: useAppStore.getState().clustering.results,
              });
              downloadCsv(csv, "tgobi-export.csv");
            }}
          >
          Export CSV
        </button>
        <HelpPopover content={<><p className="help-title">Session Save / Open</p><p><b>Save Session</b>: Downloads a JSON file containing your data plus all current settings — paint groups, clustering/classification/projection parameters, tour variables, color encoding, etc. Reload it later to resume exactly where you left off.</p><p><b>Open Session</b>: Loads a previously saved session file. This replaces the current data and settings.</p><p><b>Tip:</b> Use session files to share your analysis state with collaborators, or to checkpoint your progress during a long exploration.</p></>} />
        <button
          className="toolbar-button"
          title="Save session to JSON file"
          onClick={() => saveSession()}
        >Save</button>
        <button
          className="toolbar-button"
          title="Open session from JSON file"
          onClick={() => openSession()}
        >Open</button>
        <span style={{ position: "relative" }} ref={lessonMenuRef}>
          <button
            className="toolbar-button"
            onClick={() => setLessonMenuOpen((v) => !v)}
          >
            Lessons
          </button>
          {lessonMenuOpen && (
            <div className="lesson-toolbar-menu">
              {LESSONS.map((l) => (
                <button
                  key={l.id}
                  className="lesson-toolbar-item"
                  onClick={() => { startLesson(l.id); setLessonMenuOpen(false); }}
                >
                  {l.title}
                </button>
              ))}
            </div>
          )}
        </span>
            </div>
            <div className="toolbar-row toolbar-row-secondary">
              <SelectionToolbar />
              <EdgesToolbar />
            </div>
          </>
        )}
      </div>
      <strong className="app-brand">tgobi</strong>
      <HelpPopover content={<><p className="help-title">Keyboard Shortcuts</p><p>Quick actions accessible from the keyboard. Shortcuts are ignored when focus is in an input field or when modifier keys are held.</p><div className="help-measures">{Object.entries(SHORTCUTS).map(([key, desc]) => (<span className="mname" key={key}><kbd>{key}</kbd></span>)).concat(Object.entries(SHORTCUTS).map(([, desc]) => (<span className="mdesc" key={desc}>{desc}</span>)))}</div></>} />
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
        <div className="right-tabs">
        <button className={rightTab === "tour" ? "right-tab active" : "right-tab"} onClick={() => setRightTab("tour")}>Tour</button>
        <button className={rightTab === "projection" ? "right-tab active" : "right-tab"} onClick={() => setRightTab("projection")}>Project</button>
<button className={rightTab === "clustering" ? "right-tab active" : "right-tab"} onClick={() => setRightTab("clustering")}>Cluster</button>
<button className={rightTab === "classification" ? "right-tab active" : "right-tab"} onClick={() => setRightTab("classification")}>Classify</button>
              <button className={rightTab === "scagnostics" ? "right-tab active" : "right-tab"} onClick={() => setRightTab("scagnostics")}>Scag</button>
              <button className={rightTab === "mapper" ? "right-tab active" : "right-tab"} onClick={() => setRightTab("mapper")}>Mapper</button>
      </div>
        <Suspense fallback={null}>
        {rightTab === "tour" ? <TourPanel /> : rightTab === "projection" ? <ProjectionPanel /> : rightTab === "clustering" ? <ClusteringPanel /> : rightTab === "classification" ? <ClassificationPanel /> : rightTab === "scagnostics" ? <ScagnosticsPanel /> : rightTab === "mapper" ? <MapperPanel /> : <ScagnosticsPanel />}
        </Suspense>
          {rightTab === "tour" && <VariableCircle />}
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
      <LessonOverlay />
    </>
  );
}

function applyOverrides(df: DataFrame, overrides: Record<string, ColumnType>): DataFrame {
  if (Object.keys(overrides).length === 0) return df;
  return coerceDataFrame(df, overrides);
}
