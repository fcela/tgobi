import type { StateCreator } from "zustand";
import type { AppStore, ClassificationSlice } from "@/store/types";
import { knnClassify } from "@/lib/classification/knn";
import { naiveBayesClassify } from "@/lib/classification/naivebayes";
import { randomForestClassify } from "@/lib/classification/randomforest";
import { bitGet, bitSet } from "@/lib/brush/hitTest";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";

const MISCLASSIFIED_SHAPE = 3;

export const createClassificationSlice: StateCreator<AppStore, [], [], ClassificationSlice> = (set, get) => ({
  classification: {
    method: "knn",
    variables: [],
    classSource: "paint",
    gridResolution: 5,
    knnK: 5,
    rfNEstimators: 50,
    rfMaxDepth: 10,
    boundaryPaint: null,
    boundaryGrid: null,
    gridSize: 0,
    predictions: null,
    misclassified: null,
    classToPaint: null,
    running: false,
    error: null,
  },

  setClassificationMethod: (method) =>
    set((s) => ({ classification: { ...s.classification, method, boundaryPaint: null, boundaryGrid: null, gridSize: 0, predictions: null, misclassified: null, classToPaint: null, error: null } })),

  setClassificationVariables: (variables) =>
    set((s) => ({ classification: { ...s.classification, variables, boundaryPaint: null, boundaryGrid: null, gridSize: 0, predictions: null, misclassified: null, classToPaint: null, error: null } })),

  setClassificationClassSource: (classSource) =>
    set((s) => ({ classification: { ...s.classification, classSource, boundaryPaint: null, boundaryGrid: null, gridSize: 0, predictions: null, misclassified: null, classToPaint: null, error: null } })),

  setClassificationGridResolution: (gridResolution) =>
    set((s) => ({ classification: { ...s.classification, gridResolution, boundaryPaint: null, boundaryGrid: null, gridSize: 0, predictions: null, misclassified: null, classToPaint: null, error: null } })),

  setClassificationKnnK: (knnK) =>
    set((s) => ({ classification: { ...s.classification, knnK, boundaryPaint: null, error: null } })),

  setClassificationRfNEstimators: (rfNEstimators) =>
    set((s) => ({ classification: { ...s.classification, rfNEstimators, boundaryPaint: null, error: null } })),

  setClassificationRfMaxDepth: (rfMaxDepth) =>
    set((s) => ({ classification: { ...s.classification, rfMaxDepth, boundaryPaint: null, error: null } })),

  runClassification: () => {
    const { df } = get();
    const { method, variables, classSource, gridResolution, knnK, rfNEstimators, rfMaxDepth } = get().classification;
    const { paint, shadow } = get().selection;

    if (!df || variables.length < 2) {
      set((s) => ({ classification: { ...s.classification, error: "Need data and 2+ variables" } }));
      return;
    }

    const n = df.nrow;
    const trainRows: number[] = [];
    const trainLabels: number[] = [];
    const classMap = new Map<number, number>();

    if (classSource === "paint") {
      for (let i = 0; i < n; i++) {
        if (bitGet(shadow, i)) continue;
        const p = paint[i]!;
        if (p <= 0) continue;
        if (!classMap.has(p)) classMap.set(p, classMap.size);
        trainRows.push(i);
        trainLabels.push(classMap.get(p)!);
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
        trainRows.push(i);
        trainLabels.push(classMap.get(code)!);
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

    try {
      const columns = variables.map((name) => df.column(name));
      const p = variables.length;

      const trainX: number[][] = [];
      const trainY: number[] = [];
      for (let ti = 0; ti < trainRows.length; ti++) {
        const i = trainRows[ti]!;
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
          trainX.push(row);
          trainY.push(trainLabels[ti]!);
        }
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

      const { grid: gridPts, flat: gridFlat } = buildGrid(mins, maxs, gridResolution);
      const allPts = [...trainX, ...gridPts];

      const result = method === "knn"
        ? knnClassify(trainX, trainY, allPts, knnK)
        : method === "naivebayes"
        ? naiveBayesClassify(trainX, trainY, allPts)
        : randomForestClassify(trainX, trainY, allPts, rfNEstimators, rfMaxDepth);

      const nTrain = trainX.length;
      const nGrid = gridPts.length;

      const predictions = new Int16Array(n);
      predictions.fill(-1);
      const misclassified = new Uint8Array(n);
      for (let ti = 0; ti < nTrain; ti++) {
        const rowIdx = trainRows[ti]!;
        const pred = result.predictions[ti]!;
        predictions[rowIdx] = pred;
        if (pred !== trainY[ti]) {
          misclassified[rowIdx] = 1;
        }
      }

      const boundaryPaint = new Uint8Array(nGrid);
      for (let i = 0; i < nGrid; i++) {
        const cls = result.predictions[nTrain + i]!;
        if (cls >= 0 && cls < classToPaint.length) {
          boundaryPaint[i] = classToPaint[cls]!;
        }
      }

      set((s) => ({
        classification: {
          ...s.classification,
          boundaryPaint,
          boundaryGrid: gridFlat,
          gridSize: nGrid,
          predictions,
          misclassified,
          classToPaint,
          running: false,
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
  },

  applyClassificationBoundaries: () => {
    const { boundaryPaint, boundaryGrid, gridSize, variables, misclassified, classToPaint, classSource, predictions } = get().classification;
    const { df } = get();
    if (!boundaryPaint || !boundaryGrid || !df || gridSize === 0) return;

    const nOrig = df.nrow;
    const nTotal = nOrig + gridSize;
    const p = variables.length;

    const newColumns = [...df.columns];
    for (let j = 0; j < p; j++) {
      const srcCol = df.column(variables[j]!);
      if (!srcCol || (srcCol.type !== "numeric" && srcCol.type !== "integer")) continue;
      const origValues = srcCol.type === "numeric" ? srcCol.values : new Float64Array(srcCol.values);
      const newValues = new Float64Array(nTotal);
      newValues.set(origValues);
      for (let i = 0; i < gridSize; i++) {
        newValues[nOrig + i] = boundaryGrid[i * p + j]!;
      }
      const idx = newColumns.findIndex((c) => c.name === variables[j]);
      if (idx >= 0) newColumns[idx] = makeNumericColumn(variables[j]!, newValues);
    }

    for (const col of df.columns) {
      if (variables.includes(col.name)) continue;
      if (col.type === "numeric") {
        const newValues = new Float64Array(nTotal);
        newValues.set(col.values);
        const idx = newColumns.findIndex((c) => c.name === col.name);
        if (idx >= 0) newColumns[idx] = makeNumericColumn(col.name, newValues);
      } else if (col.type === "integer") {
        const newValues = new Float64Array(nTotal);
        for (let i = 0; i < col.values.length; i++) newValues[i] = col.values[i]!;
        const idx = newColumns.findIndex((c) => c.name === col.name);
        if (idx >= 0) newColumns[idx] = makeNumericColumn(col.name, newValues);
      } else if (col.type === "categorical") {
        const newValues = new Float64Array(nTotal);
        const idx = newColumns.findIndex((c) => c.name === col.name);
        if (idx >= 0) newColumns[idx] = makeNumericColumn(col.name, newValues);
      } else if (col.type === "date") {
        const newValues = new Float64Array(nTotal);
        newValues.set(col.values);
        const idx = newColumns.findIndex((c) => c.name === col.name);
        if (idx >= 0) newColumns[idx] = makeNumericColumn(col.name, newValues);
      }
    }

    const newDf = new ArrayDataFrame(newColumns);
    const origPaint = get().selection.paint;
    const origShadow = get().selection.shadow;
    const origMask = get().selection.mask;
    const origShape = get().selection.shape;

    const newPaint = new Uint8Array(nTotal);
    if (classSource !== "paint" && predictions && classToPaint) {
      for (let i = 0; i < nOrig; i++) {
        const cls = predictions[i]!;
        if (cls >= 0 && cls < classToPaint.length) {
          newPaint[i] = classToPaint[cls]!;
        } else {
          newPaint[i] = origPaint[i] ?? 0;
        }
      }
    } else {
      newPaint.set(origPaint.subarray(0, nOrig));
    }
    newPaint.set(boundaryPaint, nOrig);

    const newShadow = new Uint8Array(Math.ceil(nTotal / 8));
    newShadow.set(origShadow.subarray(0, Math.ceil(nOrig / 8)));
    for (let i = nOrig; i < nTotal; i++) bitSet(newShadow, i);

    const newMask = new Uint8Array(Math.ceil(nTotal / 8));
    newMask.set(origMask.subarray(0, Math.ceil(nOrig / 8)));

    const newShape = new Uint8Array(nTotal);
    newShape.set(origShape.subarray(0, nOrig));
    if (misclassified) {
      for (let i = 0; i < nOrig; i++) {
        if (misclassified[i] && origShape[i] === 0) {
          newShape[i] = MISCLASSIFIED_SHAPE;
        }
      }
    }

    set((s) => ({
      df: newDf,
      selection: { mask: newMask, paint: newPaint, shape: newShape, shadow: newShadow },
      color: { ...s.color, encoding: { kind: "paint" } },
    }));

    if (variables.length >= 2) {
      get().addScatter(variables[0]!, variables[1]!);
    }
  },

  clearClassification: () =>
    set(() => ({
      classification: {
        method: "knn",
        variables: [],
        classSource: "paint",
        gridResolution: 5,
        knnK: 5,
        rfNEstimators: 50,
        rfMaxDepth: 10,
        boundaryPaint: null,
        boundaryGrid: null,
        gridSize: 0,
        predictions: null,
        misclassified: null,
        classToPaint: null,
        running: false,
        error: null,
      },
    })),
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
