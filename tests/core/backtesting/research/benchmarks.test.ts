import { describe, expect, it } from "vitest";
import { computeBuyAndHoldMonthlyReturns, computeEqualWeightBuyAndHoldMonthlyReturns } from "@/core/backtesting/research/benchmarks";
import type { Candle } from "@/core/market-data/types";

function candle(iso: string, close: number): Candle {
  return {
    market: "SP500",
    timeframe: "1d",
    timestamp: iso,
    symbol: "TEST",
    provider: "test",
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  };
}

describe("computeBuyAndHoldMonthlyReturns", () => {
  it("computes month-over-month return transitions from monthly closes", () => {
    const asset = {
      market: "SP500",
      candles: [candle("2024-01-31T00:00:00.000Z", 100), candle("2024-02-29T00:00:00.000Z", 110), candle("2024-03-29T00:00:00.000Z", 99)],
    };
    const returns = computeBuyAndHoldMonthlyReturns(asset, ["2024-01", "2024-02", "2024-03"]);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(10, 6); // 100 -> 110
    expect(returns[1]).toBeCloseTo(-10, 6); // 110 -> 99
  });

  it("is 0 (never fabricated) for a transition with a missing month close", () => {
    const asset = {
      market: "SP500",
      candles: [candle("2024-01-31T00:00:00.000Z", 100), candle("2024-03-29T00:00:00.000Z", 120)],
    };
    const returns = computeBuyAndHoldMonthlyReturns(asset, ["2024-01", "2024-02", "2024-03"]);
    expect(returns).toEqual([0, 0]);
  });

  it("returns an empty array for a single-month list (no transitions)", () => {
    const asset = { market: "SP500", candles: [candle("2024-01-31T00:00:00.000Z", 100)] };
    expect(computeBuyAndHoldMonthlyReturns(asset, ["2024-01"])).toEqual([]);
  });
});

describe("computeEqualWeightBuyAndHoldMonthlyReturns", () => {
  it("blends fixed initial shares (buy-once, never rebalanced) across assets", () => {
    const assets = [
      {
        market: "SP500",
        candles: [candle("2024-01-31T00:00:00.000Z", 100), candle("2024-02-29T00:00:00.000Z", 200)], // +100%
      },
      {
        market: "NASDAQ100",
        candles: [candle("2024-01-31T00:00:00.000Z", 100), candle("2024-02-29T00:00:00.000Z", 100)], // 0%
      },
    ];
    const returns = computeEqualWeightBuyAndHoldMonthlyReturns(assets, ["2024-01", "2024-02"]);
    // 0.5 in an asset that doubles + 0.5 in an asset that's flat -> portfolio +50%
    expect(returns).toHaveLength(1);
    expect(returns[0]).toBeCloseTo(50, 6);
  });

  it("diverges from a monthly-rebalanced equal-weight result when asset returns differ across periods", () => {
    // Asset A: +100% then -50% (round-trips back to 100 if rebalanced, but NOT if buy-and-hold since weights drifted)
    // Asset B: flat both months.
    const assets = [
      {
        market: "SP500",
        candles: [
          candle("2024-01-31T00:00:00.000Z", 100),
          candle("2024-02-29T00:00:00.000Z", 200),
          candle("2024-03-29T00:00:00.000Z", 100),
        ],
      },
      {
        market: "NASDAQ100",
        candles: [
          candle("2024-01-31T00:00:00.000Z", 100),
          candle("2024-02-29T00:00:00.000Z", 100),
          candle("2024-03-29T00:00:00.000Z", 100),
        ],
      },
    ];
    const months = ["2024-01", "2024-02", "2024-03"];
    const returns = computeEqualWeightBuyAndHoldMonthlyReturns(assets, months);
    // Month 1: 0.5*100 + 0.5*100 = 100 -> 0.5*200 + 0.5*100 = 150 (+50%)
    // Month 2: shares fixed from t0 (0.5/100 of A, 0.5/100 of B) -> value = 0.5/100*100 + 0.5/100*100 = 1.0 (per unit) ->
    // portfolio value at m2 = (0.5/100)*100 + (0.5/100)*100 = 1.0, at m1 was (0.5/100)*200+(0.5/100)*100=1.5 -> return = (1.0-1.5)/1.5 = -33.33%
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(50, 6);
    expect(returns[1]).toBeCloseTo(-33.333333, 4);
    // A monthly-REBALANCED equal weight would instead be flat overall (avg(+100%,0%)=+50%, avg(-50%,0%)=-25%, compounding to +12.5%) — different numbers, confirming buy-and-hold weight drift is genuinely captured here.
  });

  it("is an empty array for zero assets", () => {
    expect(computeEqualWeightBuyAndHoldMonthlyReturns([], ["2024-01", "2024-02"])).toEqual([]);
  });

  it("is an empty array for zero months", () => {
    const assets = [{ market: "SP500", candles: [candle("2024-01-31T00:00:00.000Z", 100)] }];
    expect(computeEqualWeightBuyAndHoldMonthlyReturns(assets, [])).toEqual([]);
  });
});
