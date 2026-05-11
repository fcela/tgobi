import { describe, it, expect } from "vitest";
import { parseEdgesCsv, parseEdgesJson } from "@/lib/io/edges";

describe("edge parsers", () => {
  it("parses one-based source/target CSV endpoints", () => {
    const edges = parseEdgesCsv("source,target\n1,2\n2,3\n", 3);
    expect(Array.from(edges.source)).toEqual([0, 1]);
    expect(Array.from(edges.target)).toEqual([1, 2]);
  });

  it("preserves standalone edge attributes", () => {
    const edges = parseEdgesCsv("source,target,weight,kind\n1,2,0.5,a\n2,3,1.5,b\n", 3);
    expect(edges.attrs?.column("weight")?.type).toBe("numeric");
    expect(edges.attrs?.column("kind")?.type).toBe("categorical");
    expect(edges.attrs?.nrow).toBe(2);
  });

  it("parses zero-based from/to JSON endpoints", () => {
    const edges = parseEdgesJson([{ from: 0, to: 2 }], 3);
    expect(Array.from(edges.source)).toEqual([0]);
    expect(Array.from(edges.target)).toEqual([2]);
  });

  it("rejects out-of-range endpoints", () => {
    expect(() => parseEdgesCsv("source,target\n1,4\n", 3)).toThrow(/out of range/);
  });
});
