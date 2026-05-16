import { useEffect, useMemo } from "react";
import { useAppStore } from "@/store";
import type { ClassificationMethod } from "@/lib/classification/types";
import { ClampedInput } from "@/app/ClampedInput";
import { HelpPopover } from "@/app/HelpPopover";
import { ClassificationDiagnostics } from "@/app/ClassificationDiagnostics";

export function ClassificationPanel() {
  const df = useAppStore((s) => s.df);
  const classification = useAppStore((s) => s.classification);
  const paint = useAppStore((s) => s.selection.paint);
  const colorEncoding = useAppStore((s) => s.color.encoding);
  const setMethod = useAppStore((s) => s.setClassificationMethod);
  const setVariables = useAppStore((s) => s.setClassificationVariables);
  const setClassSource = useAppStore((s) => s.setClassificationClassSource);
  const setGridResolution = useAppStore((s) => s.setClassificationGridResolution);
  const setKnnK = useAppStore((s) => s.setClassificationKnnK);
  const setRfNEstimators = useAppStore((s) => s.setClassificationRfNEstimators);
  const setRfMaxDepth = useAppStore((s) => s.setClassificationRfMaxDepth);
  const setLrLambda = useAppStore((s) => s.setClassificationLrLambda);
  const setLrMaxIter = useAppStore((s) => s.setClassificationLrMaxIter);
  const setTrainRatio = useAppStore((s) => s.setClassificationTrainRatio);
  const setUseTrainTestSplit = useAppStore((s) => s.setClassificationUseTrainTestSplit);
  const run = useAppStore((s) => s.runClassification);
  const applyBoundaries = useAppStore((s) => s.applyClassificationBoundaries);
  const clear = useAppStore((s) => s.clearClassification);
  const reset = useAppStore((s) => s.resetClassification);

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

  useEffect(() => {
    if (colorEncoding.kind === "byVar" && colorEncoding.scale === "categorical" && classification.classSource === "paint") {
      const col = df?.column(colorEncoding.var);
      if (col?.type === "categorical") {
        setClassSource(colorEncoding.var);
      }
    }
  }, [colorEncoding, classification.classSource, df, setClassSource]);

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
      <header>Classification <HelpPopover content={<><p className="help-title">What is Classification?</p><p>Classification builds a model that predicts which group (class) a data point belongs to, based on its variable values. Unlike clustering, classification <b>learns from labeled examples</b> and then predicts labels for all points.</p><p><b>Why it's useful:</b> See which groups are easy vs. hard to separate. Understand which variables are most predictive. Discover where your labeled groups overlap or are ambiguous.</p><p><b>How to use:</b> (1) Paint or select a categorical class source, (2) choose predictor variables, (3) select a method, (4) click Train, (5) click Show to add decision boundary grid points to the dataset. Boundary points appear as ring glyphs (outline circles) colored by predicted class — the decision boundary emerges where adjacent rings change color. These points appear in ALL plot types, including tours.</p><p><b>Tip:</b> Enable train/test split to get a more honest accuracy estimate. Cross-validation (5-fold) is computed automatically and shown in the diagnostics panel. Increase grid resolution for finer boundaries.</p><p><b>Warning:</b> Decision boundaries outside your observed data are extrapolation, not evidence.</p></>} /></header>

      <div className="row">
        <span>Method</span>
        <HelpPopover content={<><p className="help-title">Choosing a Classifier</p><div className="help-measures"><span className="mname">KNN</span><span className="mdesc">k-Nearest Neighbors. Classifies each point by majority vote of its k closest training points. Simple and intuitive. Handles complex boundaries but is slow for large datasets and sensitive to irrelevant variables.</span><span className="mname">Naive Bayes</span><span className="mdesc">Assumes variables are independent within each class. Very fast, works well even with small training sets. Best for high-dimensional data.</span><span className="mname">Logistic</span><span className="mdesc">Multinomial logistic regression (softmax). Finds linear decision boundaries. Fast, interpretable, and produces feature importance from coefficient magnitudes. Best when classes are approximately linearly separable.</span><span className="mname">Random Forest</span><span className="mdesc">Ensemble of decision trees with random feature subsets. Handles nonlinear boundaries, robust to overfitting. Try it first if you're unsure.</span></div><p><b>Tip:</b> Compare methods! If KNN and Random Forest give similar boundaries, you can trust the result more. If they disagree, the classification may be genuinely ambiguous in some regions.</p></>} />
        <select
          aria-label="classification method"
          value={classification.method}
          onChange={(e) => setMethod(e.target.value as ClassificationMethod)}
        >
          <option value="knn">KNN</option>
          <option value="naivebayes">Naive Bayes</option>
          <option value="logistic">Logistic</option>
          <option value="randomforest">Random Forest</option>
        </select>
      </div>

      <div className="row">
        <span>Class</span>
        <HelpPopover content={<><p className="help-title">Class Source</p><p>The classifier needs labeled examples. You can provide labels in two ways:</p><p><b>brushed groups</b>: Paint groups of points directly on the scatterplot. Interactive and visual.</p><p><b>categorical variable</b>: Use an existing column as class labels. Good for testing whether the classifier can recover known groups.</p></>} />
        <select
          aria-label="class source"
          value={classSource}
          onChange={(e) => setClassSource(e.target.value)}
        >
          <option value="paint">brushed groups</option>
          {catVars.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      {classSource === "paint" && !hasPaintedGroups && (
        <div className="row"><small style={{ color: "var(--text-dim)" }}>brush to paint 2+ groups first</small></div>
      )}

      {classification.method === "knn" && (
        <div className="row">
          <span>k</span>
          <HelpPopover content={<><p className="help-title">KNN k</p><p>How many neighbors vote on each point's class.</p><p><b>k=1</b>: Overfits — jagged boundaries.</p><p><b>k=5-15</b>: Good default range.</p><p><b>k=30+</b>: Very smooth, may underfit.</p></>} />
          <ClampedInput value={classification.knnK} min={1} max={50} ariaLabel="KNN k" onChange={setKnnK} />
        </div>
      )}

      {classification.method === "logistic" && (
        <>
          <div className="row">
            <span>Reg</span>
            <HelpPopover content={<><p className="help-title">Logistic Regression: Regularization</p><p>L2 regularization strength (lambda). Prevents overfitting by penalizing large coefficients.</p><p><b>0</b>: No regularization. May overfit with many variables.</p><p><b>0.01-0.1</b>: Light regularization. Good default.</p><p><b>1+</b>: Strong regularization. Forces smaller, simpler coefficients.</p></>} />
            <ClampedInput value={classification.lrLambda} min={0} max={10} step={0.01} ariaLabel="LR lambda" onChange={setLrLambda} />
          </div>
          <div className="row">
            <span>Iter</span>
            <HelpPopover content={<><p className="help-title">Logistic Regression: Max Iterations</p><p>Maximum gradient descent iterations. More iterations can improve convergence but take longer.</p><p><b>100-200</b>: Good for small datasets.</p><p><b>500+</b>: May help with slow convergence on harder problems.</p></>} />
            <ClampedInput value={classification.lrMaxIter} min={50} max={1000} ariaLabel="LR max iterations" onChange={setLrMaxIter} />
          </div>
        </>
      )}

      {classification.method === "randomforest" && (
        <>
          <div className="row">
            <span>Trees</span>
            <HelpPopover content={<><p className="help-title">Random Forest: Number of Trees</p><p>More trees = more stable, but slower. 50-100 is a good balance.</p></>} />
            <ClampedInput value={classification.rfNEstimators} min={1} max={500} ariaLabel="RF n estimators" onChange={setRfNEstimators} />
          </div>
          <div className="row">
            <span>Depth</span>
            <HelpPopover content={<><p className="help-title">Random Forest: Max Tree Depth</p><p>Controls model complexity. Depth 1-3: very simple. 5-10: moderate. 20+: may overfit.</p></>} />
            <ClampedInput value={classification.rfMaxDepth} min={1} max={50} ariaLabel="RF max depth" onChange={setRfMaxDepth} />
          </div>
        </>
      )}

      <div className="row">
        <span>Split</span>
        <HelpPopover content={<><p className="help-title">Train/Test Split</p><p>When enabled, the labeled data is split into a training set (used to fit the model) and a test set (used to evaluate accuracy). This gives a more honest accuracy estimate than training-set accuracy.</p><p><b>Train ratio</b>: fraction of data used for training (e.g., 0.8 = 80% train, 20% test). The split is stratified by class to preserve class proportions.</p><p><b>Warning:</b> With very small datasets, the test set may be too small for a reliable estimate. Cross-validation (shown in diagnostics) is computed on all data regardless.</p></>} />
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={classification.useTrainTestSplit}
            onChange={(e) => setUseTrainTestSplit(e.target.checked)}
          />
          <small>{classification.useTrainTestSplit ? `${(classification.trainRatio * 100).toFixed(0)}/${((1 - classification.trainRatio) * 100).toFixed(0)}` : "off"}</small>
        </label>
      </div>
      {classification.useTrainTestSplit && (
        <div className="row">
          <span>Train%</span>
          <ClampedInput value={classification.trainRatio} min={0.5} max={0.95} step={0.05} ariaLabel="train ratio" onChange={setTrainRatio} />
        </div>
      )}

      <div className="row">
        <span>Grid</span>
        <HelpPopover content={<><p className="help-title">Decision Boundary Grid</p><p>Resolution of the boundary grid. When you click Show, grid points are added to the dataset as ring glyphs (outline circles) colored by predicted class. The decision boundary appears where adjacent rings change color.</p><p><b>2-5</b>: coarse, fast. <b>8-12</b>: fine, slower. Boundary points appear in all plot types including tours.</p></>} />
        <ClampedInput value={classification.gridResolution} min={2} max={15} ariaLabel="grid resolution" onChange={setGridResolution} />
      </div>

      <div className="row vars-row">
        <HelpPopover content={<><p className="help-title">Predictor Variables</p><p>Select which numeric variables the classifier uses to predict the class.</p><p><b>Which to choose:</b> Include variables you believe distinguish the groups. For visual boundary interpretation, select only 2 — the boundary overlay directly corresponds to those 2 variables.</p><p><b>With 3+ predictors:</b> The classifier still works, but the boundary overlay is computed in the 2D scatter plane and may not reflect the full high-dimensional boundary.</p></>} />
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
            {classification.useTrainTestSplit && classification.accuracy != null && ` · test acc ${(classification.accuracy * 100).toFixed(0)}%`}
          </small>
        </div>
      )}

      <div className="row">
        <button disabled={!canRun} onClick={run} aria-label="train classifier">
          {classification.running ? <span className="spinner" /> : "Train"}
        </button>
        {classification.predictions && !classification.boundariesVisible && (
          <button onClick={applyBoundaries} aria-label="show boundaries">
            Show
          </button>
        )}
        {classification.boundariesVisible && (
          <button onClick={clear} aria-label="hide boundaries">
            Hide
          </button>
        )}
        {classification.predictions && (
          <button onClick={reset} aria-label="reset classification">
            Reset
          </button>
        )}
      </div>

      <ClassificationDiagnostics />
    </div>
  );
}
