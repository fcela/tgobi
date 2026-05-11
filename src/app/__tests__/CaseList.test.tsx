import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CaseList } from "@/app/CaseList";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeCategoricalColumn, makeNumericColumn } from "@/lib/data/columns";
import { bitGet } from "@/lib/brush/hitTest";

beforeEach(() => {
  useAppStore.getState().clear();
  const df = new ArrayDataFrame([
    makeNumericColumn("x", new Float64Array([1, 2, 3])),
    makeCategoricalColumn("species", new Int32Array([0, 1, 0]), ["a", "b"]),
  ]);
  useAppStore.getState().setData(df);
});

describe("CaseList", () => {
  it("renders case rows and toggles selection from the list", () => {
    render(<CaseList />);
    fireEvent.click(screen.getByLabelText("case 2"));

    expect(bitGet(useAppStore.getState().selection.mask, 1)).toBe(true);
    expect(screen.getByLabelText("case 2").closest(".case-row")).toHaveClass("selected");
  });

  it("pins cases and clears pins", () => {
    render(<CaseList />);
    fireEvent.click(screen.getByLabelText("pin case 2"));
    expect(bitGet(useAppStore.getState().tools.pinnedRows, 1)).toBe(true);

    fireEvent.click(screen.getByText("Clear pins"));
    expect(bitGet(useAppStore.getState().tools.pinnedRows, 1)).toBe(false);
  });

  it("uses the configured label variable in rows and inspector", () => {
    render(<CaseList />);
    fireEvent.change(screen.getByLabelText("case label variable"), { target: { value: "species" } });
    fireEvent.mouseEnter(screen.getByLabelText("case 2").closest(".case-row")!);

    const inspector = screen.getByLabelText("case inspector");
    expect(within(inspector).getByText("b")).toBeInTheDocument();
    expect(screen.getByLabelText("case 2")).toHaveTextContent("b");
  });
});
