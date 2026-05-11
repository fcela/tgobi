import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";
import { useTourWorker } from "@/lib/tour/useTourWorker";

const { postMessage, terminate } = vi.hoisted(() => {
  const postMessage = vi.fn();
  const terminate = vi.fn();
  return { postMessage, terminate };
});

vi.mock("@/workers/tour.worker.ts?worker", () => {
  class FakeWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    postMessage = postMessage;
    terminate = terminate;
  }
  return { default: FakeWorker };
});

function Mount() {
  useTourWorker();
  return null;
}

beforeEach(() => {
  postMessage.mockClear();
  terminate.mockClear();
  useAppStore.getState().clear();
  useAppStore.getState().stopTour();
});

describe("useTourWorker", () => {
  it("does nothing when no active tour", () => {
    render(<Mount />);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("posts init + play on startTour", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().startTour(1, "2d", ["a", "b"]);
    render(<Mount />);
    expect(postMessage.mock.calls.some((c) => (c[0] as { kind?: string }).kind === "init")).toBe(true);
  });
});
