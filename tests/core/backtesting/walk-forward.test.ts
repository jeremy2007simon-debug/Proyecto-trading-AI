import { describe, expect, it } from "vitest";
import { buildWalkForwardWindows, runWalkForwardWindows } from "@/core/backtesting/walk-forward";
import { ZERO_COST_BASELINE, DEFAULT_SAME_CANDLE_POLICY, type BacktestConfig, type BacktestingEngine, type BacktestRun } from "@/core/backtesting/types";
import type { Candle } from "@/core/market-data/types";

function buildCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      market: "SP500",
      timeframe: "15m",
      symbol: "SPY",
      provider: "test",
      timestamp: new Date(Date.UTC(2024, 0, 1) + i * 900_000).toISOString(),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1000,
    });
  }
  return candles;
}

describe("buildWalkForwardWindows", () => {
  it("produces windows with the configured train/validation/forward sizes", () => {
    const candles = buildCandles(30);
    const windows = buildWalkForwardWindows(candles, { trainBars: 10, validationBars: 5, forwardBars: 5, stepBars: 5 });

    expect(windows.length).toBeGreaterThan(0);
    for (const window of windows) {
      expect(window.train).toHaveLength(10);
      expect(window.validation).toHaveLength(5);
      expect(window.forward).toHaveLength(5);
    }
  });

  it("each window's phases are contiguous and non-overlapping (train -> validation -> forward)", () => {
    const candles = buildCandles(30);
    const windows = buildWalkForwardWindows(candles, { trainBars: 10, validationBars: 5, forwardBars: 5, stepBars: 5 });

    const window = windows[0];
    expect(window.train[window.train.length - 1].timestamp).not.toBe(window.validation[0].timestamp);
    expect(
      new Date(window.train[window.train.length - 1].timestamp).getTime(),
    ).toBeLessThan(new Date(window.validation[0].timestamp).getTime());
    expect(
      new Date(window.validation[window.validation.length - 1].timestamp).getTime(),
    ).toBeLessThan(new Date(window.forward[0].timestamp).getTime());

    // Immediately adjacent: validation starts exactly where train ends.
    const allPhaseCandles = [...window.train, ...window.validation, ...window.forward];
    const expectedSlice = candles.slice(0, 20);
    expect(allPhaseCandles.map((c) => c.timestamp)).toEqual(expectedSlice.map((c) => c.timestamp));
  });

  it("slides forward by stepBars between windows", () => {
    const candles = buildCandles(30);
    const windows = buildWalkForwardWindows(candles, { trainBars: 10, validationBars: 5, forwardBars: 5, stepBars: 5 });

    expect(windows.length).toBeGreaterThanOrEqual(2);
    // Window 1's train starts 5 bars (stepBars) after window 0's train.
    const gapMs = new Date(windows[1].train[0].timestamp).getTime() - new Date(windows[0].train[0].timestamp).getTime();
    expect(gapMs).toBe(5 * 900_000);
  });

  it("never produces a partial trailing window", () => {
    // 30 candles, windowSize=20, stepBars=5 -> windows start at 0, 5, 10 (start+20<=30); start=15 would need candles[15..34], only 15 available -> excluded.
    const candles = buildCandles(30);
    const windows = buildWalkForwardWindows(candles, { trainBars: 10, validationBars: 5, forwardBars: 5, stepBars: 5 });

    expect(windows).toHaveLength(3);
    for (const window of windows) {
      expect(window.train.length + window.validation.length + window.forward.length).toBe(20);
    }
  });

  it("returns an empty array when no candles fit even one window", () => {
    const candles = buildCandles(5);
    const windows = buildWalkForwardWindows(candles, { trainBars: 10, validationBars: 5, forwardBars: 5, stepBars: 5 });
    expect(windows).toEqual([]);
  });
});

describe("runWalkForwardWindows", () => {
  it("calls the engine once per phase per window, with that phase's own candles and date range", () => {
    const candles = buildCandles(20);
    const windows = buildWalkForwardWindows(candles, { trainBars: 10, validationBars: 5, forwardBars: 5, stepBars: 5 });

    const calls: { candles: readonly Candle[] }[] = [];
    const fakeEngine: BacktestingEngine = {
      id: "fake",
      run(config, runCandles) {
        calls.push({ candles: runCandles });
        return {
          id: "run",
          config,
          status: "COMPLETED",
          trades: [],
        } as BacktestRun;
      },
      runWalkForward: () => [],
    };

    const baseConfig: BacktestConfig = {
      name: "test",
      market: "SP500",
      timeframe: "15m",
      mode: "SINGLE_STRATEGY",
      strategyIds: ["x"],
      dateFrom: candles[0].timestamp,
      dateTo: candles[candles.length - 1].timestamp,
      initialCapital: 10_000,
      riskPerTradePct: 0.5,
      commission: 0,
      slippage: 0,
      costs: ZERO_COST_BASELINE,
      sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
    };

    const results = runWalkForwardWindows(fakeEngine, baseConfig, windows);

    expect(results).toHaveLength(1);
    expect(calls).toHaveLength(3); // train, validation, forward
    expect(calls[0].candles).toHaveLength(10);
    expect(calls[1].candles).toHaveLength(5);
    expect(calls[2].candles).toHaveLength(5);
  });
});
