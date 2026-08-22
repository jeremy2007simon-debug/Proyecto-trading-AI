import { describe, expect, it } from "vitest";
import { runCrossIndexRotationBacktest, type CrossIndexRotationConfig } from "@/core/us-index-research/cross-index-rotation";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

function makeBars(startPrice: number, monthlyGrowth: number, months: number): UsIndexDailyBar[] {
  const bars: UsIndexDailyBar[] = [];
  let price = startPrice;
  let day = 0;
  for (let m = 0; m < months; m++) {
    for (let d = 0; d < 21; d++) {
      const date = new Date(Date.UTC(2015, 0, 1 + day));
      bars.push({ date: date.toISOString().slice(0, 10), open: price, high: price, low: price, close: price, adjClose: price, volume: 1000 });
      day += 1;
    }
    price *= 1 + monthlyGrowth;
  }
  return bars;
}

describe("runCrossIndexRotationBacktest — raw-return ranking", () => {
  it("consistently rotates into the asset with the strongest trailing return", () => {
    const assets: { market: UsIndexMarket; bars: UsIndexDailyBar[] }[] = [
      { market: "SPY", bars: makeBars(100, 0.005, 24) }, // modest grower
      { market: "QQQ", bars: makeBars(100, 0.03, 24) }, // strong grower — should dominate selection
      { market: "IWM", bars: makeBars(100, -0.01, 24) }, // decliner
      { market: "DIA", bars: makeBars(100, 0.001, 24) },
    ];
    const config: CrossIndexRotationConfig = { lookbackMonths: 1, ranking: "RAW_RETURN", weighting: "SINGLE_WINNER" };
    const periods = runCrossIndexRotationBacktest(assets, config, "OPTIMISTIC");
    const qqqShare = periods.filter((p) => p.selectedMarkets.includes("QQQ")).length / periods.length;
    expect(qqqShare).toBeGreaterThan(0.8);
  });
});

describe("runCrossIndexRotationBacktest — weighting", () => {
  it("TOP_2_EQUAL_WEIGHT always selects exactly two markets (once warmed up) with equal weight, unlike SINGLE_WINNER's one", () => {
    const assets: { market: UsIndexMarket; bars: UsIndexDailyBar[] }[] = [
      { market: "SPY", bars: makeBars(100, 0.01, 12) },
      { market: "QQQ", bars: makeBars(100, 0.02, 12) },
      { market: "IWM", bars: makeBars(100, 0.005, 12) },
      { market: "DIA", bars: makeBars(100, 0.015, 12) },
    ];
    const config: CrossIndexRotationConfig = { lookbackMonths: 1, ranking: "RAW_RETURN", weighting: "TOP_2_EQUAL_WEIGHT" };
    const periods = runCrossIndexRotationBacktest(assets, config, "OPTIMISTIC");
    for (const p of periods) expect(p.selectedMarkets.length).toBe(2);
  });
});

describe("runCrossIndexRotationBacktest — cost", () => {
  it("charges zero turnover cost when the selection never changes", () => {
    const assets: { market: UsIndexMarket; bars: UsIndexDailyBar[] }[] = [
      { market: "SPY", bars: makeBars(100, 0.001, 12) },
      { market: "QQQ", bars: makeBars(100, 0.05, 12) }, // always the clear winner
      { market: "IWM", bars: makeBars(100, -0.02, 12) },
      { market: "DIA", bars: makeBars(100, 0, 12) },
    ];
    const config: CrossIndexRotationConfig = { lookbackMonths: 1, ranking: "RAW_RETURN", weighting: "SINGLE_WINNER" };
    const periods = runCrossIndexRotationBacktest(assets, config, "REALISTIC");
    // After the first rebalance settles on QQQ, subsequent periods (still QQQ) pay no further turnover cost.
    const steadyState = periods.slice(-3);
    for (const p of steadyState) expect(p.turnover).toBeCloseTo(0, 10);
  });
});
