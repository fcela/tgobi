// Tableau 10 (de-facto standard categorical palette).
export const TABLEAU10: ReadonlyArray<string> = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
];

// Viridis — perceptually-uniform sequential ramp (11 stops, sufficient for v1).
export const VIRIDIS: ReadonlyArray<string> = [
  "#440154", "#482878", "#3e4989", "#31688e", "#26828e",
  "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725",
  "#fde725",
];

// RdBu — diverging red→white→blue (11 stops, ColorBrewer).
export const RDBU: ReadonlyArray<string> = [
  "#67001f", "#b2182b", "#d6604d", "#f4a582", "#fddbc7",
  "#f7f7f7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac",
  "#053061",
];

const REGISTRY: Record<string, ReadonlyArray<string>> = {
  tableau10: TABLEAU10,
  viridis: VIRIDIS,
  RdBu: RDBU,
};

export function getPalette(name: string): ReadonlyArray<string> {
  const p = REGISTRY[name];
  if (!p) throw new Error(`unknown palette: ${name}`);
  return p;
}
