export interface Mat {
  readonly values: Float64Array;
  readonly nrow: number;
  readonly ncol: number;
}

export function makeMat(nrow: number, ncol: number, values?: Float64Array): Mat {
  if (nrow < 0 || ncol < 0) throw new RangeError("Mat: negative dim");
  const buf = values ?? new Float64Array(nrow * ncol);
  if (buf.length !== nrow * ncol) {
    throw new RangeError(`Mat: values.length ${buf.length} != ${nrow}*${ncol}`);
  }
  return { values: buf, nrow, ncol };
}
