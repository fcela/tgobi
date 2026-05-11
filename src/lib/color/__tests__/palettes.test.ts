import { describe, it, expect } from "vitest";
import { TABLEAU10, VIRIDIS, RDBU, getPalette } from "@/lib/color/palettes";

describe("palettes", () => {
  it("TABLEAU10 has 10 categorical colours", () => {
    expect(TABLEAU10).toHaveLength(10);
    for (const c of TABLEAU10) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("VIRIDIS is a 256-stop sequential ramp", () => {
    expect(VIRIDIS.length).toBeGreaterThanOrEqual(11);
    expect(VIRIDIS[0]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("RDBU is a diverging ramp of >= 11 stops", () => {
    expect(RDBU.length).toBeGreaterThanOrEqual(11);
  });

  it("getPalette returns the named palette", () => {
    expect(getPalette("tableau10")).toBe(TABLEAU10);
    expect(getPalette("viridis")).toBe(VIRIDIS);
    expect(getPalette("RdBu")).toBe(RDBU);
  });

  it("getPalette throws on unknown name", () => {
    expect(() => getPalette("unknownPalette")).toThrow(/palette/);
  });
});
