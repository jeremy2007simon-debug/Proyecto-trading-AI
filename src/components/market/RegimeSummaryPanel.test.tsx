import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RegimeSummaryPanel } from "@/components/market/RegimeSummaryPanel";
import { buildMarketOverviewFixture } from "@/components/market/fixtures";

describe("RegimeSummaryPanel", () => {
  it("renders the current regime, confidence, and sub-scores", () => {
    render(<RegimeSummaryPanel data={buildMarketOverviewFixture()} />);

    expect(screen.getByText("UPTREND")).toBeInTheDocument();
    expect(screen.getByText("72/100")).toBeInTheDocument();
    expect(screen.getByText("45/100")).toBeInTheDocument(); // trend score
    expect(screen.getByText("NORMAL")).toBeInTheDocument(); // volatilityScore=48
    expect(screen.getByText("POSITIVE")).toBeInTheDocument(); // momentumScore=22
  });

  it("lists every evaluated rule with its pass/fail state", () => {
    render(<RegimeSummaryPanel data={buildMarketOverviewFixture()} />);
    expect(screen.getByText("MODERATE_TREND_ADX")).toBeInTheDocument();
    expect(screen.getByText("TREND_DIRECTION_UP")).toBeInTheDocument();
  });

  it("shows a dash for duration when there is no persisted regime yet", () => {
    render(
      <RegimeSummaryPanel
        data={buildMarketOverviewFixture({ persistedRegime: undefined, regimeDurationMs: undefined })}
      />,
    );
    expect(screen.getByText("Duration").nextElementSibling).toHaveTextContent("—");
  });
});
