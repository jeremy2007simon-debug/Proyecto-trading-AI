import { describe, expect, it } from "vitest";
import { runVolTargetBacktest, summarizeVolTarget, computeDownsideCapturePct } from "@/core/us-index-research/vol-target";
import type { UsIndexDailyBar } from "@/core/us-index-research/types";

function makeBars(closes: number[]): UsIndexDailyBar[] {
  return closes.map((c, i) => ({ date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10), open: c, high: c, low: c, close: c, adjClose: c, volume: 1000 }));
}

describe("runVolTargetBacktest — no look-ahead", () => {
  it("exposure on day i is unaffected by day i's own return magnitude — only by vol known through day i-1", () => {
    // 80 quiet days (vol ~0), then day 81 has a huge move — that huge move must not affect exposure on day 81 itself (it wasn't knowable before the day happened).
    const quiet = Array.from({ length: 80 }, () => 100);
    const bars = makeBars([...quiet, 300]); // day 81: close jumps 100 -> 300
    const results = runVolTargetBacktest(bars, { targetVolPct: 10, volLookbackDays: 20, volProxy: "REALIZED", maxExposure: 1 }, "OPTIMISTIC");
    const bigMoveDay = results[results.length - 1];
    // Exposure must be driven by the (near-zero) vol from the quiet run, i.e. capped at maxExposure=1, not reduced by the huge realized move that happens on this same day.
    expect(bigMoveDay.exposure).toBe(1);
  });
});

describe("runVolTargetBacktest — exposure bounds", () => {
  it("never exceeds maxExposure even when trailing vol is far below target", () => {
    const flat = makeBars(Array.from({ length: 60 }, () => 100)); // zero vol
    const results = runVolTargetBacktest(flat, { targetVolPct: 50, volLookbackDays: 20, volProxy: "REALIZED", maxExposure: 1 }, "OPTIMISTIC");
    for (const r of results) expect(r.exposure).toBeLessThanOrEqual(1);
  });

  it("charges cost only on days exposure actually changes", () => {
    const flat = makeBars(Array.from({ length: 60 }, () => 100));
    const results = runVolTargetBacktest(flat, { targetVolPct: 10, volLookbackDays: 20, volProxy: "REALIZED", maxExposure: 1 }, "REALISTIC");
    // Once vol settles at ~0 and exposure saturates at maxExposure=1 for consecutive days, turnover (and cost) on those unchanged days must be 0.
    const steadyState = results.slice(-5);
    for (const r of steadyState) {
      expect(r.turnover).toBeCloseTo(0, 10);
      expect(r.costDrag).toBeCloseTo(0, 10);
    }
  });
});

describe("summarizeVolTarget", () => {
  it("handles an empty result set without dividing by zero", () => {
    expect(summarizeVolTarget([])).toEqual({ daysTraded: 0, averageExposure: 0, timeInMarketPct: 0, averageTurnoverPerDay: 0 });
  });
});

describe("computeDownsideCapturePct", () => {
  it("returns 50% when the strategy earns exactly half the benchmark's loss on down days", () => {
    const strategy = [-0.05, 0.02, -0.05];
    const benchmark = [-0.1, 0.02, -0.1];
    expect(computeDownsideCapturePct(strategy, benchmark)).toBeCloseTo(50, 6);
  });

  it("is undefined when the benchmark has no down days", () => {
    expect(computeDownsideCapturePct([0.01, 0.02], [0.01, 0.02])).toBeUndefined();
  });
});
