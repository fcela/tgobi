import type { StateCreator } from "zustand";
import type { AppStore, ClassificationSlice } from "@/store/types";
import { knnClassify } from "@/lib/classification/knn";
import { naiveBayesClassify } from "@/lib/classification/naivebayes";
import { randomForestClassify } from "@/lib/classification/randomforest";
import { logisticRegressionClassify } from "@/lib/classification/logistic";
import { computeConfusionMatrix } from "@/lib/classification/confusion";
import { crossValidate } from "@/lib/classification/crossvalidation";
import { bitGet, bitSet } from "@/lib/brush/hitTest";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

const MISCLASSIFIED_SHAPE = 5;
const BOUNDARY_SHAPE = 6;

const CLEAR_FIELDS = {
  boundaryPaint: null, boundaryGrid: null, gridSize: 0,
  boundaryMins: null, boundaryMaxs: null, boundariesVisible: false,
  boundaryProbabilities: null, boundaryNOrig: 0,
  predictions: null, misclassified: null, classToPaint: null,
  error: null, confusionMatrix: null, classLabels: null,
  accuracy: null, perClassMetrics: null, featureImportance: null,
  preClassifyShape: null, cvResult: null,
};

export const createClassificationSlice: StateCreator<AppStore, [], [], ClassificationSlice> = (set, get) => ({
  classification: {
    method: "knn",
    variables: [],
    classSource: "paint",
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
    gridSize: 0,
    boundaryMins: null,
    boundaryMaxs: null,
  boundariesVisible: false,
  boundaryProbabilities: null,
  boundaryNOrig: 0,
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
    preClassifyShape: null,
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

  runClassification: () => {
    const { df } = get();
    const { method, variables, classSource, gridResolution, knnK, rfNEstimators, rfMaxDepth, lrLambda, lrMaxIter, useTrainTestSplit, trainRatio } = get().classification;
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
          }
        }

        if (allX.length === 0) {
          set((s) => ({ classification: { ...s.classification, running: false, error: "No valid training rows" } }));
          return;
        }

        let trainX: number[][];
        let trainY: number[];
        let testX: number[][] | null = null;
        let testY: number[] | null = null;
        let testRowIndices: number[] | null = null;

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
          testX = testIdx.map((i) => allX[i]!);
          testY = testIdx.map((i) => allY[i]!);
          testRowIndices = testIdx;
        } else {
          trainX = allX;
          trainY = allY;
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
          }
        }

        const { grid: gridPts, flat: gridFlat } = buildGrid(mins, maxs, gridResolution);
        const predictPts = testX ? [...trainX, ...testX, ...gridPts] : [...trainX, ...gridPts];
        const nTrain = trainX.length;
        const nTest = testX ? testX.length : 0;
        const nGrid = gridPts.length;

        const result = method === "knn"
          ? knnClassify(trainX, trainY, predictPts, knnK)
          : method === "naivebayes"
          ? naiveBayesClassify(trainX, trainY, predictPts)
          : method === "logistic"
          ? logisticRegressionClassify(trainX, trainY, predictPts, lrLambda, lrMaxIter)
          : randomForestClassify(trainX, trainY, predictPts, rfNEstimators, rfMaxDepth);

        const predictions = new Int16Array(n);
        predictions.fill(-1);
        const misclassified = new Uint8Array(n);

        for (let ti = 0; ti < trainX.length; ti++) {
          const rowIdx = labeledRows[ti]!;
          const pred = result.predictions[ti]!;
          predictions[rowIdx] = pred;
          if (pred !== trainY[ti]) {
            misclassified[rowIdx] = 1;
          }
        }

        if (testX && testRowIndices) {
          for (let ti = 0; ti < testX.length; ti++) {
            const absIdx = nTrain + ti;
            const pred = result.predictions[absIdx]!;
            const rowIdx = labeledRows[testRowIndices[ti]!]!;
            predictions[rowIdx] = pred;
            if (pred !== testY![ti]!) {
              misclassified[rowIdx] = 1;
            }
          }
        }

  const boundaryPaint = new Uint8Array(nGrid);
  const boundaryProbabilities = new Float32Array(nGrid);
  const gridOffset = nTrain + nTest;
  for (let i = 0; i < nGrid; i++) {
    const cls = result.predictions[gridOffset + i]!;
    if (cls >= 0 && cls < classToPaint.length) {
      boundaryPaint[i] = classToPaint[cls]!;
    }
    const maxProb = result.probabilities ? result.probabilities[gridOffset + i]! : 1;
    boundaryProbabilities[i] = 1 - maxProb;
  }

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

        const evalPreds: Int16Array = testX
          ? result.predictions.slice(nTrain, nTrain + nTest)
          : result.predictions.slice(0, nTrain);
        const evalActuals: Int16Array = testX
          ? Int16Array.from(testY!)
          : Int16Array.from(trainY);
        const cm = computeConfusionMatrix(evalActuals, evalPreds, classLabels);

        const featureImportance = result.featureImportance ?? null;

        const cvResult = crossValidate(allX, allY, method, 5, { knnK, rfNEstimators, rfMaxDepth, lrLambda, lrMaxIter });

