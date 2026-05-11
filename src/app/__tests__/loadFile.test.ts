import { describe, it, expect } from "vitest";
import { loadDatasetFile, loadFile } from "@/app/loadFile";

function makeFile(name: string, body: string): File {
  return new File([body], name, { type: "text/plain" });
}

describe("loadFile", () => {
  it("loads CSV by extension", async () => {
    const df = await loadFile(makeFile("d.csv", "a,b\n1,2\n3,4\n"));
    expect(df.nrow).toBe(2);
  });

  it("loads JSON by extension", async () => {
    const df = await loadFile(makeFile("d.json", JSON.stringify([{ a: 1 }, { a: 2 }])));
    expect(df.nrow).toBe(2);
  });

  it("loads XML by extension", async () => {
    const xml = `<?xml version="1.0"?><ggobidata><data name="d">
      <variables count="1"><realvariable name="x" /></variables>
      <records count="2"><record>1</record><record>2</record></records>
      </data></ggobidata>`;
    const df = await loadFile(makeFile("d.xml", xml));
    expect(df.column("x")?.length).toBe(2);
  });

  it("loads XML edges through dataset loading", async () => {
    const xml = `<?xml version="1.0"?><ggobidata><data name="d">
      <variables count="1"><realvariable name="x" /></variables>
      <records count="2"><record>1</record><record>2</record></records>
      </data><edges><edge source="1" target="2" /></edges></ggobidata>`;
    const loaded = await loadDatasetFile(makeFile("d.xml", xml));
    expect(loaded.df.column("x")?.length).toBe(2);
    expect(Array.from(loaded.edges?.source ?? [])).toEqual([0]);
    expect(Array.from(loaded.edges?.target ?? [])).toEqual([1]);
  });

  it("rejects unknown extensions", async () => {
    await expect(loadFile(makeFile("d.parquet", ""))).rejects.toThrow(/Unsupported/);
  });
});
