export interface ConfusionMatrix {
  matrix: number[][];
  classLabels: string[];
  accuracy: number;
  perClass: {
    label: string;
    precision: number;
    recall: number;
    f1: number;
    support: number;
  }[];
  overallAccuracy: number;
  nCorrect: number;
  nTotal: number;
}

export function computeConfusionMatrix(
  actual: Int16Array,
  predicted: Int16Array,
  classLabels: string[],
): ConfusionMatrix {
  const k = classLabels.length;
  const matrix: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  let nCorrect = 0;
  let nTotal = 0;

  for (let i = 0; i < actual.length; i++) {
    const a = actual[i]!;
    const p = predicted[i]!;
    if (a < 0 || p < 0) continue;
    if (a >= k || p >= k) continue;
    matrix[a]![p]!++;
    if (a === p) nCorrect++;
    nTotal++;
  }

  const overallAccuracy = nTotal > 0 ? nCorrect / nTotal : 0;

  const perClass: ConfusionMatrix["perClass"] = [];
  for (let c = 0; c < k; c++) {
    const tp = matrix[c]![c]!;
    const fp = matrix.reduce((sum, row, r) => r !== c ? sum + row[c]! : sum, 0);
    const fn = matrix[c]!.reduce((sum, v, j) => j !== c ? sum + v : sum, 0);
    const support = matrix[c]!.reduce((sum, v) => sum + v, 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    perClass.push({ label: classLabels[c]!, precision, recall, f1, support });
  }

  return { matrix, classLabels, accuracy: overallAccuracy, perClass, overallAccuracy, nCorrect, nTotal };
}
