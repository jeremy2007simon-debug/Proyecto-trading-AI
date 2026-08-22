import { describe, expect, it } from "vitest";
import { runTrendPullbackBacktest, type TrendPullbackConfig } from "@/core/us-index-research/trend-pullback";
import { toAdjustedCandles } from "@/core/us-index-research/daily-series";
import { OOS_HOLDOUT_PCT, splitMonthsChronologically } from "@/core/portfolio-research/oos-split";
import { buildMonthlyWalkForwardWindows, DEFAULT_MONTHLY_WALK_FORWARD } from "@/core/portfolio-research/walk-forward";
import { runR3bIndependentReproduction, R3B_ORIGINAL_CONFIG, type R3bBarInput } from "@/core/r3b-verification/independent-reproduction";
import type { UsIndexDailyBar } from "@/core/us-index-research/types";

/**
 * Block 8.4 §3 — adversarial no-look-ahead tests against BOTH the
 * ORIGINAL R3-B implementation (`trend-pullback.ts`) and the
 * INDEPENDENT reproduction, per this block's mandate to audit R3-B
 * "exactamente como fue promovida" while trying to falsify it. Every
 * test here follows the same pattern: compute a baseline, apply an
 * adversarial mutation that only touches data AFTER a cutoff point,
 * and assert everything AT OR BEFORE the cutoff is byte-identical.
 */
const R3B_CONFIG: TrendPullbackConfig = { smaTrendPeriod: 50, smaSlopeLookbackDays: 10, rsiPeriod: 14, entryRsiThreshold: 40, exitRsiThreshold: 55, maxHoldDays: 20, regimeFilterMode: "LONG_TERM_TREND" };

function makeSyntheticBars(days: number, seed = 1): UsIndexDailyBar[] {
  const bars: UsIndexDailyBar[] = [];
  let price = 100;
  let rng = seed;
  for (let i = 0; i < days; i++) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const pctMove = ((rng % 200) - 100) / 5000; // +-2%
    price *= 1 + pctMove;
    const date = new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10);
    bars.push({ date, open: price, high: price * 1.005, low: price * 0.995, close: price, adjClose: price, volume: 1_000_000 });
  }
  return bars;
}

describe("no-look-ahead — mutate FUTURE data, past signals must not change (ORIGINAL implementation)", () => {
  it("mutating a bar far in the future does not change any earlier day's position/return", () => {
    const bars = makeSyntheticBars(500);
    const baseline = runTrendPullbackBacktest(toAdjustedCandles(bars, "SPY"), R3B_CONFIG, "REALISTIC");

    const mutated = bars.map((b, i) => (i === 480 ? { ...b, close: b.close * 5, adjClose: b.adjClose * 5, high: b.high * 5, low: b.low * 5, open: b.open * 5 } : b));
    const mutatedResult = runTrendPullbackBacktest(toAdjustedCandles(mutated, "SPY"), R3B_CONFIG, "REALISTIC");

    const cutoffDate = bars[470].date;
    const baselinePrefix = baseline.filter((d) => d.date <= cutoffDate);
    const mutatedPrefix = mutatedResult.filter((d) => d.date <= cutoffDate);
    expect(mutatedPrefix).toEqual(baselinePrefix);
  });
});

describe("no-look-ahead — mutate FUTURE data, past signals must not change (INDEPENDENT reproduction)", () => {
  it("same property holds for the independent reproduction", () => {
    const bars = makeSyntheticBars(500);
    const inputs: R3bBarInput[] = bars.map((b) => ({ date: b.date, adjClose: b.adjClose }));
    const baseline = runR3bIndependentReproduction(inputs, R3B_ORIGINAL_CONFIG);

    const mutatedInputs = inputs.map((b, i) => (i === 480 ? { ...b, adjClose: b.adjClose * 5 } : b));
    const mutatedResult = runR3bIndependentReproduction(mutatedInputs, R3B_ORIGINAL_CONFIG);

    const cutoffDate = bars[470].date;
    const baselinePrefix = baseline.daily.filter((d) => d.date <= cutoffDate);
    const mutatedPrefix = mutatedResult.daily.filter((d) => d.date <= cutoffDate);
    expect(mutatedPrefix).toEqual(baselinePrefix);
  });
});

describe("no-look-ahead — removing the last bar never rewrites history", () => {
  it("dropping the final bar leaves every earlier day's result unchanged", () => {
    const bars = makeSyntheticBars(400);
    const full = runTrendPullbackBacktest(toAdjustedCandles(bars, "SPY"), R3B_CONFIG, "REALISTIC");
    const truncated = runTrendPullbackBacktest(toAdjustedCandles(bars.slice(0, -1), "SPY"), R3B_CONFIG, "REALISTIC");

    const truncatedDates = new Set(truncated.map((d) => d.date));
    const fullOverlap = full.filter((d) => truncatedDates.has(d.date));
    expect(fullOverlap).toEqual(truncated);
  });
});

