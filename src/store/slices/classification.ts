import type { StateCreator } from "zustand";
import type { AppStore, ClassificationSlice } from "@/store/types";
import { knnClassify } from "@/lib/classification/knn";
import { naiveBayesClassify } from "@/lib/classification/naivebayes";
import { randomForestClassify } from "@/lib/classification/randomforest";
import { logisticRegressionClassify } from "@/lib/classification/logistic";
import { computeConfusionMatrix } from "@/lib/classification/confusion";
import { crossValidate } from "@/lib/classification/crossvalidation";
import { buildGrid2D, buildGridND, thinToBoundary2D, thinToBoundaryND } from "@/lib/classification/grid";
import { bitGet, bitSet } from "@/lib/brush/hitTest";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

const CLEAR_FIELDS = {
  boundaryPaint: null, boundaryGrid: null, boundaryVars: null, gridSize: 0,
  boundaryMins: null, boundaryMaxs: null, boundariesVisible: false,
  boundaryProbabilities: null,
  effectiveGridResolution: 0, gridTotal: 0,
  predictions: null, misclassified: null, classToPaint: null,
  error: null, confusionMatrix: null, classLabels: null,
  accuracy: null, perClassMetrics: null, featureImportance: null,
  cvResult: null,
};

export const createClassificationSlice: StateCreator<AppStore, [], [], ClassificationSlice> = (set, get) => ({
  classification: {
    method: "knn",
    variables: [],
    classSource: "paint",
    gridMode: "2d",
    effectiveGridResolution: 0,
    gridTotal: 0,
    gridResolution: 5,
    knnK: 5,
    rfNEstimators: 50,
    rfMaxDepth: 10,
    lrLambda: 0.01,
    lrMaxIter: 200,
    trainRatio: 0.8,
    useTrainTestSplit: false,
    boundaryPaint: null,
    boundaryGrid: null,
    boundaryVars: null,
    gridSize: 0,
    boundaryMins: null,
    boundaryMaxs: null,
  boundariesVisible: false,
  boundaryProbabilities: null,
  indecisionThreshold: 0,
  predictions: null,
    misclassified: null,
    classToPaint: null,
    running: false,
    error: null,
    confusionMatrix: null,
    classLabels: null,
    accuracy: null,
    perClassMetrics: null,
    featureImportance: null,
    cvResult: null,
  },

  setClassificationMethod: (method) =>
    set((s) => ({ classification: { ...s.classification, method, ...CLEAR_FIELDS } })),

  setClassificationVariables: (variables) =>
    set((s) => ({ classification: { ...s.classification, variables, ...CLEAR_FIELDS } })),

  setClassificationClassSource: (classSource) =>
    set((s) => ({ classification: { ...s.classification, classSource, ...CLEAR_FIELDS } })),

  setClassificationGridResolution: (gridResolution) =>
    set((s) => ({ classification: { ...s.classification, gridResolution, ...CLEAR_FIELDS } })),

  setClassificationGridMode: (gridMode) =>
    set((s) => ({ classification: { ...s.classification, gridMode, ...CLEAR_FIELDS } })),

  setClassificationKnnK: (knnK) =>
    set((s) => ({ classification: { ...s.classification, knnK, boundaryPaint: null, error: null } })),

  setClassificationRfNEstimators: (rfNEstimators) =>
    set((s) => ({ classification: { ...s.classification, rfNEstimators, boundaryPaint: null, error: null } })),

  setClassificationRfMaxDepth: (rfMaxDepth) =>
    set((s) => ({ classification: { ...s.classification, rfMaxDepth, boundaryPaint: null, error: null } })),

  setClassificationLrLambda: (lrLambda) =>
    set((s) => ({ classification: { ...s.classification, lrLambda, boundaryPaint: null, error: null } })),

  setClassificationLrMaxIter: (lrMaxIter) =>
    set((s) => ({ classification: { ...s.classification, lrMaxIter, boundaryPaint: null, error: null } })),

  setClassificationTrainRatio: (trainRatio) =>
    set((s) => ({ classification: { ...s.classification, trainRatio, ...CLEAR_FIELDS } })),

  setClassificationUseTrainTestSplit: (useTrainTestSplit) =>
    set((s) => ({ classification: { ...s.classification, useTrainTestSplit, ...CLEAR_FIELDS } })),

  // Renderers filter boundary points by this threshold at draw time, so a
  // plain setter is enough — no re-apply/re-run.
  setIndecisionThreshold: (indecisionThreshold) =>
    set((s) => ({ classification: { ...s.classification, indecisionThreshold } })),

  runClassification: () => {
    const { df } = get();
    const { method, variables, classSource, gridMode, gridResolution, knnK, rfNEstimators, rfMaxDepth, lrLambda, lrMaxIter, useTrainTestSplit, trainRatio } = get().classification;
    const { paint, shadow } = get().selection;

    if (!df || variables.length < 2) {
      set((s) => ({ classification: { ...s.classification, error: "Need data and 2+ variables" } }));
      return;
    }

    const n = df.nrow;
    const labeledRows: number[] = [];
    const labeledY: number[] = [];
    const classMap = new Map<number, number>();

    if (classSource === "paint") {
      for (let i = 0; i < n; i++) {
        if (bitGet(shadow, i)) continue;
        const p = paint[i]!;
        if (p <= 0) continue;
        if (!classMap.has(p)) classMap.set(p, classMap.size);
        labeledRows.push(i);
        labeledY.push(classMap.get(p)!);
      }
    } else {
      const catCol = df.column(classSource);
      if (!catCol || catCol.type !== "categorical") {
        set((s) => ({ classification: { ...s.classification, error: "Select a categorical class variable" } }));
        return;
      }
      for (let i = 0; i < n; i++) {
        if (bitGet(shadow, i)) continue;
        if (catCol.missing.isMissing(i)) continue;
        const code = catCol.codes[i]!;
        if (!classMap.has(code)) classMap.set(code, classMap.size);
        labeledRows.push(i);
        labeledY.push(classMap.get(code)!);
      }
    }

    if (classMap.size < 2) {
      set((s) => ({ classification: { ...s.classification, error: "Need 2+ class groups" } }));
      return;
    }

    const classToPaint = new Array<number>(classMap.size);
    for (const [key, clsIdx] of classMap) {
      classToPaint[clsIdx] = classSource === "paint" ? key : clsIdx + 1;
    }

    set((s) => ({ classification: { ...s.classification, running: true, error: null } }));

    const schedule = typeof requestAnimationFrame === "function"
      ? (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn))
      : (fn: () => void) => setTimeout(fn, 0);

    schedule(() => {
      try {
        const columns = variables.map((name) => df.column(name));
        const p = variables.length;

        const allX: number[][] = [];
        const allY: number[] = [];
        // df row index for each entry in allX/allY. Needed to write predictions
        // back to the correct dataframe rows when (a) some labeled rows are
        // dropped for invalid features, or (b) train/test split reorders rows.
        const allDfRows: number[] = [];
        for (let ti = 0; ti < labeledRows.length; ti++) {
          const i = labeledRows[ti]!;
          const row: number[] = [];
          let valid = true;
          for (let j = 0; j < p; j++) {
            const col = columns[j];
            if (!col || col.type === "categorical") { valid = false; break; }
            if (col.missing.isMissing(i)) { valid = false; break; }
            const val = col.type === "integer" ? col.values[i] : col.type === "numeric" ? col.values[i] : null;
            if (val == null || !Number.isFinite(val)) { valid = false; break; }
            row.push(val);
          }
          if (valid) {
            allX.push(row);
            allY.push(labeledY[ti]!);
            allDfRows.push(i);
          }
        }

        if (allX.length === 0) {
          set((s) => ({ classification: { ...s.classification, running: false, error: "No valid training rows" } }));
          return;
        }

        let trainX: number[][];
        let trainY: number[];
        let trainDfRows: number[];
        let testX: number[][] | null = null;
        let testY: number[] | null = null;
        let testDfRows: number[] | null = null;

        if (useTrainTestSplit && allX.length >= 4) {
          const byClass = new Map<number, number[]>();
          for (let i = 0; i < allX.length; i++) {
            const c = allY[i]!;
            if (!byClass.has(c)) byClass.set(c, []);
            byClass.get(c)!.push(i);
          }
          const trainIdx: number[] = [];
          const testIdx: number[] = [];
          for (const [, indices] of byClass) {
            const splitPt = Math.max(1, Math.floor(indices.length * trainRatio));
            for (let k = 0; k < indices.length; k++) {
              if (k < splitPt) trainIdx.push(indices[k]!);
              else testIdx.push(indices[k]!);
            }
          }
          trainX = trainIdx.map((i) => allX[i]!);
          trainY = trainIdx.map((i) => allY[i]!);
          trainDfRows = trainIdx.map((i) => allDfRows[i]!);
          testX = testIdx.map((i) => allX[i]!);
          testY = testIdx.map((i) => allY[i]!);
          testDfRows = testIdx.map((i) => allDfRows[i]!);
        } else {
          trainX = allX;
          trainY = allY;
          trainDfRows = allDfRows;
        }

        const mins = new Float64Array(p);
        const maxs = new Float64Array(p);
        for (let j = 0; j < p; j++) {
          let lo = Infinity, hi = -Infinity;
          for (const row of trainX) {
            lo = Math.min(lo, row[j]!);
            hi = Math.max(hi, row[j]!);
          }
          mins[j] = lo;
          maxs[j] = hi;
        }

        for (let j = 0; j < p; j++) {
          if (mins[j] === maxs[j]) {
            const jitter = 1e-10;
            for (const row of trainX) {
              row[j] = row[j]! + (Math.random() - 0.5) * jitter;
            }
            maxs[j] = mins[j]! + jitter;
          }
        }

        const medians = new Float64Array(p);
        for (let j = 0; j < p; j++) {
          const vals = trainX.map((r) => r[j]!).sort((a, b) => a - b);
          const mid = Math.floor(vals.length / 2);
          medians[j] = vals.length % 2 === 0
            ? (vals[mid - 1]! + vals[mid]!) / 2
            : vals[mid]!;
        }

        const built = gridMode === "fullspace"
          ? buildGridND(mins, maxs, gridResolution)
          : buildGrid2D(mins, maxs, gridResolution, medians);
        const { grid: gridPts, flat: gridFlat, effectiveResolution, gridDims } = built;
        const nGrid = gridPts.length;
        const gridPredictions = new Int16Array(nGrid);
        const gridMaxProbs = new Float32Array(nGrid);

        const gridOnlyResult = method === "knn"
          ? knnClassify(trainX, trainY, gridPts, knnK)
          : method === "naivebayes"
          ? naiveBayesClassify(trainX, trainY, gridPts)
          : method === "logistic"
          ? logisticRegressionClassify(trainX, trainY, gridPts, lrLambda, lrMaxIter)
          : randomForestClassify(trainX, trainY, gridPts, rfNEstimators, rfMaxDepth);

        const gridNClasses = gridOnlyResult.nClasses;
        for (let i = 0; i < nGrid; i++) {
          gridPredictions[i] = gridOnlyResult.predictions[i]!;
          let m = 0;
          for (let c = 0; c < gridNClasses; c++) {
            const pr = gridOnlyResult.probabilities[i * gridNClasses + c]!;
            if (pr > m) m = pr;
          }
          gridMaxProbs[i] = m;
        }

        const boundaryMask = gridMode === "fullspace"
          ? thinToBoundaryND(gridPredictions, effectiveResolution, gridDims)
          : thinToBoundary2D(gridPredictions, effectiveResolution);

        const nBoundary = boundaryMask.reduce((s, v) => s + v, 0);
        const boundaryIndices: number[] = [];
        for (let i = 0; i < nGrid; i++) {
          if (boundaryMask[i]) boundaryIndices.push(i);
        }

        const boundaryFlat = new Float64Array(nBoundary * p);
        const boundaryPaint = new Uint8Array(nBoundary);
        const boundaryProbabilities = new Float32Array(nBoundary);
        for (let b = 0; b < nBoundary; b++) {
          const gIdx = boundaryIndices[b]!;
          for (let j = 0; j < p; j++) {
            boundaryFlat[b * p + j] = gridFlat[gIdx * p + j]!;
          }
          const cls = gridPredictions[gIdx]!;
          if (cls >= 0 && cls < classToPaint.length) {
            boundaryPaint[b] = classToPaint[cls]!;
          }
          boundaryProbabilities[b] = 1 - gridMaxProbs[gIdx]!;
        }

        const trainPredictResult = method === "knn"
          ? knnClassify(trainX, trainY, trainX, knnK)
          : method === "naivebayes"
          ? naiveBayesClassify(trainX, trainY, trainX)
          : method === "logistic"
          ? logisticRegressionClassify(trainX, trainY, trainX, lrLambda, lrMaxIter)
          : randomForestClassify(trainX, trainY, trainX, rfNEstimators, rfMaxDepth);

        let testPredictResult: typeof trainPredictResult | null = null;
        if (testX && testX.length > 0) {
          const allPredictPts = [...trainX, ...testX];
          const allPredictResult = method === "knn"
            ? knnClassify(trainX, trainY, allPredictPts, knnK)
            : method === "naivebayes"
            ? naiveBayesClassify(trainX, trainY, allPredictPts)
            : method === "logistic"
            ? logisticRegressionClassify(trainX, trainY, allPredictPts, lrLambda, lrMaxIter)
            : randomForestClassify(trainX, trainY, allPredictPts, rfNEstimators, rfMaxDepth);
          testPredictResult = allPredictResult;
        }

        const predictions = new Int16Array(n);
        predictions.fill(-1);
        const misclassified = new Uint8Array(n);

        for (let ti = 0; ti < trainX.length; ti++) {
          const rowIdx = trainDfRows[ti]!;
          const pred = trainPredictResult.predictions[ti]!;
          predictions[rowIdx] = pred;
          if (pred !== trainY[ti]) {
            misclassified[rowIdx] = 1;
          }
        }

        if (testX && testDfRows && testPredictResult) {
          const nTrain2 = trainX.length;
          for (let ti = 0; ti < testX.length; ti++) {
            const absIdx = nTrain2 + ti;
            const pred = testPredictResult.predictions[absIdx]!;
            const rowIdx = testDfRows[ti]!;
            predictions[rowIdx] = pred;
            if (pred !== testY![ti]!) {
              misclassified[rowIdx] = 1;
            }
          }
        }

        const featureImportance = trainPredictResult.featureImportance ?? null;

        const classLabels: string[] = [];
        if (classSource === "paint") {
          for (let c = 0; c < classMap.size; c++) classLabels.push(`Group ${c + 1}`);
        } else {
          const catCol = df!.column(classSource);
          if (catCol && catCol.type === "categorical" && catCol.levels) {
            const reverseMap = new Map<number, string>();
            for (const [key, idx] of classMap) {
              const catName = catCol.levels[key] ?? `Class ${idx}`;
              reverseMap.set(idx, catName);
            }
            for (let c = 0; c < classMap.size; c++) classLabels.push(reverseMap.get(c) ?? `Class ${c}`);
          } else {
            for (let c = 0; c < classMap.size; c++) classLabels.push(`Class ${c + 1}`);
          }
        }

        const evalPreds: Int16Array = testX && testPredictResult
          ? testPredictResult.predictions.slice(trainX.length, trainX.length + testX.length)
          : trainPredictResult.predictions.slice(0, trainX.length);
        const evalActuals: Int16Array = testX
          ? Int16Array.from(testY!)
          : Int16Array.from(trainY);
        const cm = computeConfusionMatrix(evalActuals, evalPreds, classLabels);

        const cvResult = crossValidate(allX, allY, method, 5, { knnK, rfNEstimators, rfMaxDepth, lrLambda, lrMaxIter });

        set((s) => ({
          classification: {
            ...s.classification,
            boundaryPaint,
            boundaryGrid: boundaryFlat,
            boundaryVars: variables.slice(),
            gridSize: nBoundary,
            effectiveGridResolution: effectiveResolution,
            gridTotal: nGrid,
            boundaryMins: mins,
            boundaryMaxs: maxs,
            boundaryProbabilities,
            predictions,
            misclassified,
            classToPaint,
            running: false,
            confusionMatrix: cm.matrix,
            classLabels: cm.classLabels,
            accuracy: cm.overallAccuracy,
            perClassMetrics: cm.perClass,
            featureImportance,
            cvResult,
          },
        }));
    } catch (e) {
    set((s) => ({
      classification: {
        ...s.classification,
        running: false,
        error: e instanceof Error ? e.message : String(e),
      },
    }));
  }
    });
  },

  applyClassificationBoundaries: () => {
    // Boundary points and misclassified flags are consumed directly by
    // plot renderers from this slice — there is no df mutation. Show / Hide
    // is just a visibility flag. Threshold + grid changes are picked up
    // automatically at draw time.
    const { boundaryPaint, boundaryGrid, gridSize } = get().classification;
    if (!boundaryPaint || !boundaryGrid || gridSize === 0) return;
    set((s) => ({
      classification: { ...s.classification, boundariesVisible: true },
      color: { ...s.color, encoding: { kind: "paint" } },
    }));
  },

  clearClassification: () => {
    set((s) => ({ classification: { ...s.classification, boundariesVisible: false } }));
  },

  resetClassification: () => {
    set(() => ({
      classification: {
        method: "knn", variables: [], classSource: "paint",
        gridMode: "2d", effectiveGridResolution: 0, gridTotal: 0,
        gridResolution: 5, knnK: 5, rfNEstimators: 50, rfMaxDepth: 10,
        lrLambda: 0.01, lrMaxIter: 200, trainRatio: 0.8, useTrainTestSplit: false,
        boundaryPaint: null, boundaryGrid: null, boundaryVars: null, gridSize: 0,
        boundaryMins: null, boundaryMaxs: null, boundariesVisible: false,
        boundaryProbabilities: null, indecisionThreshold: 0,
        predictions: null, misclassified: null, classToPaint: null,
        running: false, error: null, confusionMatrix: null, classLabels: null,
        accuracy: null, perClassMetrics: null, featureImportance: null,
        cvResult: null,
      },
    }));
  },
});

