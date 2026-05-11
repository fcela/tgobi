import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EdgesToolbar } from "@/app/EdgesToolbar";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";

beforeEach(() => {
  useAppStore.getState().clear();
});

describe("EdgesToolbar", () => {
  it("connects rows in order and exposes line controls", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);

    render(<EdgesToolbar />);
    fireEvent.click(screen.getByRole("button", { name: /connect rows/i }));

    expect(useAppStore.getState().edges.layer?.source.length).toBe(2);
    expect(screen.getByRole("checkbox", { name: /show lines/i })).toBeChecked();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("updates visibility and alpha", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().connectRowsInOrder();

    render(<EdgesToolbar />);
    fireEvent.click(screen.getByRole("checkbox", { name: /show lines/i }));
    expect(useAppStore.getState().edges.visible).toBe(false);

    fireEvent.change(screen.getByLabelText(/line alpha/i), { target: { value: "0.5" } });
    expect(useAppStore.getState().edges.alpha).toBe(0.5);
  });

  it("updates node-edge linking options", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().connectRowsInOrder();

    render(<EdgesToolbar />);
    fireEvent.click(screen.getByRole("checkbox", { name: /link nodes to edges/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /link edges to nodes/i }));
    expect(useAppStore.getState().edges.linkNodesToEdges).toBe(false);
    expect(useAppStore.getState().edges.linkEdgesToNodes).toBe(false);
  });

  it("updates line edit mode", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().connectRowsInOrder();

    render(<EdgesToolbar />);
    fireEvent.change(screen.getByLabelText(/line edit mode/i), { target: { value: "add" } });
    expect(useAppStore.getState().edges.editMode).toBe("add");
    fireEvent.change(screen.getByLabelText(/line edit mode/i), { target: { value: "delete" } });
    expect(useAppStore.getState().edges.editMode).toBe("delete");
  });

  it("loads standalone edge CSV files", async () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);

    render(<EdgesToolbar />);
    const input = screen.getByLabelText("Load") as HTMLInputElement;
    const file = new File(["source,target\n1,2\n2,3\n"], "edges.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("2");
    expect(Array.from(useAppStore.getState().edges.layer?.source ?? [])).toEqual([0, 1]);
    expect(Array.from(useAppStore.getState().edges.layer?.target ?? [])).toEqual([1, 2]);
  });

  it("reports invalid standalone edge files", async () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2]))]);
    useAppStore.getState().setData(df);

    render(<EdgesToolbar />);
    const input = screen.getByLabelText("Load") as HTMLInputElement;
    const file = new File(["source,target\n1,3\n"], "edges.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/out of range/i);
  });
});
