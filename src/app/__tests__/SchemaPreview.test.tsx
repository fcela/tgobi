import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemaPreview } from "@/app/SchemaPreview";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeIntegerColumn, makeCategoricalColumn } from "@/lib/data/columns";

function makeDf() {
  return new ArrayDataFrame([
    makeIntegerColumn("k", new Int32Array([1, 2, 3])),
    makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
  ]);
}

describe("SchemaPreview", () => {
  it("renders a row per column with the inferred type", () => {
    render(<SchemaPreview df={makeDf()} onCancel={() => {}} onCommit={() => {}} />);
    expect(screen.getByText("k")).toBeInTheDocument();
    expect((screen.getByLabelText("type for k") as HTMLSelectElement).value).toBe("integer");
    expect((screen.getByLabelText("type for g") as HTMLSelectElement).value).toBe("categorical");
  });

  it("commits with overrides only for changed columns", () => {
    const onCommit = vi.fn();
    render(<SchemaPreview df={makeDf()} onCancel={() => {}} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText("type for k"), { target: { value: "numeric" } });
    fireEvent.click(screen.getByText("Load"));
    expect(onCommit).toHaveBeenCalledWith({ k: "numeric" });
  });

  it("calls onCancel from the Cancel button", () => {
    const onCancel = vi.fn();
    render(<SchemaPreview df={makeDf()} onCancel={onCancel} onCommit={() => {}} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});
