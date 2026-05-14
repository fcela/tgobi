import { describe, it, expect } from "vitest";
import { loess } from "@/lib/stats/loess";

function makeMissing(n: number, indices: number[] = []): Uint8Array {
  const buf = new Uint8Array(Math.ceil(n / 8));
  for (const i of indices) {
    buf[i >> 3]! |= 1 << (i & 7);
  }
  return buf;
}

describe("loess", () => {
  it("returns null for fewer than 4 points", () => {
    const x = new Float64Array([1, 2, 3]);
    const y = new Float64Array([1, 2, 3]);
    expect(loess(x, y, new Uint8Array(1), new Uint8Array(1))).toBeNull();
  });

  it("returns null for constant x", () => {
    const x = new Float64Array([1, 1, 1, 1, 1]);
    const y = new Float64Array([1, 2, 3, 4, 5]);
    expect(loess(x, y, new Uint8Array(1), new Uint8Array(1))).toBeNull();
  });

  it("smooths a linear relationship", () => {
    const n = 50;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      y[i] = 2 * i + 1;
    }
    const result = loess(x, y, makeMissing(n), new Uint8Array(1), 0.5, 10);
    expect(result).not.toBeNull();
    expect(result!.x.length).toBe(10);
    expect(result!.y.length).toBe(10);
    expect(Math.abs(result!.y[0]! - 1)).toBeLessThan(2);
    expect(Math.abs(result!.y[9]! - 99)).toBeLessThan(5);
  });

  it("smooths a quadratic with noise", () => {
    const n = 100;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i / 10;
      y[i] = x[i]! * x[i]! + Math.sin(i * 7) * 0.5;
    }
    const result = loess(x, y, makeMissing(n), new Uint8Array(1), 0.3, 20);
    expect(result).not.toBeNull();
    expect(result!.x.length).toBe(20);
    expect(result!.y[19]!).toBeGreaterThan(result!.y[0]!);
  });

  it("excludes missing values", () => {
    const n = 20;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      y[i] = i * 2;
    }
    const missing = makeMissing(n, [5, 10]);
    const result = loess(x, y, missing, new Uint8Array(1), 0.5, 10);
    expect(result).not.toBeNull();
  });

  it("excludes shadow rows", () => {
    const n = 20;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      y[i] = i * 2;
    }
    const shadow = makeMissing(n, [0]);
    const result = loess(x, y, new Uint8Array(1), shadow, 0.5, 10);
    expect(result).not.toBeNull();
  });

  it("output x is sorted and spans the data range", () => {
    const n = 30;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = n - i;
      y[i] = i;
    }
    const result = loess(x, y, makeMissing(n), new Uint8Array(1), 0.5, 10);
    expect(result).not.toBeNull();
    expect(result!.x[0]!).toBeLessThanOrEqual(result!.x[1]!);
    expect(result!.x[0]!).toBe(1);
    expect(result!.x[9]!).toBe(30);
  });
});
