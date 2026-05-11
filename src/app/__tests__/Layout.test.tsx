import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Layout } from "@/app/Layout";

describe("Layout", () => {
  it("renders all five regions", () => {
    render(
      <Layout
        toolbar={<span>TB</span>}
        left={<span>LEFT</span>}
        main={<span>MAIN</span>}
        right={<span>RIGHT</span>}
        status={<span>STAT</span>}
      />,
    );
    expect(screen.getByText("TB")).toBeInTheDocument();
    expect(screen.getAllByLabelText("show variables panel")).toHaveLength(1);
    expect(screen.getByLabelText("tour and views")).toHaveTextContent("RIGHT");
    expect(screen.getByText("MAIN")).toBeInTheDocument();
    expect(screen.getByText("STAT")).toBeInTheDocument();
  });

  it("opens the variables panel on demand", () => {
    render(
      <Layout
        toolbar={<span>TB</span>}
        left={<span>LEFT</span>}
        main={<span>MAIN</span>}
        right={<span>RIGHT</span>}
        status={<span>STAT</span>}
      />,
    );
    fireEvent.click(screen.getAllByLabelText("show variables panel")[0]!);
    expect(screen.getByLabelText("variables")).toHaveTextContent("LEFT");
    fireEvent.click(screen.getByLabelText("hide variables panel"));
    expect(screen.queryByLabelText("variables")).not.toBeInTheDocument();
  });
});
