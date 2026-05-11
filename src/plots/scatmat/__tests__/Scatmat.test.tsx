import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";
import { Scatmat } from "@/plots/scatmat/Scatmat";

// ResizeObserver stub (not available in jsdom)
(global as unknown as Record<string, unknown>).ResizeObserver =
  (global as unknown as Record<string, unknown>).ResizeObserver ??
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

// Synchronous requestAnimationFrame so effects fire immediately
vi.stubGlobal(
  "requestAnimationFrame",
  (cb: FrameRequestCallback) => { cb(0); return 0; },
);

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().clearPanels();
  useAppStore.getState().resetSelectionFor(0);

  const df = new ArrayDataFrame([
    makeNumericColumn("a", new Float64Array([1, 2, 3, 4])),
    makeNumericColumn("b", new Float64Array([4, 3, 2, 1])),
    makeNumericColumn("c", new Float64Array([1, 3, 2, 4])),
  ]);
  useAppStore.getState().setData(df);
});

describe("Scatmat", () => {
  it("renders a card with the panel's variable names in the header", () => {
    render(
      <Scatmat panel={{ id: 1, kind: "scatmat", variables: ["a", "b", "c"] }} />,
    );
    expect(screen.getByText(/scatmat/i)).toBeInTheDocument();
    expect(screen.getByText(/a.*b.*c/)).toBeInTheDocument();
  });

  it("calls removePanel when the close button is clicked", () => {
    useAppStore.getState().addScatmat(["a", "b"]);
    const panels = useAppStore.getState().plots.panels;
    const panel = panels[0]!;
    render(<Scatmat panel={{ id: panel.id, kind: "scatmat", variables: ["a", "b"] }} />);
    const closeBtn = screen.getByLabelText(/remove plot/i);
    closeBtn.click();
    expect(useAppStore.getState().plots.panels.find((p) => p.id === panel.id)).toBeUndefined();
  });

  it("renders a point alpha slider", () => {
    render(<Scatmat panel={{ id: 1, kind: "scatmat", variables: ["a", "b"] }} />);
    const slider = screen.getByLabelText(/scatmat alpha/i) as HTMLInputElement;
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(slider.value).toBe("1");
    fireEvent.change(slider, { target: { value: "0.42" } });
    expect(slider.value).toBe("0.42");
  });

  it("renders without throwing when the canvas context is unavailable (jsdom)", () => {
    // jsdom's canvas.getContext("2d") returns null — the component must handle this gracefully
    expect(() => {
      render(
        <Scatmat panel={{ id: 99, kind: "scatmat", variables: ["a", "b"] }} />,
      );
    }).not.toThrow();
    // header should still be present
    expect(screen.getByText(/scatmat/i)).toBeInTheDocument();
  });
});
