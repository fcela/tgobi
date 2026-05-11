export interface MissingMask {
  readonly buffer: Uint8Array;
  readonly length: number;
  isMissing(i: number): boolean;
  setMissing(i: number, missing: boolean): void;
  count(): number;
}

export interface NumericColumn {
  readonly type: "numeric";
  readonly name: string;
  readonly length: number;
  readonly values: Float64Array;
  readonly missing: MissingMask;
}

export interface IntegerColumn {
  readonly type: "integer";
  readonly name: string;
  readonly length: number;
  readonly values: Int32Array;
  readonly missing: MissingMask;
}

export interface CategoricalColumn {
  readonly type: "categorical";
  readonly name: string;
  readonly length: number;
  readonly codes: Int32Array;                    // 0..levels.length-1; undefined for missing rows
  readonly levels: ReadonlyArray<string>;
  readonly missing: MissingMask;
}

export interface DateColumn {
  readonly type: "date";
  readonly name: string;
  readonly length: number;
  readonly values: Float64Array;                 // ms since epoch
  readonly missing: MissingMask;
}

export type Column =
  | NumericColumn
  | IntegerColumn
  | CategoricalColumn
  | DateColumn;

export type ColumnType = Column["type"];

export type DeriveSpec =
  | { kind: "log"; source: string }
  | { kind: "sqrt"; source: string }
  | { kind: "standardize"; source: string }
  | { kind: "rank"; source: string }
  | { kind: "negate"; source: string };

export interface DataFrame {
  readonly nrow: number;
  readonly columns: ReadonlyArray<Column>;
  column(name: string): Column | undefined;
  derive(name: string, spec: DeriveSpec): DataFrame;
}
