import { describe, expect, it } from "vitest";
import {
  runRelativeStrengthBacktest,
  type RelativeStrengthAssetInput,
} from "@/core/backtesting/research/relative-strength";
import type { Candle } from "@/core/market-data/types";

/** One synthetic daily candle per calendar month (day 28, safe for every month) — `buildMonthlyCloses` only keeps the last candle seen per month, so one is enough. */
function monthlyCandles(closes: readonly number[]): Candle[] {
  return closes.map((close, monthIndex) => ({
    market: "SP500",
    timeframe: "1d",
    symbol: "TEST",
    provider: "test",
    timestamp: new Date(Date.UTC(2024, monthIndex, 28, 20, 0, 0)).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
  }));
}

function asset(market: string, closes: readonly number[]): RelativeStrengthAssetInput {
  return { market, candles: monthlyCandles(closes) };
}

describe("runRelativeStrengthBacktest", () => {
  it("selects the asset with the best TRAILING return, never a future/hold-month return (no look-ahead)", () => {
    // Through month index 3 (the decision point), A has the only positive
    // trailing return; B, C, D are flat. B then spikes hugely, but ONLY in
    // the hold month (index 4) — a look-ahead bug that let the ranking see
    // the hold month would pick B instead of A.
    const assets = [
      asset("A", [100, 105, 110, 115, 200]),
      asset("B", [100, 100, 100, 100, 500]),
      asset("C", [100, 100, 100, 100, 100]),
      asset("D", [100, 100, 100, 100, 100]),
    ];

    const result = runRelativeStrengthBacktest(assets, { lookbackMonths: 3, benchmarkMarket: "C" });

    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].selectedMarket).toBe("A");
    expect(result.periods[0].periodReturnPct).toBeCloseTo(((200 - 115) / 115) * 100, 6);
  });

  it("computes the benchmark equity curve from the benchmark's own returns, independent of the rotation pick", () => {
    const assets = [
      asset("A", [100, 105, 110, 115, 200]),
      asset("B", [100, 100, 100, 100, 500]),
      asset("C", [100, 100, 100, 100, 130]),
      asset("D", [100, 100, 100, 100, 100]),
    ];

    const result = runRelativeStrengthBacktest(assets, { lookbackMonths: 3, benchmarkMarket: "C" });

    expect(result.benchmarkEquityCurve).toHaveLength(1);
    expect(result.benchmarkEquityCurve[0].equity).toBeCloseTo(1.3, 6);
  });

  it("computes the equal-weight curve as the mean of all assets' realized returns for the same period", () => {
    const assets = [
      asset("A", [100, 105, 110, 115, 200]),
      asset("B", [100, 100, 100, 100, 500]),
      asset("C", [100, 100, 100, 100, 100]),
      asset("D", [100, 100, 100, 100, 100]),
    ];

    const result = runRelativeStrengthBacktest(assets, { lookbackMonths: 3, benchmarkMarket: "C" });

    const returnsA = (200 - 115) / 115;
    const returnsB = (500 - 100) / 100;
    const expected = (returnsA + returnsB + 0 + 0) / 4;
    expect(result.equalWeightEquityCurve[0].equity).toBeCloseTo(1 + expected, 6);
  });

  it("records 0% (never fabricated) for a period where no asset has enough trailing history", () => {
    const assets = [asset("A", [100, 105, 110]), asset("B", [100, 100, 100])];
    // lookbackMonths=3 with only 3 total months means index (lookbackStartMonth) falls
    // outside the available series for the very first eligible decision point.
    const result = runRelativeStrengthBacktest(assets, { lookbackMonths: 3, benchmarkMarket: "A" });

    // Only 3 months of data and a 3-month lookback leaves no room for any
    // decision point (loop requires i in [lookbackMonths, length-2]).
    expect(result.periods).toHaveLength(0);
    expect(result.totalReturnPct).toBe(0);
  });

  it("computes max drawdown over the strategy equity curve, not the benchmark's", () => {
    // Month 1: strategy goes up (best asset A). Month 2: A subsequently
    // drops hard — the drawdown must show up even though it was still the
    // best-ranked asset going into that period.
    const assets = [asset("A", [100, 150, 75]), asset("B", [100, 100, 100])];
    const result = runRelativeStrengthBacktest(assets, { lookbackMonths: 1, benchmarkMarket: "B" });

    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].selectedMarket).toBe("A");
    // Equity path: 1 -> (150-100)/100 not realized in month0 (that's the
    // lookback baseline) -> realized period is decision=month1(150) to
    // hold=month2(75): return = (75-150)/150 = -0.5, equity 1 -> 0.5.
    expect(result.strategyEquityCurve[0].equity).toBeCloseTo(0.5, 6);
    expect(result.maxDrawdownPct).toBeCloseTo(50, 6);
  });

  it("charges the rebalance cost only when the selected asset actually changes", () => {
    // A stays selected across both periods (never below B/etc.) — no
    // switch on the second decision, so no cost should be charged then.
    const assets = [asset("A", [100, 110, 121, 133.1]), asset("B", [100, 100, 100, 100])];
    const withoutCost = runRelativeStrengthBacktest(assets, { lookbackMonths: 1, benchmarkMarket: "B" });
    const withCost = runRelativeStrengthBacktest(assets, { lookbackMonths: 1, benchmarkMarket: "B", rebalanceCostBps: 50 });

    // First period is always a "switch" (no prior position) — costs both runs' first period identically relative to each other.
    expect(withCost.periods[0].periodReturnPct).toBeCloseTo(withoutCost.periods[0].periodReturnPct - 0.5, 6);
    // Second period holds the SAME asset (A) again — no new rebalance cost.
    expect(withCost.periods[1].periodReturnPct).toBeCloseTo(withoutCost.periods[1].periodReturnPct, 6);
  });

  it("charges the rebalance cost again when the selection switches between periods", () => {
    // A wins the first decision (higher trailing return through month1),
    // then B overtakes for the second decision — a genuine switch.
    const assets = [asset("A", [100, 110, 100, 105]), asset("B", [100, 100, 130, 130])];
    const withoutCost = runRelativeStrengthBacktest(assets, { lookbackMonths: 1, benchmarkMarket: "A" });
    const withCost = runRelativeStrengthBacktest(assets, { lookbackMonths: 1, benchmarkMarket: "A", rebalanceCostBps: 50 });

    expect(withoutCost.periods[0].selectedMarket).toBe("A");
    expect(withoutCost.periods[1].selectedMarket).toBe("B");
    expect(withCost.periods[1].periodReturnPct).toBeCloseTo(withoutCost.periods[1].periodReturnPct - 0.5, 6);
  });

  it("computes CAGR and monthsTraded consistently with the number of realized periods", () => {
    const assets = [asset("A", [100, 110, 121, 133.1]), asset("B", [100, 100, 100, 100])];
    const result = runRelativeStrengthBacktest(assets, { lookbackMonths: 1, benchmarkMarket: "B" });

    expect(result.monthsTraded).toBe(result.periods.length);
    expect(result.monthsTraded).toBeGreaterThan(0);
    expect(result.totalReturnPct).toBeCloseTo((result.strategyEquityCurve.at(-1)!.equity - 1) * 100, 6);
  });

  describe("no-look-ahead (Block 6, Fase 2 dedicated audit test)", () => {
    /**
     * Direct structural proof, not just an indirect "picks the right
     * winner" check: every EARLY decision (month T) must produce an
     * IDENTICAL ranking/selection/period-return whether or not any months
     * AFTER T exist in the input series at all. If the engine ever let a
     * later month leak into an earlier ranking, truncating the series
     * would change an earlier period's result — it must not.
     */
    it("truncating all months after decision month T does not change period T's selection or return", () => {
      const fullAssets = [
        asset("A", [100, 105, 110, 115, 300, 50, 400]), // wild future swings after month 3
        asset("B", [100, 100, 100, 100, 5, 900, 1]),
        asset("C", [100, 102, 101, 103, 999, 999, 999]),
        asset("D", [100, 100, 100, 100, 100, 100, 100]),
      ];
      const fullResult = runRelativeStrengthBacktest(fullAssets, { lookbackMonths: 3, benchmarkMarket: "D" });

      // Truncate every asset to only the first 5 months (index 0-4) — this
      // removes months 5 and 6, which is exactly the data a look-ahead bug
      // would have (incorrectly) used to influence the FIRST decision
      // (index 3, hold month 4).
      const truncatedAssets = fullAssets.map((a) => ({ market: a.market, candles: a.candles.slice(0, 5) }));
      const truncatedResult = runRelativeStrengthBacktest(truncatedAssets, { lookbackMonths: 3, benchmarkMarket: "D" });

      expect(truncatedResult.periods).toHaveLength(1);
      expect(fullResult.periods[0]).toEqual(truncatedResult.periods[0]);
    });

    it("the trailing-return ranking at decision month T uses ONLY candles with a timestamp <= T's close, never a later one", () => {
      // A wins the trailing-return ranking through month index 3 (April).
      // B has an enormous spike strictly AFTER that decision month's close
      // (month index 4, May) — a look-ahead bug (peeking at month 4 while
      // ranking at month 3) would pick B; the correct engine must pick A,
      // and the decision month itself must be April, never May.
      // Append B's post-decision spike strictly after the decision month's close.
      const bCandlesWithFutureSpike = [
        ...asset("B", [100, 100, 100, 100]).candles,
        {
          market: "SP500" as const,
          timeframe: "1d" as const,
          symbol: "TEST",
          provider: "test",
          timestamp: new Date(Date.UTC(2024, 4, 28, 20, 0, 0)).toISOString(),
          open: 900,
          high: 900,
          low: 900,
          close: 900,
          volume: 1_000_000,
        },
      ];
      const assets = [asset("A", [100, 105, 110, 120]), { market: "B", candles: bCandlesWithFutureSpike }];

      const result = runRelativeStrengthBacktest(assets, { lookbackMonths: 3, benchmarkMarket: "A" });

      expect(result.periods).toHaveLength(1);
      expect(result.periods[0].decisionMonth).toBe("2024-04");
      expect(result.periods[0].selectedMarket).toBe("A");
    });
  });
});
