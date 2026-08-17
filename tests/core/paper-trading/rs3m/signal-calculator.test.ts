import { describe, expect, it } from "vitest";
import { computeCurrentRs3mSignal } from "@/core/paper-trading/rs3m/signal-calculator";
import type { RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";
import type { Candle } from "@/core/market-data/types";

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

describe("computeCurrentRs3mSignal", () => {
  it("selects the asset with the best trailing return through the LATEST available month", () => {
    const assets = [asset("A", [100, 105, 110, 130]), asset("B", [100, 100, 100, 100]), asset("C", [100, 100, 100, 100]), asset("D", [100, 100, 100, 100])];
    const signal = computeCurrentRs3mSignal(assets, 3);

    expect(signal).toBeDefined();
    expect(signal!.decisionMonth).toBe("2024-04"); // month index 3 = April
    expect(signal!.selectedMarket).toBe("A");
    expect(signal!.ranking[0].market).toBe("A");
  });

  it("returns undefined when there isn't enough history for the lookback yet", () => {
    const assets = [asset("A", [100, 105]), asset("B", [100, 100])];
    const signal = computeCurrentRs3mSignal(assets, 3);
    expect(signal).toBeUndefined();
  });

  it("dataCutoffTimestamp is the latest real candle timestamp within the decision month", () => {
    const assets = [asset("A", [100, 105, 110, 130]), asset("B", [100, 100, 100, 100]), asset("C", [100, 100, 100, 100]), asset("D", [100, 100, 100, 100])];
    const signal = computeCurrentRs3mSignal(assets, 3);
    expect(signal!.dataCutoffTimestamp).toBe(new Date(Date.UTC(2024, 3, 28, 20, 0, 0)).toISOString());
  });

  it("ranks the full universe (not just the winner), best first", () => {
    const assets = [asset("A", [100, 100, 100, 105]), asset("B", [100, 100, 100, 130]), asset("C", [100, 100, 100, 90]), asset("D", [100, 100, 100, 100])];
    const signal = computeCurrentRs3mSignal(assets, 3);
    expect(signal!.ranking.map((r) => r.market)).toEqual(["B", "A", "D", "C"]);
  });

  it("does not use any month AFTER the current latest month for ranking (no look-ahead in the live path either)", () => {
    // Same adversarial shape as the Fase-2 backtest test: B's real edge is
    // hidden UNTIL a future month that doesn't exist yet in this live feed.
    const fullHistory = [asset("A", [100, 105, 110, 120]), asset("B", [100, 100, 100, 100])];
    const signalNow = computeCurrentRs3mSignal(fullHistory, 3);
    expect(signalNow!.selectedMarket).toBe("A");
  });
});
