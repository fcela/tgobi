import { describe, it, expect } from "vitest";
import { BitMissingMask } from "@/lib/data/missing";

describe("BitMissingMask", () => {
  it("starts with no bits set", () => {
    const m = new BitMissingMask(10);
    expect(m.length).toBe(10);
    expect(m.count()).toBe(0);
    for (let i = 0; i < 10; i++) expect(m.isMissing(i)).toBe(false);
  });

  it("setMissing toggles the right bit", () => {
    const m = new BitMissingMask(20);
    m.setMissing(3, true);
    m.setMissing(17, true);
    expect(m.isMissing(3)).toBe(true);
    expect(m.isMissing(17)).toBe(true);
    expect(m.isMissing(4)).toBe(false);
    expect(m.count()).toBe(2);
    m.setMissing(3, false);
    expect(m.count()).toBe(1);
  });

  it("buffer length rounds up", () => {
    expect(new BitMissingMask(0).buffer.length).toBe(0);
    expect(new BitMissingMask(1).buffer.length).toBe(1);
    expect(new BitMissingMask(8).buffer.length).toBe(1);
    expect(new BitMissingMask(9).buffer.length).toBe(2);
  });

  it("rejects out-of-range indices", () => {
    const m = new BitMissingMask(5);
    expect(() => m.isMissing(-1)).toThrow(RangeError);
    expect(() => m.isMissing(5)).toThrow(RangeError);
    expect(() => m.setMissing(5, true)).toThrow(RangeError);
  });
});
