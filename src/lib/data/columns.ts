import type {
  CategoricalColumn,
  DateColumn,
  IntegerColumn,
  MissingMask,
  NumericColumn,
} from "@/lib/data/types";
import { BitMissingMask } from "@/lib/data/missing";

function defaultMask(n: number, given: MissingMask | undefined): MissingMask {
  if (given) {
    if (given.length !== n) throw new RangeError(`mask length ${given.length} != ${n}`);
    return given;
  }
  return new BitMissingMask(n);
}

export function makeNumericColumn(
  name: string,
  values: Float64Array,
  missing?: MissingMask,
): NumericColumn {
  return {
    type: "numeric",
    name,
    length: values.length,
    values,
    missing: defaultMask(values.length, missing),
  };
}

export function makeIntegerColumn(
  name: string,
  values: Int32Array,
  missing?: MissingMask,
): IntegerColumn {
  return {
    type: "integer",
    name,
    length: values.length,
    values,
    missing: defaultMask(values.length, missing),
  };
}

export function makeCategoricalColumn(
  name: string,
  codes: Int32Array,
  levels: ReadonlyArray<string>,
  missing?: MissingMask,
): CategoricalColumn {
  const mask = defaultMask(codes.length, missing);
  for (let i = 0; i < codes.length; i++) {
    if (mask.isMissing(i)) continue;
    const c = codes[i]!;
    if (c < 0 || c >= levels.length) {
      throw new RangeError(`row ${i}: code ${c} not in [0, ${levels.length})`);
    }
  }
  return { type: "categorical", name, length: codes.length, codes, levels, missing: mask };
}

export function makeDateColumn(
  name: string,
  values: Float64Array,
  missing?: MissingMask,
): DateColumn {
  return {
    type: "date",
    name,
    length: values.length,
    values,
    missing: defaultMask(values.length, missing),
  };
}
