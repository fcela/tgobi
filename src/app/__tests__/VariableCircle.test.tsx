import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAppStore } from "@/store";
import { VariableCircle } from "@/app/VariableCircle";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().stopTour();
});

describe("VariableCircle", () => {
  it("shows empty hint with no tour", () => {
    render(<VariableCircle />);
    expect(screen.getByText(/no tour/i)).toBeInTheDocument();
  });

  it("renders one line per active var when basis is set", () => {
    useAppStore.getState().startTour(1, "2d", ["a", "b", "c"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1, 0.5, 0.5]),
      new Float64Array(0),
      0,
    );
    const { container } = render(<VariableCircle />);
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument();
  });
});
