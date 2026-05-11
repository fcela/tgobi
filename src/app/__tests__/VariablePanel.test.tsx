import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariablePanel } from "@/app/VariablePanel";
import { useAppStore } from "@/store";

beforeEach(() => {
  useAppStore.getState().setSpec([]);
});

describe("VariablePanel", () => {
  it("shows empty state when no variables", () => {
    render(<VariablePanel />);
    expect(screen.getByText(/no variables loaded/i)).toBeInTheDocument();
  });

  it("lists variables and toggles inclusion", () => {
    useAppStore.getState().setSpec([
      { name: "tars1", type: "numeric", included: true },
      { name: "species", type: "categorical", included: true },
    ]);
    render(<VariablePanel />);
    expect(screen.getByText("tars1")).toBeInTheDocument();
    expect(screen.getByText("species")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("exclude species"));
    expect(useAppStore.getState().spec.find((v) => v.name === "species")?.included).toBe(false);
  });
});
