import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";
import { Parcoords } from "@/plots/parcoords/Parcoords";

// ResizeObserver stub (not available in jsdom)
(global as unknown as Record<string, unknown>).ResizeObserver =
  class {
    #cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.#cb = cb;
    }
    observe(target: Element) {
      this.#cb(
        [
          {
            target,
            contentRect: { width: 320, height: 220 } as DOMRectReadOnly,
            contentBoxSize: [{ inlineSize: 320, blockSize: 220 }] as ResizeObserverSize[],
            borderBoxSize: [{ inlineSize: 320, blockSize: 220 }] as ResizeObserverSize[],
            devicePixelContentBoxSize: [{ inlineSize: 320, blockSize: 220 }] as ResizeObserverSize[],
          } as unknown as ResizeObserverEntry,
        ],
        this as ResizeObserver,
      );
    }
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

describe("Parcoords", () => {
  it("renders a card with the panel's variable names in the header", () => {
    render(
      <Parcoords panel={{ id: 1, kind: "parcoords", variables: ["a", "b", "c"], condVar: null }} />,
    );
    expect(screen.getByText(/parcoords/i)).toBeInTheDocument();
    expect(screen.getByText(/a.*b.*c/)).toBeInTheDocument();
  });

  it("calls removePanel when the close button is clicked", () => {
    useAppStore.getState().addParcoords(["a", "b"]);
    const panels = useAppStore.getState().plots.panels;
    const panel = panels[0]!;
    render(<Parcoords panel={{ id: panel.id, kind: "parcoords", variables: ["a", "b"], condVar: null }} />);
    const closeBtn = screen.getByLabelText(/remove plot/i);
    closeBtn.click();
    expect(useAppStore.getState().plots.panels.find((p) => p.id === panel.id)).toBeUndefined();
  });

  it("renders without throwing when the canvas context is unavailable (jsdom)", () => {
    // jsdom's canvas.getContext("2d") returns null — the component must handle this gracefully
    expect(() => {
      render(
        <Parcoords panel={{ id: 99, kind: "parcoords", variables: ["a", "b"], condVar: null }} />,
      );
    }).not.toThrow();
    // header should still be present
    expect(screen.getByText(/parcoords/i)).toBeInTheDocument();
  });

  it("renders labels for pinned identify rows", async () => {
    useAppStore.getState().togglePinnedIdentify(1);

    render(
      <Parcoords panel={{ id: 11, kind: "parcoords", variables: ["a", "b", "c"], condVar: null }} />,
    );

    expect(await screen.findByTestId("pinned-parcoords-label-1")).toHaveTextContent("row 2");
  });

  it("persistent brushing paints rows when mouseup happens outside the canvas", () => {
    useAppStore.getState().setBrushMode("persistent");
    useAppStore.getState().setPaintColor(4);
    useAppStore.getState().setPaintShape(2);
    const { container } = render(
      <Parcoords panel={{ id: 7, kind: "parcoords", variables: ["a", "b"], condVar: null }} />,
    );
    const canvas = container.querySelector("canvas");
    if (!canvas) throw new Error("canvas not found");

    fireEvent.mouseDown(canvas, { clientX: 28, clientY: 40 });
    fireEvent.mouseMove(canvas, { clientX: 28, clientY: 160 });
    fireEvent.mouseLeave(canvas);
    fireEvent.mouseUp(window);

    expect(Array.from(useAppStore.getState().selection.paint)).toContain(4);
    expect(Array.from(useAppStore.getState().selection.shape)).toContain(2);
  });
});
