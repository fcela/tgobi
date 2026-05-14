import { useRef, useState } from "react";
import { loadDatasetFile, loadDatasetUrl, type LoadedData } from "@/app/loadFile";

export interface EmptyStateProps {
  onLoaded: (data: LoadedData) => void;
}

const SAMPLES = [
  { label: "flea", url: "/samples/flea.csv" },
  { label: "olive", url: "/samples/olive.csv" },
  { label: "places", url: "/samples/places.csv" },
  { label: "cycle", url: "/samples/cycle.xml" },
  { label: "large", url: "/samples/synthetic-large.csv" },
  { label: "climate", url: "/samples/climate.csv" },
  { label: "missing", url: "/samples/missing.csv" },
];

export function EmptyState({ onLoaded }: EmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = async (file: File) => {
    setErr(null);
    try { onLoaded(await loadDatasetFile(file)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const handleSample = async (url: string) => {
    setErr(null);
    try { onLoaded(await loadDatasetUrl(url)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="empty-state">
      <div
        className={`empty-card${drag ? " dragover" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          const file = e.dataTransfer.files[0];
          if (file) void handle(file);
        }}
      >
        <h2>Drop a CSV, JSON, or XML file</h2>
        <p>or click to pick a file from disk</p>
        <label className="picker">
          Choose a file
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.json,.xml"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handle(f);
            }}
          />
        </label>
        <div className="samples">
          <span style={{ alignSelf: "center", color: "var(--text-dim)", fontSize: 12 }}>
            Try a sample:
          </span>
          {SAMPLES.map((s) => (
            <button key={s.label} onClick={() => void handleSample(s.url)}>{s.label}</button>
          ))}
        </div>
        {err && <div className="err" role="alert">{err}</div>}
      </div>
    </div>
  );
}
