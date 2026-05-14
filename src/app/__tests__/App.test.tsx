import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App } from "@/app/App";
import { useAppStore } from "@/store";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().setSpec([]);
});

describe("App integration", () => {
  it("loads a CSV → schema preview → commit → variable panel populated → status updates", async () => {
    render(<App />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();

    const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
    const file = new File(["x,y\n1,2\n3,4\n5,6\n"], "tiny.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Load"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(useAppStore.getState().df?.nrow).toBe(3);
    fireEvent.click(screen.getAllByLabelText("show variables panel")[0]!);
    const varList = screen.getByTestId("variable-list");
    expect(within(varList).getByText("x")).toBeInTheDocument();
    expect(within(varList).getByText("y")).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 visible/i)).toBeInTheDocument();
    expect(screen.getByText(/Replace data/i)).toBeInTheDocument();
    expect(screen.getByLabelText("add plot")).toBeInTheDocument();
  });

  it("applies schema preview type overrides on load", async () => {
    render(<App />);
    const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
    const file = new File(["x,g\n1,a\n2,b\n"], "tiny.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("type for x"), { target: { value: "categorical" } });
    fireEvent.click(screen.getByText("Load"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(useAppStore.getState().df?.column("x")?.type).toBe("categorical");
    expect(useAppStore.getState().spec.find((v) => v.name === "x")?.type).toBe("categorical");
  });

  it("Replace data clears the store and shows the empty state again", async () => {
    render(<App />);
    const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["a,b\n1,2\n"], "t.csv", { type: "text/csv" })] },
    });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Load"));
    await waitFor(() => expect(screen.getByText(/Replace data/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Replace data/i));
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it("commits edges loaded from GGobi XML", async () => {
    render(<App />);
    const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
    const xml = `<?xml version="1.0"?><ggobidata><data name="d">
      <variables count="2"><realvariable name="x" /><realvariable name="y" /></variables>
      <records count="2"><record>1 2</record><record>3 4</record></records>
      </data><edges><edge source="1" target="2" /></edges></ggobidata>`;
    fireEvent.change(input, {
      target: { files: [new File([xml], "d.xml", { type: "text/xml" })] },
    });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Load"));
    await waitFor(() => expect(useAppStore.getState().df?.nrow).toBe(2));

    expect(Array.from(useAppStore.getState().edges.layer?.source ?? [])).toEqual([0]);
    expect(Array.from(useAppStore.getState().edges.layer?.target ?? [])).toEqual([1]);
  });

  it("right panel exposes tour controls when data is loaded", async () => {
    render(<App />);
    const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["a,b\n1,2\n3,4\n5,6\n"], "t.csv", { type: "text/csv" })] },
    });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Load"));
    await waitFor(() => expect(screen.getByLabelText(/start tour/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/tour shape/i)).toBeInTheDocument();
  });
});
