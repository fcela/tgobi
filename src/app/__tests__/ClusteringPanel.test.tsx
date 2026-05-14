import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { ClusteringPanel } from "@/app/ClusteringPanel";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().resetSelectionFor(0);
  useAppStore.getState().clearClustering();
});

describe("ClusteringPanel", () => {
  it("renders with no data", () => {
    render(<ClusteringPanel />);
    expect(screen.getByText("Clustering")).toBeInTheDocument();
    expect(screen.getByText("no numeric variables")).toBeInTheDocument();
  });

  it("shows numeric variables as checkboxes", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeNumericColumn("y", new Float64Array([4, 5, 6])),
      makeCategoricalColumn("cat", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    render(<ClusteringPanel />);
    expect(screen.getByLabelText(/include x in clustering/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/include y in clustering/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/include cat in clustering/i)).not.toBeInTheDocument();
  });

  it("disables Run with < 2 variables", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
    ]);
    useAppStore.getState().setData(df);
    render(<ClusteringPanel />);
    const btn = screen.getByRole("button", { name: /run clustering/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Run with 2+ variables", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([0, 0, 10, 10])),
      makeNumericColumn("y", new Float64Array([0, 0, 10, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(4);
    render(<ClusteringPanel />);
    fireEvent.click(screen.getByLabelText(/include x in clustering/i));
    fireEvent.click(screen.getByLabelText(/include y in clustering/i));
    const btn = screen.getByRole("button", { name: /run clustering/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("switches method to hierarchical and shows linkage", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2])),
      makeNumericColumn("y", new Float64Array([3, 4])),
    ]);
    useAppStore.getState().setData(df);
    render(<ClusteringPanel />);
    fireEvent.change(screen.getByLabelText(/clustering method/i), { target: { value: "hierarchical" } });
    expect(useAppStore.getState().clustering.method).toBe("hierarchical");
    expect(screen.getByLabelText(/linkage method/i)).toBeInTheDocument();
  });

  it("runs clustering and shows results summary", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([0, 0, 0, 10, 10, 10])),
      makeNumericColumn("y", new Float64Array([0, 0, 0, 10, 10, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(6);
    render(<ClusteringPanel />);
    fireEvent.click(screen.getByLabelText(/include x in clustering/i));
    fireEvent.click(screen.getByLabelText(/include y in clustering/i));
    fireEvent.click(screen.getByRole("button", { name: /run clustering/i }));

    expect(useAppStore.getState().clustering.results).not.toBeNull();
    expect(screen.getByText(/clusters/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /paint clusters/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear clustering/i })).toBeInTheDocument();
  });

  it("switches method to dbscan and shows eps/minPts", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2])),
      makeNumericColumn("y", new Float64Array([3, 4])),
    ]);
    useAppStore.getState().setData(df);
    render(<ClusteringPanel />);
    fireEvent.change(screen.getByLabelText(/clustering method/i), { target: { value: "dbscan" } });
    expect(useAppStore.getState().clustering.method).toBe("dbscan");
    expect(screen.getByLabelText(/eps/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/minPts/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/number of clusters/i)).not.toBeInTheDocument();
  });

  it("paints cluster assignments", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([0, 0, 10, 10])),
      makeNumericColumn("y", new Float64Array([0, 0, 10, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(4);
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    useAppStore.getState().setClusteringK(2);
    useAppStore.getState().runClustering();

    render(<ClusteringPanel />);
    fireEvent.click(screen.getByRole("button", { name: /paint clusters/i }));

    const paint = useAppStore.getState().selection.paint;
    const hasPainted = Array.from(paint).some((v) => v > 0);
    expect(hasPainted).toBe(true);
  });
});
