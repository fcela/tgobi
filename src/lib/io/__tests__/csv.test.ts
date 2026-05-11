import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/io/csv";

const sample = `tars1,tars2,species
191,131,Concinna
185,134,Concinna
160,118,Heikertingeri
NA,118,Heikertingeri
`;

describe("parseCsv", () => {
  it("parses header + rows into a DataFrame with inferred types", () => {
    const df = parseCsv(sample);
    expect(df.nrow).toBe(4);
    const tars1 = df.column("tars1");
    const species = df.column("species");
    expect(tars1?.type).toBe("integer");
    expect(species?.type).toBe("categorical");
    expect(species?.length).toBe(4);
    expect(tars1?.missing.isMissing(3)).toBe(true);
  });

  it("respects column type overrides", () => {
    const df = parseCsv(sample, { overrides: { tars1: "numeric" } });
    expect(df.column("tars1")?.type).toBe("numeric");
  });

  it("supports custom delimiter", () => {
    const tsv = "a\tb\n1\t2\n3\t4\n";
    const df = parseCsv(tsv, { delimiter: "\t" });
    expect(df.nrow).toBe(2);
    expect(df.column("a")?.type).toBe("integer");
  });

  it("rejects empty input", () => {
    expect(() => parseCsv("")).toThrow(/empty/i);
  });
});
