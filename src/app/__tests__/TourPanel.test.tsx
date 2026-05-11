import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeCategoricalColumn, makeNumericColumn } from "@/lib/data/columns";
import { TourPanel } from "@/app/TourPanel";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().stopTour();
  useAppStore.getState().setTourSpeed(1200);
});

describe("TourPanel", () => {
  it("disabled with no compatible panel", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
    ]);
    useAppStore.getState().setData(df);
    render(<TourPanel />);
    const btn = screen.getByRole("button", { name: /start tour/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("starts a tour against the first compatible panel", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().addScatter("a", "b");
    render(<TourPanel />);
    fireEvent.click(screen.getByRole("button", { name: /start tour/i }));
    const t = useAppStore.getState().tour;
    expect(t.activePanelId).not.toBeNull();
    expect(t.shape).toBe("2d");
    expect(t.isPlaying).toBe(true);
  });

  it("switches to projection pursuit controls", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
      makeCategoricalColumn("species", new Int32Array([0, 1, 0]), ["setosa", "versicolor"]),
    ]);
    useAppStore.getState().setData(df);
    render(<TourPanel />);

    fireEvent.change(screen.getByLabelText(/tour mode/i), { target: { value: "pp" } });
    expect(useAppStore.getState().tour.mode).toBe("pp");
    expect(screen.getByLabelText(/projection pursuit goal/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/projection pursuit goal/i), { target: { value: "lda" } });
    expect(useAppStore.getState().tour.ppIndex).toBe("lda");
    expect(screen.getByLabelText(/LDA class variable/i)).toBeInTheDocument();
    expect(useAppStore.getState().tour.ppClassVar).toBe("species");
  });

  it("enables LDA from a color-categorical variable", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
      makeNumericColumn("group", new Float64Array([0, 1, 0])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setColorEncoding({ kind: "byVar", var: "group", scale: "categorical" });
    render(<TourPanel />);

    fireEvent.change(screen.getByLabelText(/tour mode/i), { target: { value: "pp" } });
    fireEvent.change(screen.getByLabelText(/projection pursuit goal/i), { target: { value: "lda" } });

    expect(useAppStore.getState().tour.ppIndex).toBe("lda");
    expect(screen.getByLabelText(/LDA class variable/i)).toHaveValue("group");
  });

  it("pause and stop work", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().addScatter("a", "b");
    useAppStore.getState().startTour(1, "2d", ["a", "b"]);
    render(<TourPanel />);
    fireEvent.click(screen.getByRole("button", { name: /pause tour/i }));
    expect(useAppStore.getState().tour.isPlaying).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /stop tour/i }));
    expect(useAppStore.getState().tour.activePanelId).toBeNull();
  });

  it("maps the speed slider left-to-right as slow-to-fast", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
    ]);
    useAppStore.getState().setData(df);
    render(<TourPanel />);
    const slider = screen.getByLabelText(/tour speed/i);

    fireEvent.change(slider, { target: { value: "2400" } });
    expect(useAppStore.getState().tour.speed).toBe(300);

    fireEvent.change(slider, { target: { value: "300" } });
    expect(useAppStore.getState().tour.speed).toBe(2400);
  });

  it("shows phase controls for active tour variables and freezes one on click", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().startTour(1, "2d", ["a", "b"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([0.1, 0.2, 0.3, 0.4]),
      0,
    );
    render(<TourPanel />);

    fireEvent.click(screen.getByLabelText("freeze a"));
    expect(useAppStore.getState().tour.frozenVars).toEqual(["a"]);
    expect(screen.getByLabelText("release a")).toBeInTheDocument();
  });
});
