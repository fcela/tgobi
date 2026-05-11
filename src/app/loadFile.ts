import type { DataFrame } from "@/lib/data/types";
import type { Edges } from "@/lib/edges/types";
import { parseCsv } from "@/lib/io/csv";
import { parseJson } from "@/lib/io/json";
import { parseGgobiXmlBundle } from "@/lib/io/ggobi-xml";

export interface LoadedData {
  df: DataFrame;
  edges: Edges | null;
}

export async function loadFile(file: File): Promise<DataFrame> {
  return (await loadDatasetFile(file)).df;
}

export async function loadDatasetFile(file: File): Promise<LoadedData> {
  const lower = file.name.toLowerCase();
  const text = await file.text();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    return { df: parseCsv(text, lower.endsWith(".tsv") ? { delimiter: "\t" } : {}), edges: null };
  }
  if (lower.endsWith(".json")) {
    return { df: parseJson(JSON.parse(text)), edges: null };
  }
  if (lower.endsWith(".xml")) {
    return parseGgobiXmlBundle(text);
  }
  throw new Error(`Unsupported file extension: ${file.name}`);
}

export async function loadUrl(url: string): Promise<DataFrame> {
  return (await loadDatasetUrl(url)).df;
}

export async function loadDatasetUrl(url: string): Promise<LoadedData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  const text = await res.text();
  const lower = url.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    return { df: parseCsv(text, lower.endsWith(".tsv") ? { delimiter: "\t" } : {}), edges: null };
  }
  if (lower.endsWith(".json")) return { df: parseJson(JSON.parse(text)), edges: null };
  if (lower.endsWith(".xml")) return parseGgobiXmlBundle(text);
  throw new Error(`Unsupported URL extension: ${url}`);
}
