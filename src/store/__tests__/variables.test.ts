import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

describe("VariablesSlice scaling and group actions", () => {
  beforeEach(() => {
    useAppStore.setState({
      spec: [
        { name: "x", type: "numeric", included: true },
        { name: "y", type: "numeric", included: true },
        { name: "cat", type: "categorical", included: true },
      ],
    });
  });

  it("setScaling sets a scaling mode on a variable", () => {
    useAppStore.getState().setScaling("x", "range");
    const spec = useAppStore.getState().spec;
    expect(spec.find((v) => v.name === "x")?.scaling).toBe("range");
    expect(spec.find((v) => v.name === "y")?.scaling).toBeUndefined();
  });

  it("setScaling with undefined clears the scaling mode", () => {
    useAppStore.getState().setScaling("x", "range");
    useAppStore.getState().setScaling("x", undefined);
    const spec = useAppStore.getState().spec;
    expect(spec.find((v) => v.name === "x")?.scaling).toBeUndefined();
  });

  it("setGroup assigns a group to a variable", () => {
    useAppStore.getState().setGroup("x", "A");
    useAppStore.getState().setGroup("y", "A");
    const spec = useAppStore.getState().spec;
    expect(spec.find((v) => v.name === "x")?.group).toBe("A");
    expect(spec.find((v) => v.name === "y")?.group).toBe("A");
    expect(spec.find((v) => v.name === "cat")?.group).toBeUndefined();
  });

  it("setGroup with undefined clears the group", () => {
    useAppStore.getState().setGroup("x", "A");
    useAppStore.getState().setGroup("x", undefined);
    const spec = useAppStore.getState().spec;
    expect(spec.find((v) => v.name === "x")?.group).toBeUndefined();
  });

  it("setGroupScaling changes scaling for all variables in the group", () => {
    useAppStore.getState().setGroup("x", "A");
    useAppStore.getState().setGroup("y", "A");
    useAppStore.getState().setGroupScaling("A", "standardize");
    const spec = useAppStore.getState().spec;
    expect(spec.find((v) => v.name === "x")?.scaling).toBe("standardize");
    expect(spec.find((v) => v.name === "y")?.scaling).toBe("standardize");
    expect(spec.find((v) => v.name === "cat")?.scaling).toBeUndefined();
  });

  it("setGroupScaling with undefined clears scaling for the group", () => {
    useAppStore.getState().setGroup("x", "A");
    useAppStore.getState().setGroup("y", "A");
    useAppStore.getState().setGroupScaling("A", "robust");
    useAppStore.getState().setGroupScaling("A", undefined);
    const spec = useAppStore.getState().spec;
    expect(spec.find((v) => v.name === "x")?.scaling).toBeUndefined();
    expect(spec.find((v) => v.name === "y")?.scaling).toBeUndefined();
  });

  it("setGroupScaling does not affect variables in other groups", () => {
    useAppStore.getState().setGroup("x", "A");
    useAppStore.getState().setGroup("y", "B");
    useAppStore.getState().setScaling("y", "range");
    useAppStore.getState().setGroupScaling("A", "standardize");
    const spec = useAppStore.getState().spec;
    expect(spec.find((v) => v.name === "x")?.scaling).toBe("standardize");
    expect(spec.find((v) => v.name === "y")?.scaling).toBe("range");
  });
});
