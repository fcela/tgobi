import { useMemo } from "react";
import { useAppStore } from "@/store";
import type { ClassificationMethod } from "@/lib/classification/types";
import { ClampedInput } from "@/app/ClampedInput";

export function ClassificationPanel() {
  const df = useAppStore((s) => s.df);
  const classification = useAppStore((s) => s.classification);
  const paint = useAppStore((s) => s.selection.paint);
  const setMethod = useAppStore((s) => s.setClassificationMethod);
  const setVariables = useAppStore((s) => s.setClassificationVariables);
  const setClassSource = useAppStore((s) => s.setClassificationClassSource);
  const setGridResolution = useAppStore((s) => s.setClassificationGridResolution);
  const setKnnK = useAppStore((s) => s.setClassificationKnnK);
  const setRfNEstimators = useAppStore((s) => s.setClassificationRfNEstimators);
  const setRfMaxDepth = useAppStore((s) => s.setClassificationRfMaxDepth);
  const run = useAppStore((s) => s.runClassification);
  const applyBoundaries = useAppStore((s) => s.applyClassificationBoundaries);
  const clear = useAppStore((s) => s.clearClassification);

  const numericVars = useMemo(
    () => df?.columns.filter((c) => c.type === "numeric" || c.type === "integer").map((c) => c.name) ?? [],
    [df],
  );

  const catVars = useMemo(
    () => df?.columns.filter((c) => c.type === "categorical").map((c) => c.name) ?? [],
    [df],
  );

  const hasPaintedGroups = useMemo(() => {
    const seen = new Set<number>();
    for (let i = 0; i < paint.length; i++) {
      const v = paint[i]!;
      if (v > 0) seen.add(v);
      if (seen.size >= 2) return true;
    }
    return false;
  }, [paint]);

  const classSource = classification.classSource;

  const canRun = !!df
    && classification.variables.length >= 2
    && !classification.running
    && (classSource === "paint" ? hasPaintedGroups : catVars.includes(classSource));

  const nMisclass = useMemo(() => {
    const m = classification.misclassified;
    if (!m) return 0;
    let count = 0;
    for (let i = 0; i < m.length; i++) if (m[i]) count++;
    return count;
  }, [classification.misclassified]);

  const toggleVar = (name: string) => {
    const has = classification.variables.includes(name);
    setVariables(has
      ? classification.variables.filter((v) => v !== name)
      : [...classification.variables, name]);
  };

  return (
    <div className="classification-panel">
      <header>Classification</header>

      <div className="row">
        <span>Method</span>
        <select
          aria-label="classification method"
          value={classification.method}
          onChange={(e) => setMethod(e.target.value as ClassificationMethod)}
        >
          <option value="knn">KNN</option>
          <option value="naivebayes">Naive Bayes</option>
          <option value="randomforest">Random Forest</option>
        </select>
      </div>

      <div className="row">
        <span>Class</span>
        <select
          aria-label="class source"
          value={classSource}
          onChange={(e) => setClassSource(e.target.value)}
        >
          <option value="paint">paint / brushed</option>
          {catVars.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      {classSource === "paint" && !hasPaintedGroups && (
        <div className="row"><small style={{ color: "var(--text-dim)" }}>brush to paint 2+ groups</small></div>
      )}

      {classification.method === "knn" && (
        <div className="row">
          <span>k</span>
          <ClampedInput value={classification.knnK} min={1} max={50} ariaLabel="KNN k" onChange={setKnnK} />
        </div>
      )}

      {classification.method === "randomforest" && (
        <>
          <div className="row">
            <span>Trees</span>
            <ClampedInput value={classification.rfNEstimators} min={1} max={500} ariaLabel="RF n estimators" onChange={setRfNEstimators} />
          </div>
          <div className="row">
            <span>Depth</span>
            <ClampedInput value={classification.rfMaxDepth} min={1} max={50} ariaLabel="RF max depth" onChange={setRfMaxDepth} />
          </div>
        </>
      )}

      <div className="row">
        <span>Grid</span>
        <ClampedInput value={classification.gridResolution} min={2} max={15} ariaLabel="grid resolution" onChange={setGridResolution} />
      </div>

      <div className="row vars-row">
        <div className="vars" aria-label="classification variables">
          {numericVars.length === 0 && (
            <span style={{ color: "var(--text-dim)" }}>no numeric variables</span>
          )}
          {numericVars.map((n) => {
            const isActive = classification.variables.includes(n);
            return (
              <div key={n} className={isActive ? "var-row active" : "var-row"}>
                <input
                  type="checkbox"
                  aria-label={`include ${n} in classification`}
                  checked={isActive}
                  onChange={() => toggleVar(n)}
                />
                <span className="name">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {classification.error && (
        <div className="row error">{classification.error}</div>
      )}

      {classification.boundaryPaint && (
        <div className="row summary">
          <small>
            {classification.gridSize} boundary pts
            {nMisclass > 0 && ` · ${nMisclass} misclassified`}
          </small>
        </div>
      )}

      <div className="row">
        <button disabled={!canRun} onClick={run} aria-label="train classifier">
          {classification.running ? <span className="spinner" /> : "Train"}
        </button>
        {classification.boundaryPaint && (
          <>
            <button onClick={applyBoundaries} aria-label="show boundaries">
              Show
            </button>
            <button onClick={clear} aria-label="clear classification">
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}
