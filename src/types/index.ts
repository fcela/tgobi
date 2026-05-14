import type { ColumnType, DeriveSpec } from "@/lib/data/types";

export type VarDeriveSpec =
  | DeriveSpec
  | { kind: "sphere"; sources: string[]; component: number; prefix: string }
  | { kind: "imputation"; source: string; method: "fixed" | "random" | "conditional"; value?: number; seed?: number; condVar?: string };

export type ScalingMode = "range" | "standardize" | "robust";

export interface VarSpec {
  name: string;
  type: ColumnType;
  included: boolean;
  derived?: VarDeriveSpec;
  scaling?: ScalingMode;
  group?: string;
}
