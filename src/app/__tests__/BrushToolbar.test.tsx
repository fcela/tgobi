import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/store";
import { BrushToolbar } from "@/app/BrushToolbar";

beforeEach(() => {
  useAppStore.getState().setBrushMode("transient");
  useAppStore.getState().setBrushTool("rectangle");
  useAppStore.getState().setPaintColor(1);
  useAppStore.getState().setPaintShape(1);
});

describe("BrushToolbar", () => {
  it("renders persistent checkbox plus always-on color and shape controls", () => {
    render(<BrushToolbar />);
    expect(screen.getByRole("group", { name: /brush geometry/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /persistent/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /paint colors/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /paint shapes/i })).toBeInTheDocument();
  });

  it("checking Persistent updates the store", () => {
    render(<BrushToolbar />);
    fireEvent.click(screen.getByRole("checkbox", { name: /persistent/i }));
    expect(useAppStore.getState().brush.mode).toBe("persistent");
  });

  it("clicking a brush geometry updates the store", () => {
    render(<BrushToolbar />);
    fireEvent.click(screen.getByLabelText(/freeform brush/i));
    expect(useAppStore.getState().brush.tool).toBe("lasso");
  });

  it("clicking a swatch updates paintColor", () => {
    render(<BrushToolbar />);
    fireEvent.click(screen.getByLabelText(/paint color 3/i));
    expect(useAppStore.getState().brush.paintColor).toBe(3);
  });

  it("orders brush colors with yellow first and blue last", () => {
    render(<BrushToolbar />);
    const first = screen.getByLabelText("paint color 1");
    const last = screen.getByLabelText("paint color 6");

    expect(first).toHaveStyle({ background: "#edc948" });
    expect(last).toHaveStyle({ background: "#4e79a7" });

    fireEvent.click(first);
    expect(useAppStore.getState().brush.paintColor).toBe(6);
    fireEvent.click(last);
    expect(useAppStore.getState().brush.paintColor).toBe(1);
  });

  it("erase button sets paintColor to 0", () => {
    render(<BrushToolbar />);
    const erase = screen.getByLabelText(/erase paint/i);
    fireEvent.click(erase);
    expect(useAppStore.getState().brush.paintColor).toBe(0);
  });

  it("clicking a shape updates paintShape", () => {
    render(<BrushToolbar />);
    fireEvent.click(screen.getByLabelText(/paint shape diamond/i));
    expect(useAppStore.getState().brush.paintShape).toBe(4);
  });
});