set((s) => ({
        classification: {
          ...s.classification,
          boundaryPaint,
          boundaryGrid: gridFlat,
          gridSize: nGrid,
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
    const { misclassified, classToPaint, classSource, predictions,
      boundaryPaint, boundaryGrid, gridSize, boundaryProbabilities, variables } = get().classification;
    const { df } = get();
    if (!df || !boundaryPaint || !boundaryGrid || gridSize === 0) return;

    const nOrig = df.nrow;
    const origShape = get().selection.shape;
    const origPaint = get().selection.paint;
    const origShadow = get().selection.shadow;
    const preClassifyShape = new Uint8Array(origShape.length);
    preClassifyShape.set(origShape);

    const BOUNDARY_INDECISION_THRESHOLD = 0;
    const nVars = variables.length;

    const boundaryIndices: number[] = [];
    for (let i = 0; i < gridSize; i++) {
      if (boundaryPaint[i]! > 0) {
        boundaryIndices.push(i);
      }
    }
    const nBoundary = boundaryIndices.length;

    const newCols = df.columns.map((col) => {
      if (col.type === "numeric") {
        const orig = col.values as Float64Array;
        const arr = new Float64Array(nOrig + nBoundary);
        arr.set(orig);
        const vIdx = variables.indexOf(col.name);
        if (vIdx >= 0) {
          for (let b = 0; b < nBoundary; b++) {
            arr[nOrig + b] = boundaryGrid[boundaryIndices[b]! * nVars + vIdx]!;
          }
        }
        return makeNumericColumn(col.name, arr, new BitMissingMask(nOrig + nBoundary));
      }
      if (col.type === "integer") {
        const orig = col.values as Int32Array;
        const arr = new Float64Array(nOrig + nBoundary);
        for (let i = 0; i < nOrig; i++) arr[i] = orig[i]!;
        const vIdx = variables.indexOf(col.name);
        if (vIdx >= 0) {
          for (let b = 0; b < nBoundary; b++) {
            arr[nOrig + b] = boundaryGrid[boundaryIndices[b]! * nVars + vIdx]!;
          }
        }
        return makeNumericColumn(col.name, arr, new BitMissingMask(nOrig + nBoundary));
      }
      if (col.type === "categorical") {
        const orig = col.codes as Int32Array;
        const arr = new Int32Array(nOrig + nBoundary);
        arr.set(orig);
        for (let b = 0; b < nBoundary; b++) arr[nOrig + b] = 0;
        return makeCategoricalColumn(col.name, arr, [...col.levels!]);
      }
      return col;
    });
    const newDf = new ArrayDataFrame(newCols);

    const newShape = new Uint8Array(nOrig + nBoundary);
    newShape.set(origShape);
    if (misclassified) {
      for (let i = 0; i < nOrig; i++) {
        if (misclassified[i]) newShape[i] = MISCLASSIFIED_SHAPE;
      }
    }
    for (let b = 0; b < nBoundary; b++) newShape[nOrig + b] = BOUNDARY_SHAPE;

    const newPaint = new Uint8Array(nOrig + nBoundary);
    if (classSource !== "paint" && predictions && classToPaint) {
      for (let i = 0; i < nOrig; i++) {
        const cls = predictions[i]!;
        newPaint[i] = (cls >= 0 && cls < classToPaint.length) ? classToPaint[cls]! : (origPaint[i] ?? 0);
      }
    } else {
      newPaint.set(origPaint);
    }
    for (let b = 0; b < nBoundary; b++) {
      newPaint[nOrig + b] = boundaryPaint[boundaryIndices[b]!]!;
    }

    const newMask = new Uint8Array(Math.ceil((nOrig + nBoundary) / 8));
    newMask.set(origShadow);

    const newIdentify = new Uint8Array(nOrig + nBoundary);
    const newLabel = new Int16Array(nOrig + nBoundary);

    set((s) => ({
      df: newDf,
      selection: { ...s.selection, paint: newPaint, shape: newShape, shadow: newMask, mask: new Uint8Array(Math.ceil((nOrig + nBoundary) / 8)), identify: newIdentify, label: newLabel },
      color: { ...s.color, encoding: { kind: "paint" } },
      classification: { ...s.classification, boundariesVisible: true, preClassifyShape, boundaryNOrig: nOrig },
    }));
  },

  clearClassification: () => {
    const { misclassified, boundariesVisible, preClassifyShape, boundaryNOrig } = get().classification;
    const { df } = get();

    if (boundariesVisible && df && boundaryNOrig > 0 && df.nrow > boundaryNOrig) {
      const trimmedCols = df.columns.map((col) => {
        if (col.type === "numeric") {
          const orig = col.values as Float64Array;
          return makeNumericColumn(col.name, orig.slice(0, boundaryNOrig), new BitMissingMask(boundaryNOrig));
        }
        if (col.type === "integer") {
          const orig = col.values as Int32Array;
          return makeNumericColumn(col.name, Float64Array.from(orig.slice(0, boundaryNOrig)), new BitMissingMask(boundaryNOrig));
        }
      if (col.type === "categorical") {
        const orig = col.codes as Int32Array;
        return makeCategoricalColumn(col.name, orig.slice(0, boundaryNOrig), [...col.levels!]);
      }
        return col;
      });
      const trimmedDf = new ArrayDataFrame(trimmedCols);

      const sel = get().selection;
      const newShape = new Uint8Array(boundaryNOrig);
      newShape.set(sel.shape.slice(0, boundaryNOrig));
      if (misclassified && preClassifyShape) {
        for (let i = 0; i < boundaryNOrig; i++) {
          if (misclassified[i]) newShape[i] = preClassifyShape[i]!;
        }
      }
      const newPaint = new Uint8Array(boundaryNOrig);
      newPaint.set(sel.paint.slice(0, boundaryNOrig));

      set((s) => ({
        df: trimmedDf,
        selection: {
          ...s.selection,
          paint: newPaint,
          shape: newShape,
          shadow: sel.shadow.slice(0, Math.ceil(boundaryNOrig / 8)),
          mask: new Uint8Array(Math.ceil(boundaryNOrig / 8)),
        },
        classification: { ...s.classification, boundariesVisible: false, preClassifyShape: null, boundaryNOrig: 0 },
      }));
    } else if (boundariesVisible && misclassified && preClassifyShape) {
      const origShape = get().selection.shape;
      const newShape = new Uint8Array(origShape.length);
      newShape.set(origShape);
      for (let i = 0; i < newShape.length; i++) {
        if (misclassified[i]) newShape[i] = preClassifyShape[i]!;
      }
      set((s) => ({
        selection: { ...s.selection, shape: newShape },
        classification: { ...s.classification, boundariesVisible: false, preClassifyShape: null },
      }));
    } else {
      set((s) => ({ classification: { ...s.classification, boundariesVisible: false } }));
    }
  },

  resetClassification: () => {
    const { boundaryNOrig, boundariesVisible } = get().classification;
    const { df } = get();
    if (boundariesVisible && df && boundaryNOrig > 0 && df.nrow > boundaryNOrig) {
      get().clearClassification();
    }
    set(() => ({
      classification: {
        method: "knn", variables: [], classSource: "paint",
        gridResolution: 5, knnK: 5, rfNEstimators: 50, rfMaxDepth: 10,
        lrLambda: 0.01, lrMaxIter: 200, trainRatio: 0.8, useTrainTestSplit: false,
        boundaryPaint: null, boundaryGrid: null, gridSize: 0,
        boundaryMins: null, boundaryMaxs: null, boundariesVisible: false,
        boundaryProbabilities: null, boundaryNOrig: 0,
        predictions: null, misclassified: null, classToPaint: null,
        running: false, error: null, confusionMatrix: null, classLabels: null,
        accuracy: null, perClassMetrics: null, featureImportance: null,
        preClassifyShape: null, cvResult: null,
      },
    }));
  },
});

function buildGrid(mins: Float64Array, maxs: Float64Array, resolution: number): { grid: number[][]; flat: Float64Array } {
  const p = mins.length;
  const steps: number[] = [];
  for (let j = 0; j < p; j++) {
    const range = maxs[j]! - mins[j]!;
    steps.push(range === 0 ? 0 : range / (resolution - 1));
  }

  const total = Math.pow(resolution, p);
  const grid: number[][] = [];
  const flat = new Float64Array(total * p);
  for (let idx = 0; idx < total; idx++) {
    const pt: number[] = new Array(p);
    let remainder = idx;
    for (let j = 0; j < p; j++) {
      const digit = remainder % resolution;
      remainder = Math.floor(remainder / resolution);
      pt[j] = mins[j]! + digit * (steps[j] ?? 0);
      flat[idx * p + j] = pt[j]!;
    }
    grid.push(pt);
  }
  return { grid, flat };
}
