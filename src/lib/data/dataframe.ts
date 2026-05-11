import type { Column, DataFrame, DeriveSpec } from "@/lib/data/types";
import { applyTransform } from "@/lib/data/transforms";

abstract class BaseDataFrame implements DataFrame {
  abstract readonly nrow: number;
  abstract readonly columns: ReadonlyArray<Column>;
  abstract column(name: string): Column | undefined;

  derive(name: string, spec: DeriveSpec): DataFrame {
    if (this.column(name) !== undefined) {
      throw new Error(`column "${name}" already exists`);
    }
    const src = this.column(spec.source);
    if (!src) throw new Error(`derive: unknown source column "${spec.source}"`);
    return new DerivedDataFrame(this, name, spec, src);
  }
}

export class ArrayDataFrame extends BaseDataFrame {
  readonly nrow: number;
  readonly columns: ReadonlyArray<Column>;
  readonly #byName: Map<string, Column>;

  constructor(columns: ReadonlyArray<Column>) {
    super();
    if (columns.length > 0) {
      const n = columns[0]!.length;
      for (const c of columns) {
        if (c.length !== n) throw new RangeError(`column ${c.name} length ${c.length} != ${n}`);
      }
      this.nrow = n;
    } else {
      this.nrow = 0;
    }
    this.columns = columns;
    this.#byName = new Map();
    for (const c of columns) {
      if (this.#byName.has(c.name)) throw new Error(`duplicate column name: ${c.name}`);
      this.#byName.set(c.name, c);
    }
  }

  column(name: string): Column | undefined {
    return this.#byName.get(name);
  }
}

class DerivedDataFrame extends BaseDataFrame {
  readonly nrow: number;
  readonly #base: DataFrame;
  readonly #name: string;
  readonly #spec: DeriveSpec;
  readonly #source: Column;
  #cached: Column | undefined;

  constructor(base: DataFrame, name: string, spec: DeriveSpec, source: Column) {
    super();
    this.#base = base;
    this.nrow = base.nrow;
    this.#name = name;
    this.#spec = spec;
    this.#source = source;
  }

  get columns(): ReadonlyArray<Column> {
    return [...this.#base.columns, this.#materialize()];
  }

  column(name: string): Column | undefined {
    if (name === this.#name) return this.#materialize();
    return this.#base.column(name);
  }

  #materialize(): Column {
    if (!this.#cached) {
      this.#cached = applyTransform(this.#spec, this.#source, this.#name);
    }
    return this.#cached;
  }
}
