import type { ColumnType } from "@/lib/data/types";

export interface VarSpec {
  name: string;
  type: ColumnType;
  included: boolean;
}
