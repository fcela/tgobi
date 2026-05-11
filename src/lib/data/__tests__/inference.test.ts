import { describe, it, expect } from "vitest";
import { inferColumn, MISSING_SENTINELS } from "@/lib/data/inference";

describe("inferColumn", () => {
  it("integers", () => {
    const col = inferColumn("k", ["1", "2", "3", "4"]);
    expect(col.type).toBe("integer");
    if (col.type === "integer") expect(Array.from(col.values)).toEqual([1, 2, 3, 4]);
  });

  it("numerics with decimals", () => {
    const col = inferColumn("x", ["1.5", "2.0", "3.25"]);
    expect(col.type).toBe("numeric");
  });

  it("categoricals when not parseable as number", () => {
    const col = inferColumn("g", ["red", "blue", "red", "green"]);
    expect(col.type).toBe("categorical");
    if (col.type === "categorical") {
      expect(col.levels.length).toBe(3);
      expect(new Set(col.levels)).toEqual(new Set(["red", "blue", "green"]));
    }
  });

  it("missing sentinels", () => {
    const col = inferColumn("x", ["1", "NA", "", "3"]);
    expect(col.type).toBe("integer");
    expect(col.missing.isMissing(1)).toBe(true);
    expect(col.missing.isMissing(2)).toBe(true);
    expect(col.missing.count()).toBe(2);
  });

  it("forced type override: numeric → numeric even when integers", () => {
    const col = inferColumn("k", ["1", "2", "3"], { force: "numeric" });
    expect(col.type).toBe("numeric");
  });

  it("forced type override: categorical from number-looking strings", () => {
    const col = inferColumn("g", ["1", "2", "1"], { force: "categorical" });
    expect(col.type).toBe("categorical");
    if (col.type === "categorical") expect(col.levels).toEqual(["1", "2"]);
  });

  it("MISSING_SENTINELS includes 'NA' and empty", () => {
    expect(MISSING_SENTINELS.has("NA")).toBe(true);
    expect(MISSING_SENTINELS.has("")).toBe(true);
    expect(MISSING_SENTINELS.has("nan")).toBe(true);
    expect(MISSING_SENTINELS.has("null")).toBe(true);
  });
});
