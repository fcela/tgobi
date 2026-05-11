import { describe, it, expect } from "vitest";
import { bitGet } from "@/lib/brush/hitTest";
import {
  edgesFromNodeMask,
  edgesInBrush,
  nearestEdge,
  nodesFromEdgeMask,
  unionMasks,
} from "@/lib/edges/edgeHitTest";
import type { Edges } from "@/lib/edges/types";

function makeEdges(src: number[], tgt: number[]): Edges {
  return {
    source: Int32Array.from(src),
    target: Int32Array.from(tgt),
    directed: false,
  };
}

function makeNodeMask(n: number, setBits: number[]): Uint8Array {
  const mask = new Uint8Array(Math.ceil(n / 8));
  for (const i of setBits) mask[i >> 3] = mask[i >> 3]! | (1 << (i & 7));
  return mask;
}

describe("edgesFromNodeMask", () => {
  it("selects edges where either endpoint is selected", () => {
    const edges = makeEdges([0, 1, 2], [1, 2, 3]);
    const nodeMask = makeNodeMask(4, [1]);
    const edgeMask = edgesFromNodeMask(edges, nodeMask);
    expect(bitGet(edgeMask, 0)).toBe(true);
    expect(bitGet(edgeMask, 1)).toBe(true);
    expect(bitGet(edgeMask, 2)).toBe(false);
  });

  it("returns all-zero mask when no nodes selected", () => {
    const edges = makeEdges([0, 1], [1, 2]);
    const nodeMask = new Uint8Array(1);
    const edgeMask = edgesFromNodeMask(edges, nodeMask);
    expect(edgeMask.every((b) => b === 0)).toBe(true);
  });

  it("selects all edges when all endpoints selected", () => {
    const edges = makeEdges([0, 1], [1, 2]);
    const nodeMask = makeNodeMask(3, [0, 1, 2]);
    const edgeMask = edgesFromNodeMask(edges, nodeMask);
    for (let e = 0; e < edges.source.length; e++) expect(bitGet(edgeMask, e)).toBe(true);
  });

  it("handles empty edge set", () => {
    const edges = makeEdges([], []);
    const nodeMask = makeNodeMask(5, [0]);
    const edgeMask = edgesFromNodeMask(edges, nodeMask);
    expect(edgeMask.length).toBe(0);
  });
});

describe("nodesFromEdgeMask", () => {
  it("selects endpoints of selected edges", () => {
    const edges = makeEdges([0, 2, 4], [1, 3, 5]);
    const edgeMask = makeNodeMask(3, [1]);
    const nodeMask = nodesFromEdgeMask(edges, edgeMask, 6);
    expect(bitGet(nodeMask, 2)).toBe(true);
    expect(bitGet(nodeMask, 3)).toBe(true);
    expect(bitGet(nodeMask, 0)).toBe(false);
    expect(bitGet(nodeMask, 1)).toBe(false);
  });

  it("returns all-zero when no edges selected", () => {
    const edges = makeEdges([0, 1], [1, 2]);
    const edgeMask = new Uint8Array(1);
    const nodeMask = nodesFromEdgeMask(edges, edgeMask, 3);
    expect(nodeMask.every((b) => b === 0)).toBe(true);
  });
});

describe("edgesInBrush", () => {
  const xy = Float64Array.from([
    0, 0,
    10, 0,
    20, 0,
    30, 10,
    30, 30,
  ]);

  it("selects edges crossing a rectangle even when endpoints are outside", () => {
    const edges = makeEdges([0, 2], [2, 3]);
    const mask = edgesInBrush(edges, xy, {
      tool: "rectangle",
      rect: { x0: 5, y0: -2, x1: 15, y1: 2 },
    });
    expect(bitGet(mask, 0)).toBe(true);
    expect(bitGet(mask, 1)).toBe(false);
  });

  it("selects edges crossing an ellipse", () => {
    const edges = makeEdges([0, 3], [2, 4]);
    const mask = edgesInBrush(edges, xy, {
      tool: "ellipse",
      rect: { x0: 8, y0: -4, x1: 12, y1: 4 },
    });
    expect(bitGet(mask, 0)).toBe(true);
    expect(bitGet(mask, 1)).toBe(false);
  });

  it("selects edges crossing a lasso polygon", () => {
    const edges = makeEdges([0, 2], [2, 3]);
    const mask = edgesInBrush(edges, xy, {
      tool: "lasso",
      path: [
        { x: 5, y: -5 },
        { x: 15, y: -5 },
        { x: 15, y: 5 },
        { x: 5, y: 5 },
      ],
    });
    expect(bitGet(mask, 0)).toBe(true);
    expect(bitGet(mask, 1)).toBe(false);
  });

  it("skips edges touching excluded nodes", () => {
    const edges = makeEdges([0], [2]);
    const excluded = makeNodeMask(5, [2]);
    const mask = edgesInBrush(edges, xy, {
      tool: "rectangle",
      rect: { x0: 5, y0: -2, x1: 15, y1: 2 },
    }, excluded);
    expect(bitGet(mask, 0)).toBe(false);
  });
});

describe("unionMasks", () => {
  it("combines packed bit masks", () => {
    const a = makeNodeMask(10, [1, 8]);
    const b = makeNodeMask(10, [2, 8]);
    const out = unionMasks(a, b);
    expect(bitGet(out, 1)).toBe(true);
    expect(bitGet(out, 2)).toBe(true);
    expect(bitGet(out, 8)).toBe(true);
    expect(bitGet(out, 3)).toBe(false);
  });
});

describe("nearestEdge", () => {
  it("returns the nearest edge within the distance threshold", () => {
    const edges = makeEdges([0, 2], [1, 3]);
    const xy = Float64Array.from([
      0, 0,
      10, 0,
      0, 10,
      10, 10,
    ]);
    const hit = nearestEdge(edges, xy, { x: 5, y: 1 }, 3);
    expect(hit?.index).toBe(0);
    expect(hit?.distance).toBeCloseTo(1);
  });

  it("returns null when no edge is close enough", () => {
    const edges = makeEdges([0], [1]);
    const xy = Float64Array.from([0, 0, 10, 0]);
    expect(nearestEdge(edges, xy, { x: 5, y: 10 }, 3)).toBeNull();
  });
});
