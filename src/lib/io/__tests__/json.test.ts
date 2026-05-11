import { describe, it, expect } from "vitest";
import { parseJson } from "@/lib/io/json";

describe("parseJson", () => {
  it("record-oriented: array of objects", () => {
    const df = parseJson([
      { x: 1, y: 2.5, g: "a" },
      { x: 2, y: 3.0, g: "b" },
      { x: 3, y: 4.5, g: "a" },
    ]);
    expect(df.nrow).toBe(3);
    expect(df.column("x")?.type).toBe("integer");
    expect(df.column("y")?.type).toBe("numeric");
    expect(df.column("g")?.type).toBe("categorical");
  });

  it("column-oriented: object of arrays", () => {
    const df = parseJson({ x: [1, 2, 3], y: [10.5, 20, 30] });
    expect(df.nrow).toBe(3);
    expect(df.column("x")?.type).toBe("integer");
  });

  it("treats null and undefined as missing", () => {
    const df = parseJson([{ x: 1 }, { x: null }, { x: 3 }]);
    expect(df.column("x")?.missing.isMissing(1)).toBe(true);
  });

  it("rejects column-oriented with mismatched lengths", () => {
    expect(() => parseJson({ x: [1, 2], y: [1, 2, 3] })).toThrow(/length/);
  });

  it("rejects empty input", () => {
    expect(() => parseJson([])).toThrow(/empty/i);
    expect(() => parseJson({})).toThrow(/empty/i);
  });
});
