import type { Column, DataFrame } from "@/lib/data/types";
import type { Edges } from "@/lib/edges/types";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import {
  makeCategoricalColumn,
  makeIntegerColumn,
  makeNumericColumn,
} from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";
import { buildEdgesFromEndpointPairs } from "@/lib/io/edges";

interface VarSpec {
  name: string;
  type: "real" | "integer" | "categorical";
  levels?: string[];
  levelByValue?: Map<string, number>;
}

export function parseGgobiXml(text: string): DataFrame {
  return parseGgobiXmlBundle(text).df;
}

export interface GgobiXmlBundle {
  df: DataFrame;
  edges: Edges | null;
}

export function parseGgobiXmlBundle(text: string): GgobiXmlBundle {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) throw new Error(`XML parse error: ${parserError.textContent}`);

  // Pick the first <data> block that has variables and records (skip edge-only blocks).
  const dataBlocks = Array.from(doc.querySelectorAll("data"));
  const node = dataBlocks.find((b) => b.querySelector("variables") && b.querySelector("records"));
  if (!node) throw new Error("ggobi XML: no <data> block with <variables> and <records>");

  const varEls = Array.from(node.querySelectorAll(":scope > variables > *"));
  const vars: VarSpec[] = [];
  for (const el of varEls) {
    const name = el.getAttribute("name") ?? "";
    const tag = el.tagName.toLowerCase();
    if (tag === "realvariable") {
      vars.push({ name, type: "real" });
    } else if (tag === "integervariable") {
      vars.push({ name, type: "integer" });
    } else if (tag === "categoricalvariable") {
      const levels: string[] = [];
      const levelByValue = new Map<string, number>();
      const levelEls = Array.from(el.querySelectorAll(":scope > levels > level"));
      for (const lvl of levelEls) {
        const value = lvl.getAttribute("value") ?? "";
        const label = (lvl.textContent ?? "").trim();
        levelByValue.set(value, levels.length);
        levels.push(label);
      }
      vars.push({ name, type: "categorical", levels, levelByValue });
    }
    // edge / variable subtypes we don't support yet are skipped silently
  }
  if (vars.length === 0) throw new Error("ggobi XML: no supported <variables>");

  const recordsEl = node.querySelector(":scope > records");
  if (!recordsEl) throw new Error("ggobi XML: missing <records>");
  const missingSentinel = recordsEl.getAttribute("missingValue") ?? "NA";
  const recordEls = Array.from(recordsEl.querySelectorAll(":scope > record"));
  const nrow = recordEls.length;
  const idByRowId = new Map<string, number>();
  for (let r = 0; r < recordEls.length; r++) {
    const id = recordEls[r]!.getAttribute("id");
    if (id) idByRowId.set(id, r);
  }

  // Pre-allocate per-column raw string arrays.
  const raw: string[][] = vars.map(() => new Array<string>(nrow));
  for (let r = 0; r < nrow; r++) {
    const tokens = (recordEls[r]!.textContent ?? "").trim().split(/\s+/);
    for (let c = 0; c < vars.length; c++) {
      raw[c]![r] = tokens[c] ?? missingSentinel;
    }
  }

  const columns: Column[] = vars.map((v, c) => buildColumn(v, raw[c]!, missingSentinel));
  const df = new ArrayDataFrame(columns);
  return { df, edges: parseXmlEdges(doc, nrow, idByRowId) };
}

function parseXmlEdges(doc: XMLDocument, nrow: number, idByRowId: Map<string, number>): Edges | null {
  const pairs: Array<[string, string]> = [];
  const attrRows: Array<Record<string, unknown>> = [];

  for (const el of Array.from(doc.querySelectorAll("edge, segment"))) {
    const source = firstAttr(el, ["source", "src", "from"]);
    const target = firstAttr(el, ["target", "destination", "dest", "dst", "to"]);
    if (source != null && target != null) {
      pairs.push([source, target]);
      attrRows.push(edgeElementAttrs(el));
    }
  }

  for (const data of Array.from(doc.querySelectorAll("data"))) {
    if (data.querySelector(":scope > edges, :scope > segments")) continue;
    const variableNames = Array
      .from(data.querySelectorAll(":scope > variables > *"))
      .map((el) => el.getAttribute("name") ?? "");
    const sourceIndex = firstNameIndex(variableNames, ["source", "src", "from"]);
    const targetIndex = firstNameIndex(variableNames, ["target", "destination", "dest", "dst", "to"]);
    if (sourceIndex < 0 || targetIndex < 0) continue;
    const recordEls = Array.from(data.querySelectorAll(":scope > records > record"));
    for (const record of recordEls) {
      const tokens = (record.textContent ?? "").trim().split(/\s+/);
      const source = tokens[sourceIndex];
      const target = tokens[targetIndex];
      if (source != null && target != null) {
        pairs.push([source, target]);
        const attrs: Record<string, unknown> = {};
        for (let i = 0; i < variableNames.length; i++) {
          if (i === sourceIndex || i === targetIndex) continue;
          const name = variableNames[i];
          if (name) attrs[name] = tokens[i] ?? "";
        }
        attrRows.push(attrs);
      }
    }
  }

  return buildEdgesFromEndpointPairs(pairs, nrow, idByRowId, attrRows);
}

function firstAttr(el: Element, names: ReadonlyArray<string>): string | null {
  for (const name of names) {
    const value = el.getAttribute(name);
    if (value != null && value !== "") return value;
  }
  return null;
}

function edgeElementAttrs(el: Element): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const attr of Array.from(el.attributes)) {
    if (!isEndpointAttr(attr.name)) attrs[attr.name] = attr.value;
  }
  return attrs;
}

function isEndpointAttr(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "source" ||
    lower === "src" ||
    lower === "from" ||
    lower === "target" ||
    lower === "destination" ||
    lower === "dest" ||
    lower === "dst" ||
    lower === "to"
  );
}

function firstNameIndex(names: ReadonlyArray<string>, candidates: ReadonlyArray<string>): number {
  const lower = names.map((name) => name.toLowerCase());
  for (const candidate of candidates) {
    const idx = lower.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  return -1;
}

function buildColumn(v: VarSpec, raw: string[], missingSentinel: string): Column {
  const n = raw.length;
  const missing = new BitMissingMask(n);
  for (let i = 0; i < n; i++) {
    if (raw[i] === missingSentinel || raw[i] === "") missing.setMissing(i, true);
  }

  if (v.type === "real") {
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) if (!missing.isMissing(i)) values[i] = parseFloat(raw[i]!);
    return makeNumericColumn(v.name, values, missing);
  }
  if (v.type === "integer") {
    const values = new Int32Array(n);
    for (let i = 0; i < n; i++) if (!missing.isMissing(i)) values[i] = parseInt(raw[i]!, 10);
    return makeIntegerColumn(v.name, values, missing);
  }
  // categorical
  const levels = v.levels ?? [];
  const levelByValue = v.levelByValue ?? new Map<string, number>();
  const codes = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (missing.isMissing(i)) continue;
    const c = levelByValue.get(raw[i]!);
    if (c === undefined) {
      // unseen value — append a new level on the fly
      const newCode = levels.length;
      levels.push(raw[i]!);
      levelByValue.set(raw[i]!, newCode);
      codes[i] = newCode;
    } else {
      codes[i] = c;
    }
  }
  return makeCategoricalColumn(v.name, codes, levels, missing);
}
