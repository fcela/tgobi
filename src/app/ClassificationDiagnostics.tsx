import { useMemo } from "react";
import { useAppStore } from "@/store";
import { HelpPopover } from "@/app/HelpPopover";

const DIAG_COLORS = [
  "#66c2a5",
  "#fc8d62",
  "#8da0cb",
  "#e78ac3",
  "#a6d854",
  "#ffd92f",
  "#e5c494",
  "#b3b3b3",
];

function heatColor(val: number, maxVal: number): string {
  if (maxVal === 0) return "var(--surface-2)";
  const t = Math.min(val / maxVal, 1);
  const r = Math.round(30 + t * 50);
  const g = Math.round(60 + t * 140);
  const b = Math.round(90 + t * 165);
  return `rgb(${r},${g},${b})`;
}

export function ClassificationDiagnostics() {
  const classification = useAppStore((s) => s.classification);

  const cm = classification.confusionMatrix;
  const labels = classification.classLabels;
  const accuracy = classification.accuracy;
  const perClass = classification.perClassMetrics;
  const featureImportance = classification.featureImportance;
  const variables = classification.variables;
  const cvResult = classification.cvResult;
  const useTrainTestSplit = classification.useTrainTestSplit;

  const maxCell = useMemo(() => {
    if (!cm) return 0;
    let m = 0;
    for (const row of cm) for (const v of row) if (v > m) m = v;
    return m;
  }, [cm]);

  if (!cm || !labels) return null;

  const hasDiagnostics = cm != null || perClass != null || featureImportance != null || cvResult != null;
  if (!hasDiagnostics) return null;

  const maxImp = featureImportance
    ? Math.max(...featureImportance, 0.001)
    : 1;

  const k = labels.length;

  const cvStd = cvResult && cvResult.foldAccuracies.length > 1
    ? Math.sqrt(cvResult.foldAccuracies.reduce((s, a) => s + (a - cvResult.meanAccuracy) ** 2, 0) / (cvResult.foldAccuracies.length - 1))
    : 0;

  return (
    <div className="class-diagnostics">
      <header>
        Diagnostics
        <HelpPopover content={<>
          <p className="help-title">Classification Diagnostics</p>
          <p>Quality measures that help you judge how well the classifier performs.</p>
          <p><b>Confusion matrix</b>: Rows = actual, columns = predicted. Diagonal = correct. Off-diagonal = errors.</p>
          <p><b>Precision</b>: Of all points predicted as class C, how many truly belong to C?</p>
          <p><b>Recall</b>: Of all points truly in class C, how many were correctly predicted?</p>
          <p><b>F1</b>: Harmonic mean of precision and recall. 1 = perfect, 0 = useless.</p>
          <p><b>5-fold CV</b>: Stratified cross-validation accuracy, computed on all data regardless of train/test split. More reliable than a single split for small datasets.</p>
          <p><b>Feature importance</b>: How much each variable contributes. Higher = more influential.</p>
          <p><b>Warning:</b> {useTrainTestSplit ? "Test-set accuracy is more honest than training accuracy, but may vary with the random split." : "Accuracy is computed on the training set — it overestimates real-world performance. Enable train/test split for a more honest estimate."}</p>
        </>} />
      </header>

      {accuracy != null && (
        <div className="diag-section">
          <div className="diag-row">
            <span className="diag-label">{useTrainTestSplit ? "Test Acc" : "Train Acc"}</span>
            <span className={`diag-val ${accuracy >= 0.9 ? "good" : accuracy >= 0.7 ? "ok" : "bad"}`}>
              {(accuracy * 100).toFixed(1)}%
            </span>
            <span className="diag-hint">
              {accuracy >= 0.95 ? "excellent" : accuracy >= 0.85 ? "good" : accuracy >= 0.7 ? "fair" : "poor"}
            </span>
          </div>
        </div>
      )}

      {cvResult && (
        <div className="diag-section">
          <div className="diag-row">
            <span className="diag-label">5-fold CV</span>
            <span className={`diag-val ${cvResult.meanAccuracy >= 0.9 ? "good" : cvResult.meanAccuracy >= 0.7 ? "ok" : "bad"}`}>
              {(cvResult.meanAccuracy * 100).toFixed(1)}%
            </span>
            {cvStd > 0 && (
              <span className="diag-hint">
                ±{(cvStd * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="cv-folds">
            {cvResult.foldAccuracies.map((acc, i) => (
              <div key={i} className="diag-row cv-fold">
                <span className="diag-name">F{i + 1}</span>
                <div className="diag-bar-track">
                  <div
                    className={`diag-bar ${acc >= 0.9 ? "good" : acc >= 0.7 ? "ok" : "bad"}`}
                    style={{ width: `${acc * 100}%` }}
                  />
                </div>
                <span className="diag-val">{(acc * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cm && labels && (
        <div className="diag-section">
          <div className="diag-row">
            <span className="diag-label">Confusion</span>
          </div>
          <div className="cm-grid-wrap">
            <table className="cm-table">
              <thead>
                <tr>
                  <th className="cm-corner"></th>
                  {labels.map((l) => (
                    <th key={l} className="cm-pred" title={`Predicted: ${l}`}>
                      {l.length > 5 ? l.slice(0, 4) + "\u2026" : l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cm.map((row, i) => (
                  <tr key={labels[i]}>
                    <th className="cm-actual" title={`Actual: ${labels[i]}`}>
                      {labels[i]!.length > 5 ? labels[i]!.slice(0, 4) + "\u2026" : labels[i]}
                    </th>
                    {row.map((val, j) => {
                      const isDiag = i === j;
                      return (
                        <td
                          key={j}
                          className={`cm-cell${isDiag ? " diag" : ""}`}
                          style={{ background: heatColor(val, maxCell) }}
                          title={`Actual: ${labels[i]}, Predicted: ${labels[j]}, Count: ${val}`}
                        >
                          {val > 0 ? val : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <small className="diag-note">rows = actual, cols = predicted</small>
          </div>
        </div>
      )}

      {perClass && perClass.length > 0 && (
        <div className="diag-section">
          <div className="diag-row">
            <span className="diag-label">Per-class</span>
          </div>
          <table className="class-metrics-table">
            <thead>
              <tr>
                <th></th>
                <th>Prec</th>
                <th>Rec</th>
                <th>F1</th>
                <th>N</th>
              </tr>
            </thead>
            <tbody>
              {perClass.map((c, i) => (
                <tr key={c.label}>
                  <td className="cm-class-name" style={{ color: DIAG_COLORS[i % DIAG_COLORS.length] }}>
                    {c.label.length > 6 ? c.label.slice(0, 5) + "\u2026" : c.label}
                  </td>
                  <td className={c.precision >= 0.9 ? "good" : c.precision >= 0.7 ? "ok" : "bad"}>
                    {c.precision.toFixed(2)}
                  </td>
                  <td className={c.recall >= 0.9 ? "good" : c.recall >= 0.7 ? "ok" : "bad"}>
                    {c.recall.toFixed(2)}
                  </td>
                  <td className={c.f1 >= 0.9 ? "good" : c.f1 >= 0.7 ? "ok" : "bad"}>
                    {c.f1.toFixed(2)}
                  </td>
                  <td className="diag-support">{c.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {featureImportance && featureImportance.length > 0 && variables.length > 0 && (
        <div className="diag-section">
          <div className="diag-row">
            <span className="diag-label">Importance</span>
          </div>
          <div className="feat-imp-bars">
            {featureImportance.map((imp, i) => {
              const name = variables[i] ?? `V${i}`;
              return (
                <div key={name} className="diag-row">
                  <span className="diag-name" title={name}>
                    {name.length > 8 ? name.slice(0, 7) + "\u2026" : name}
                  </span>
                  <div className="diag-bar-track">
                    <div
                      className="diag-bar accent"
                      style={{ width: `${(imp / maxImp) * 100}%` }}
                    />
                  </div>
                  <span className="diag-val">{imp.toFixed(3)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
