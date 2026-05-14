import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";
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

  it("LDA is disabled without painted groups, enabled with paint", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3, 4])),
      makeNumericColumn("b", new Float64Array([4, 5, 6, 7])),
    ]);
    useAppStore.getState().setData(df);
    render(<TourPanel />);

    fireEvent.change(screen.getByLabelText(/tour mode/i), { target: { value: "pp" } });
    expect(useAppStore.getState().tour.mode).toBe("pp");
    expect(screen.getByLabelText(/projection pursuit goal/i)).toBeInTheDocument();

    const goalSelect = screen.getByLabelText(/projection pursuit goal/i) as HTMLSelectElement;
    const ldaOption = goalSelect.querySelector('option[value="lda"]') as HTMLOptionElement;
    expect(ldaOption.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/projection pursuit goal/i), { target: { value: "lda" } });
    expect(screen.getByText(/brush to paint/i)).toBeInTheDocument();

    act(() => {
      useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    });
    expect(screen.getByText(/using painted groups/i)).toBeInTheDocument();
  });

  it("LDA start is disabled without painted groups", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3, 4])),
      makeNumericColumn("b", new Float64Array([4, 5, 6, 7])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().addScatter("a", "b");
    useAppStore.getState().setTourMode("pp");
    useAppStore.getState().setTourPpIndex("lda");
    render(<TourPanel />);
    const btn = screen.getByRole("button", { name: /start tour/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    act(() => {
      useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    });
    expect((screen.getByRole("button", { name: /start tour/i }) as HTMLButtonElement).disabled).toBe(false);
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