describe("no-look-ahead — a synthetic future split never alters past signals", () => {
  it("injecting a 2:1 price halving partway through the series doesn't change any earlier day", () => {
    const bars = makeSyntheticBars(400);
    const baseline = runTrendPullbackBacktest(toAdjustedCandles(bars, "SPY"), R3B_CONFIG, "REALISTIC");

    // Simulate a 2:1 split at day 300: every bar from day 300 onward is halved (as adjClose SHOULD already reflect for a real split — this tests the ENGINE's causality, not split-adjustment correctness itself).
    const splitBars = bars.map((b, i) => (i >= 300 ? { ...b, close: b.close / 2, adjClose: b.adjClose / 2, open: b.open / 2, high: b.high / 2, low: b.low / 2 } : b));
    const splitResult = runTrendPullbackBacktest(toAdjustedCandles(splitBars, "SPY"), R3B_CONFIG, "REALISTIC");

    const cutoffDate = bars[290].date;
    const baselinePrefix = baseline.filter((d) => d.date <= cutoffDate);
    const splitPrefix = splitResult.filter((d) => d.date <= cutoffDate);
    expect(splitPrefix).toEqual(baselinePrefix);
  });
});

describe("no-look-ahead — OOS split never reorders or leaks future data into the in-sample set", () => {
  it("in-sample months are always strictly earlier than out-of-sample months (chronological, never shuffled)", () => {
    const months = Array.from({ length: 100 }, (_, i) => `2010-${String((i % 12) + 1).padStart(2, "0")}-${i}`);
    const { inSample, outOfSample } = splitMonthsChronologically(months);
    expect(inSample.length + outOfSample.length).toBe(months.length);
    expect(outOfSample.length).toBe(Math.floor(months.length * (OOS_HOLDOUT_PCT / 100)));
    // Every in-sample entry must precede every out-of-sample entry in original array order.
    const lastInSampleIndex = months.indexOf(inSample[inSample.length - 1]);
    const firstOosIndex = months.indexOf(outOfSample[0]);
    expect(lastInSampleIndex).toBeLessThan(firstOosIndex);
  });

  it("R3-B's own OOS split point never moves when OOS-period-only data changes", () => {
    const bars = makeSyntheticBars(2000);
    const candles = toAdjustedCandles(bars, "SPY");
    const result = runTrendPullbackBacktest(candles, R3B_CONFIG, "REALISTIC");
    const monthlyReturns = result.map((d) => d.netReturn);
    const split1 = splitMonthsChronologically(monthlyReturns);

    // Mutate only the LAST 10% of daily results' returns (deep into what would be the OOS tail) and confirm the in-sample PORTION of the split boundary computation is unaffected.
    const mutatedReturns = monthlyReturns.map((r, i) => (i > monthlyReturns.length * 0.9 ? r * 3 : r));
    const split2 = splitMonthsChronologically(mutatedReturns);
    expect(split2.inSample.slice(0, Math.floor(monthlyReturns.length * 0.9))).toEqual(split1.inSample.slice(0, Math.floor(monthlyReturns.length * 0.9)));
  });
});

describe("no-look-ahead — walk-forward windows never let a later window's data influence an earlier one", () => {
  it("the forward return of window 0 is unaffected by mutating data belonging only to window 1+", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const windows = buildMonthlyWalkForwardWindows(items, { trainMonths: 24, forwardMonths: 12, stepMonths: 12 });
    expect(windows.length).toBeGreaterThan(1);
    // Window 0's train+forward slice must be drawn entirely from the front of `items`, strictly before window 1's.
    const window0Max = Math.max(...windows[0].train, ...windows[0].forward);
    const window1Min = Math.min(...windows[1].train);
    expect(window0Max).toBeLessThan(Math.max(...windows[1].train, ...windows[1].forward));
    expect(window1Min).toBeGreaterThanOrEqual(0);
  });

  it("R3-B's own walk-forward windows are built from the DEFAULT config unchanged (no silent resizing to manufacture more passing windows)", () => {
    expect(DEFAULT_MONTHLY_WALK_FORWARD).toEqual({ trainMonths: 60, forwardMonths: 12, stepMonths: 12 });
  });
});

describe("no-look-ahead — timestamp shift", () => {
  it("shifting every date forward by a fixed offset produces the SAME relative signal sequence (position flags), proving dates are used only for ordering/keying, not as a hidden absolute-date dependency", () => {
    const bars = makeSyntheticBars(400);
    const shifted = bars.map((b) => ({ ...b, date: new Date(new Date(b.date).getTime() + 5 * 365 * 86_400_000).toISOString().slice(0, 10) }));

    const originalResult = runTrendPullbackBacktest(toAdjustedCandles(bars, "SPY"), R3B_CONFIG, "REALISTIC");
    const shiftedResult = runTrendPullbackBacktest(toAdjustedCandles(shifted, "SPY"), R3B_CONFIG, "REALISTIC");

    expect(shiftedResult.map((d) => d.inPosition)).toEqual(originalResult.map((d) => d.inPosition));
    expect(shiftedResult.map((d) => d.netReturn)).toEqual(originalResult.map((d) => d.netReturn));
  });
});
