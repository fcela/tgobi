import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().setSpec([]);
});

describe("VariablesSlice", () => {
  it("setSpec replaces the list", () => {
    useAppStore.getState().setSpec([{ name: "x", type: "numeric", included: true }]);
    expect(useAppStore.getState().spec).toEqual([{ name: "x", type: "numeric", included: true }]);
  });

  it("setIncluded toggles by name", () => {
    useAppStore.getState().setSpec([
      { name: "x", type: "numeric", included: true },
      { name: "y", type: "numeric", included: true },
    ]);
    useAppStore.getState().setIncluded("y", false);
    const s = useAppStore.getState().spec;
    expect(s.find((v) => v.name === "y")?.included).toBe(false);
    expect(s.find((v) => v.name === "x")?.included).toBe(true);
  });

  it("setType updates by name", () => {
    useAppStore.getState().setSpec([{ name: "g", type: "categorical", included: true }]);
    useAppStore.getState().setType("g", "numeric");
    expect(useAppStore.getState().spec[0]!.type).toBe("numeric");
  });
});
