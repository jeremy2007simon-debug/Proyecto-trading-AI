import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketOverviewPanel } from "@/components/market/MarketOverviewPanel";
import { buildMarketOverviewFixture } from "@/components/market/fixtures";

describe("MarketOverviewPanel", () => {
  it("renders the instrument, price, and key indicator values from real data", () => {
    render(<MarketOverviewPanel data={buildMarketOverviewFixture()} />);

    expect(screen.getByText("SP500")).toBeInTheDocument();
    expect(screen.getByText("542.18")).toBeInTheDocument();
    expect(screen.getByText("REGULAR")).toBeInTheDocument();
    expect(screen.getByText("alpaca")).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();
    expect(screen.getByText("UPTREND")).toBeInTheDocument();
    expect(screen.getByText("539.80")).toBeInTheDocument(); // EMA 20
    expect(screen.getByText("27.4")).toBeInTheDocument(); // ADX
  });

  it("renders a dash instead of a fabricated value when an indicator is missing", () => {
    const data = buildMarketOverviewFixture({
      indicators: { ...buildMarketOverviewFixture().indicators, ema200: undefined },
    });
    render(<MarketOverviewPanel data={data} />);

    const emaTiles = screen.getAllByText("—");
    expect(emaTiles.length).toBeGreaterThan(0);
  });
});
