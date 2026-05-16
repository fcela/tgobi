import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { AddPlotMenu } from "@/app/AddPlotMenu";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().clearPanels();
});

describe("AddPlotMenu", () => {
  it("disabled with no data", () => {
    render(<AddPlotMenu />);
    expect((screen.getByRole("button", { name: /add plot/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens, lists numeric vars, and adds a scatter on submit", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeNumericColumn("y", new Float64Array([3, 2, 1])),
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    render(<AddPlotMenu />);
    fireEvent.click(screen.getByRole("button", { name: /add plot/i }));
    const xSel = screen.getByLabelText("X variable") as HTMLSelectElement;
    const ySel = screen.getByLabelText("Y variable") as HTMLSelectElement;
    expect(Array.from(xSel.options).map((o) => o.value)).toEqual(["x", "y"]);
    fireEvent.change(xSel, { target: { value: "x" } });
    fireEvent.change(ySel, { target: { value: "y" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(useAppStore.getState().plots.panels).toHaveLength(1);
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({ kind: "scatter", x: "x", y: "y" });
  });

  it("adds a barchart from any variable", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    render(<AddPlotMenu />);
    fireEvent.click(screen.getByRole("button", { name: /add plot/i }));
    fireEvent.change(screen.getByLabelText(/plot type/i), { target: { value: "barchart" } });
    fireEvent.change(screen.getByLabelText(/bar variable/i), { target: { value: "g" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({
      kind: "barchart",
      variable: "g",
    });
  });

  it("adds a dotplot from a numeric variable", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeNumericColumn("y", new Float64Array([4, 5, 6])),
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    render(<AddPlotMenu />);
    fireEvent.click(screen.getByRole("button", { name: /add plot/i }));
    fireEvent.change(screen.getByLabelText(/plot type/i), { target: { value: "dotplot" } });
    fireEvent.change(screen.getByLabelText(/dot variable/i), { target: { value: "y" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({
      kind: "dotplot",
      variable: "y",
    });
  });

  it("adds a scatmat with selected variables", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
      makeNumericColumn("c", new Float64Array([7, 8, 9])),
    ]);
    useAppStore.getState().setData(df);
    render(<AddPlotMenu />);
    fireEvent.click(screen.getByRole("button", { name: /add plot/i }));
    fireEvent.change(screen.getByLabelText(/plot type/i), { target: { value: "scatmat" } });
    // All three vars should be checked by default (first up-to-6 numeric)
    // Uncheck "c" to test the toggle, then submit with "a" and "b"
    const cCheck = screen.getByLabelText(/scatmat variable c/i);
    fireEvent.click(cCheck); // uncheck c
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({
      kind: "scatmat",
      variables: ["a", "b"],
    });
  });

  it("scatmat Add button is disabled when fewer than 2 vars are selected", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
    ]);
    useAppStore.getState().setData(df);
    render(<AddPlotMenu />);
    fireEvent.click(screen.getByRole("button", { name: /add plot/i }));
    fireEvent.change(screen.getByLabelText(/plot type/i), { target: { value: "scatmat" } });
    // Uncheck both variables
    fireEvent.click(screen.getByLabelText(/scatmat variable a/i));
    fireEvent.click(screen.getByLabelText(/scatmat variable b/i));
    expect((screen.getByRole("button", { name: /^add$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds a parcoords with selected variables", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
      makeNumericColumn("c", new Float64Array([7, 8, 9])),
    ]);
    useAppStore.getState().setData(df);
    render(<AddPlotMenu />);
    fireEvent.click(screen.getByRole("button", { name: /add plot/i }));
    fireEvent.change(screen.getByLabelText(/plot type/i), { target: { value: "parcoords" } });
    // All three vars should be checked by default (first up-to-6 numeric)
    // Uncheck "c" to test the toggle, then submit with "a" and "b"
    const cCheck = screen.getByLabelText(/parcoords variable c/i);
    fireEvent.click(cCheck); // uncheck c
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
  expect(useAppStore.getState().plots.panels[0]).toMatchObject({
    kind: "parcoords",
    variables: ["a", "b"],
    condVar: null,
  });
  });

  it("parcoords Add button is disabled when fewer than 2 vars are selected", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
    ]);
    useAppStore.getState().setData(df);
    render(<AddPlotMenu />);
    fireEvent.click(screen.getByRole("button", { name: /add plot/i }));
    fireEvent.change(screen.getByLabelText(/plot type/i), { target: { value: "parcoords" } });
    // Uncheck both variables
    fireEvent.click(screen.getByLabelText(/parcoords variable a/i));
    fireEvent.click(screen.getByLabelText(/parcoords variable b/i));
    expect((screen.getByRole("button", { name: /^add$/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
