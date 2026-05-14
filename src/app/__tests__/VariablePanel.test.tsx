import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { VariablePanel } from "@/app/VariablePanel";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeCategoricalColumn, makeNumericColumn } from "@/lib/data/columns";

beforeEach(() => {
  useAppStore.getState().clear();
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
    const list = within(screen.getByTestId("variable-list"));
    expect(list.getByText("tars1")).toBeInTheDocument();
    expect(list.getByText("species")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("exclude species"));
    expect(useAppStore.getState().spec.find((v) => v.name === "species")?.included).toBe(false);
  });

  it("creates derived transform variables from numeric columns", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 4])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "x", type: "numeric", included: true }]);

    render(<VariablePanel />);

    await waitFor(() => {
      expect((screen.getByLabelText("derived column name") as HTMLInputElement).value).toBe("log_x");
    });
    fireEvent.click(screen.getByLabelText("add derived variable"));

    expect(within(screen.getByTestId("variable-list")).getByText("log_x")).toBeInTheDocument();
    expect(useAppStore.getState().df?.column("log_x")?.type).toBe("numeric");
  });

  it("creates power transform variables with an exponent", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([2, 3])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "x", type: "numeric", included: true }]);

    render(<VariablePanel />);

    fireEvent.change(screen.getByLabelText("transform kind"), { target: { value: "power" } });
    await waitFor(() => {
      expect((screen.getByLabelText("derived column name") as HTMLInputElement).value).toBe("pow2_x");
    });
    fireEvent.change(screen.getByLabelText("power exponent"), { target: { value: "3" } });
    await waitFor(() => {
      expect((screen.getByLabelText("derived column name") as HTMLInputElement).value).toBe("pow3_x");
    });
    fireEvent.click(screen.getByLabelText("add derived variable"));

    const col = useAppStore.getState().df?.column("pow3_x");
    expect(col?.type).toBe("numeric");
    if (col?.type === "numeric") expect(Array.from(col.values)).toEqual([8, 27]);
  });

  it("creates jitter transform variables from categorical columns", async () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "g", type: "categorical", included: true }]);

    render(<VariablePanel />);

    fireEvent.change(screen.getByLabelText("transform kind"), { target: { value: "jitter" } });
    await waitFor(() => {
      expect((screen.getByLabelText("transform source") as HTMLSelectElement).value).toBe("g");
      expect((screen.getByLabelText("derived column name") as HTMLInputElement).value).toBe("jitter_g");
    });
    fireEvent.change(screen.getByLabelText("jitter amplitude"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("jitter seed"), { target: { value: "9" } });
    fireEvent.click(screen.getByLabelText("add derived variable"));

    const col = useAppStore.getState().df?.column("jitter_g");
    expect(col?.type).toBe("numeric");
    if (col?.type === "numeric") expect(Array.from(col.values)).toEqual([0, 1, 0]);
  });

  it("creates sphered variables from selected numeric columns", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 5])),
      makeNumericColumn("y", new Float64Array([1, 4, 2, 7])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([
      { name: "x", type: "numeric", included: true },
      { name: "y", type: "numeric", included: true },
    ]);

    render(<VariablePanel />);

    await waitFor(() => {
      expect(screen.getByLabelText("sphere variable x")).toBeChecked();
      expect(screen.getByLabelText("sphere variable y")).toBeChecked();
    });
    fireEvent.click(screen.getByLabelText("add sphered variables"));

    const list = within(screen.getByTestId("variable-list"));
    expect(list.getByText("sphere_x")).toBeInTheDocument();
    expect(list.getByText("sphere_y")).toBeInTheDocument();
    expect(useAppStore.getState().df?.column("sphere_x")?.type).toBe("numeric");
    expect(useAppStore.getState().df?.column("sphere_y")?.type).toBe("numeric");
  });
});
