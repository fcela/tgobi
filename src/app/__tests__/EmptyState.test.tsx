import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EmptyState } from "@/app/EmptyState";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("EmptyState", () => {
  it("loads a CSV via file picker and calls onLoaded", async () => {
    const onLoaded = vi.fn();
    render(<EmptyState onLoaded={onLoaded} />);
    const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
    const file = new File(["a,b\n1,2\n"], "tiny.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onLoaded).toHaveBeenCalled());
    const df = onLoaded.mock.calls[0]![0].df;
    expect(df.nrow).toBe(1);
  });

  it("shows a friendly error on unsupported extension", async () => {
    render(<EmptyState onLoaded={() => {}} />);
    const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "weird.parquet")] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Unsupported/));
  });

  it("offers the large bundled sample", () => {
    render(<EmptyState onLoaded={() => {}} />);
    expect(screen.getByRole("button", { name: "large" })).toBeInTheDocument();
  });
});
