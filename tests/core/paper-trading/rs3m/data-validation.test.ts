import { describe, expect, it } from "vitest";
import { validateAssetCandles } from "@/core/paper-trading/rs3m/data-validation";
import type { RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";
import type { Candle } from "@/core/market-data/types";

function candle(overrides: Partial<Candle> = {}): Candle {
  return {
    market: "SP500",
    timeframe: "1d",
    symbol: "SPY",
    provider: "test",
    timestamp: "2026-07-31T20:00:00Z",
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1_000_000,
    ...overrides,
  };
}

function asset(market: string, candles: Candle[]): RelativeStrengthAssetInput {
  return { market, candles };
}

describe("validateAssetCandles", () => {
  it("passes clean data with no violations", () => {
    const assets = [asset("SP500", [candle(), candle({ timestamp: "2026-08-31T20:00:00Z", close: 105 })])];
    expect(validateAssetCandles(assets)).toEqual([]);
  });

  it("flags a NaN close (e.g. a malformed API payload) as a violation", () => {
    const assets = [asset("SP500", [candle({ close: NaN })])];
    const violations = validateAssetCandles(assets);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ market: "SP500", field: "close" });
  });

  it("flags a zero or negative price on any OHLC field", () => {
    const assets = [asset("SP500", [candle({ open: 0 }), candle({ low: -5 })])];
    const violations = validateAssetCandles(assets);
    expect(violations.map((v) => v.field)).toEqual(["open", "low"]);
  });

  it("flags Infinity as invalid", () => {
    const assets = [asset("SP500", [candle({ high: Infinity })])];
    expect(validateAssetCandles(assets)[0].field).toBe("high");
  });

  it("flags a negative or non-finite volume", () => {
    const assets = [asset("SP500", [candle({ volume: -1 }), candle({ volume: NaN })])];
    const violations = validateAssetCandles(assets);
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.field === "volume")).toBe(true);
  });

  it("collects ALL violations across all assets and candles — never short-circuits on the first one", () => {
    const assets = [
      asset("SP500", [candle({ close: NaN }), candle({ open: -1 })]),
      asset("NASDAQ100", [candle({ volume: NaN })]),
    ];
    const violations = validateAssetCandles(assets);
    expect(violations).toHaveLength(3);
    expect(new Set(violations.map((v) => v.market))).toEqual(new Set(["SP500", "NASDAQ100"]));
  });

  it("validates every historical candle in the lookback window, not just the latest", () => {
    const assets = [asset("SP500", [candle({ timestamp: "2026-01-31T20:00:00Z", close: NaN }), candle({ timestamp: "2026-08-31T20:00:00Z" })])];
    const violations = validateAssetCandles(assets);
    expect(violations).toHaveLength(1);
    expect(violations[0].timestamp).toBe("2026-01-31T20:00:00Z");
  });
});
