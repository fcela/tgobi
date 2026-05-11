import { describe, it, expect } from "vitest";
import { categoricalScale, sequentialScale, divergingScale } from "@/lib/color/scales";
import {
  makeCategoricalColumn,
  makeNumericColumn,
} from "@/lib/data/columns";
import { TABLEAU10, VIRIDIS, RDBU } from "@/lib/color/palettes";
import { BitMissingMask } from "@/lib/data/missing";

describe("categoricalScale", () => {
  it("maps each level to the palette by code", () => {
    const col = makeCategoricalColumn("g", new Int32Array([0, 1, 2, 0]), ["a", "b", "c"]);
    const fn = categoricalScale(col, TABLEAU10);
    expect(fn(0)).toBe(TABLEAU10[0]);
    expect(fn(1)).toBe(TABLEAU10[1]);
    expect(fn(2)).toBe(TABLEAU10[2]);
    expect(fn(3)).toBe(TABLEAU10[0]);
  });

  it("returns neutral for missing rows", () => {
    const m = new BitMissingMask(2);
    m.setMissing(1, true);
    const col = makeCategoricalColumn("g", new Int32Array([0, 0]), ["a"], m);
    const fn = categoricalScale(col, TABLEAU10);
    expect(fn(0)).toBe(TABLEAU10[0]);
    expect(fn(1)).toBe("#777777");
  });
});

describe("sequentialScale", () => {
  it("maps min to first stop, max to last stop", () => {
    const col = makeNumericColumn("x", new Float64Array([0, 5, 10]));
    const fn = sequentialScale(col, VIRIDIS);
    expect(fn(0)).toBe(VIRIDIS[0]);
    expect(fn(2)).toBe(VIRIDIS[VIRIDIS.length - 1]);
  });

  it("constant column → first stop everywhere, no NaN", () => {
    const col = makeNumericColumn("x", new Float64Array([5, 5, 5]));
    const fn = sequentialScale(col, VIRIDIS);
    expect(fn(0)).toBe(VIRIDIS[0]);
    expect(fn(1)).toBe(VIRIDIS[0]);
  });
});

describe("divergingScale", () => {
  it("maps min/max symmetrically around midpoint", () => {
    const col = makeNumericColumn("x", new Float64Array([-1, 0, 1]));
    const fn = divergingScale(col, RDBU);
    // min -> first stop, max -> last stop
    expect(fn(0)).toBe(RDBU[0]);
    expect(fn(2)).toBe(RDBU[RDBU.length - 1]);
  });
});
