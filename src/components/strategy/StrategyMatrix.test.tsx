import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StrategyMatrix } from "@/components/strategy/StrategyMatrix";
import { mockStrategyMatrixRows } from "@/lib/mock/strategy-matrix.mock";

describe("StrategyMatrix", () => {
  it("renders one row per strategy with its name and signal", () => {
    render(<StrategyMatrix rows={mockStrategyMatrixRows} />);

    for (const row of mockStrategyMatrixRows) {
      expect(screen.getByText(row.strategyName)).toBeInTheDocument();
    }

    expect(screen.getAllByText("BUY").length).toBeGreaterThan(0);
  });

  it("flags a strategy as not compatible when compatibleWithCurrentRegime is false", () => {
    render(<StrategyMatrix rows={mockStrategyMatrixRows} />);

    const incompatible = mockStrategyMatrixRows.find(
      (row) => !row.compatibleWithCurrentRegime,
    );
    expect(incompatible).toBeDefined();
    expect(
      screen.getByText(`Not compatible (${incompatible!.currentRegime})`),
    ).toBeInTheDocument();
  });

  it("renders zero rows without throwing when given an empty list", () => {
    render(<StrategyMatrix rows={[]} />);
    expect(screen.getByText("Strategy Matrix")).toBeInTheDocument();
  });
});
