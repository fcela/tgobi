import { describe, it, expect } from "vitest";
import { parseGgobiXml, parseGgobiXmlBundle } from "@/lib/io/ggobi-xml";

const FLEA_LIKE = `<?xml version="1.0"?>
<ggobidata>
<data name="flea">
<variables count="3">
  <realvariable name="tars1" />
  <realvariable name="tars2" />
  <categoricalvariable name="species">
    <levels count="2">
      <level value="1">Concinna</level>
      <level value="2">Heptapot</level>
    </levels>
  </categoricalvariable>
</variables>
<records count="2" missingValue="NA">
<record>191 131 1</record>
<record>NA 118 2</record>
</records>
</data>
</ggobidata>`;

describe("parseGgobiXml", () => {
  it("parses real + categorical variables and records", () => {
    const df = parseGgobiXml(FLEA_LIKE);
    expect(df.nrow).toBe(2);
    expect(df.column("tars1")?.type).toBe("numeric");
    expect(df.column("species")?.type).toBe("categorical");
    if (df.column("species")?.type === "categorical") {
      expect((df.column("species") as unknown as { levels: string[] }).levels).toEqual(["Concinna", "Heptapot"]);
    }
    expect(df.column("tars1")?.missing.isMissing(1)).toBe(true);
  });

  it("handles integer variable", () => {
    const xml = `<?xml version="1.0"?><ggobidata><data name="d">
      <variables count="1"><integervariable name="k" /></variables>
      <records count="3"><record>1</record><record>2</record><record>3</record></records>
      </data></ggobidata>`;
    const df = parseGgobiXml(xml);
    expect(df.column("k")?.type).toBe("integer");
  });

  it("parses edge elements with row-number endpoints", () => {
    const xml = `<?xml version="1.0"?><ggobidata>
      <data name="nodes">
        <variables count="1"><realvariable name="x" /></variables>
        <records count="3"><record>1</record><record>2</record><record>3</record></records>
      </data>
      <edges count="2">
        <edge source="1" target="2" weight="0.5" />
        <edge source="2" target="3" weight="1.5" />
      </edges>
    </ggobidata>`;
    const out = parseGgobiXmlBundle(xml);
    expect(out.df.column("x")?.length).toBe(3);
    expect(Array.from(out.edges?.source ?? [])).toEqual([0, 1]);
    expect(Array.from(out.edges?.target ?? [])).toEqual([1, 2]);
    expect(out.edges?.attrs?.column("weight")?.type).toBe("numeric");
  });

  it("parses edge elements with record id endpoints", () => {
    const xml = `<?xml version="1.0"?><ggobidata>
      <data name="nodes">
        <variables count="1"><realvariable name="x" /></variables>
        <records count="3">
          <record id="a">1</record>
          <record id="b">2</record>
          <record id="c">3</record>
        </records>
      </data>
      <edges count="1"><edge source="a" target="c" /></edges>
    </ggobidata>`;
    const out = parseGgobiXmlBundle(xml);
    expect(Array.from(out.edges?.source ?? [])).toEqual([0]);
    expect(Array.from(out.edges?.target ?? [])).toEqual([2]);
  });

  it("leaves empty edges as null", () => {
    const xml = `<?xml version="1.0"?><ggobidata>
      <data name="nodes">
        <variables count="1"><realvariable name="x" /></variables>
        <records count="2"><record>1</record><record>2</record></records>
      </data>
      <data name="edges">
        <variables count="0"></variables>
        <edges count="0"></edges>
        <records count="0"></records>
      </data>
    </ggobidata>`;
    const out = parseGgobiXmlBundle(xml);
    expect(out.df.column("x")?.length).toBe(2);
    expect(out.edges).toBeNull();
  });

  it("rejects when no <data> block is found", () => {
    expect(() => parseGgobiXml(`<?xml version="1.0"?><ggobidata></ggobidata>`)).toThrow(/data/);
  });
});
