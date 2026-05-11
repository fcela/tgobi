import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/store";
import { SavedViews } from "@/app/SavedViews";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().stopTour();
});

describe("SavedViews", () => {
  it("shows empty state", () => {
    render(<SavedViews />);
    expect(screen.getByText(/no saved views/i)).toBeInTheDocument();
  });

  it("lists views, restores, and removes", () => {
    useAppStore.getState().startTour(1, "2d", ["a", "b"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array(0), 0,
    );
    useAppStore.getState().saveCurrentView("origin");
    render(<SavedViews />);
    expect(screen.getByText("origin")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("remove origin"));
    expect(useAppStore.getState().tour.savedViews).toHaveLength(0);
  });
});
