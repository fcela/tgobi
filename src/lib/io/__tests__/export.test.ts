import { describe, it, expect } from "vitest";
import { exportCsv } from "@/lib/io/export";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn, makeIntegerColumn } from "@/lib/data/columns";

describe("exportCsv", () => {
  it("exports all rows when no shadow mask", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    const csv = exportCsv(df);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe("x,g");
    expect(lines).toHaveLength(4);
  });

  it("exports only visible rows when visibleOnly is set", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([10, 20, 30])),
    ]);
    const shadow = new Uint8Array(1);
    shadow[0] = 0b010;
    const csv = exportCsv(df, { visibleOnly: true, shadow });
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe("x");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("10");
    expect(lines[2]).toBe("30");
  });

  it("formats categorical values as level strings", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("region", new Int32Array([0, 1, 2]), ["North", "South", "East"]),
    ]);
    const csv = exportCsv(df);
    expect(csv).toContain("North");
    expect(csv).toContain("South");
    expect(csv).toContain("East");
  });

  it("formats integer values as integers", () => {
    const df = new ArrayDataFrame([
      makeIntegerColumn("n", new Int32Array([7, 42, 100])),
    ]);
    const csv = exportCsv(df);
    expect(csv).toContain("42");
  });

  it("includes paint group column when paint is provided", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2])),
    ]);
    const paint = new Uint8Array([0, 3]);
    const csv = exportCsv(df, { paint });
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe("x,_paint_group");
    expect(lines[1]).toBe("1,0");
    expect(lines[2]).toBe("2,3");
  });

  it("includes cluster column when cluster is provided", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([5, 6])),
    ]);
    const cluster = new Int16Array([0, 1]);
    const csv = exportCsv(df, { cluster });
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe("x,_cluster");
    expect(lines[1]).toBe("5,0");
    expect(lines[2]).toBe("6,1");
  });
});
