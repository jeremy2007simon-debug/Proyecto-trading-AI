import { describe, expect, it } from "vitest";
import { buildAudJpyMomentumRegime, buildBasketVolRegime, regimeScaleFactor } from "@/core/portfolio-research/regime";
import type { InstrumentReturnSeries } from "@/core/portfolio-research/leg-returns";

/**
 * Regression tests for two real bugs caught during Block 8.2's own
 * review (see docs/BLOCK8_2_FX_TOP5_DEEP_RESEARCH_REPORT.md §10.2):
 * (1) `RegimeSeries.byMonth` was keyed by the return's REALIZATION date
 * instead of its SIGNAL date, silently making every regime lookup miss;
 * (2) `buildAudJpyMomentumRegime`'s trailing window included the
 * CURRENT (not-yet-realized-as-of-signal-date) return, a genuine
 * look-ahead bug that produced an implausibly strong backtest result
 * before it was caught.
 */

function series(returns: { signalMonthEnd: string; monthEnd: string; value: number }[]): InstrumentReturnSeries {
  return { instrument: "AUDJPY", returns: returns.map((r) => ({ ...r, trailingAnnualizedVol: 0.1 })) };
}

describe("buildAudJpyMomentumRegime — no look-ahead", () => {
  it("a month's regime reading never depends on that same month's own (not-yet-realized) return", () => {
    const flat = series([
      { signalMonthEnd: "2020-01-31", monthEnd: "2020-02-29", value: 0 },
      { signalMonthEnd: "2020-02-29", monthEnd: "2020-03-31", value: 0 },
      { signalMonthEnd: "2020-03-31", monthEnd: "2020-04-30", value: 0 },
    ]);
    const withCrash = series([
      { signalMonthEnd: "2020-01-31", monthEnd: "2020-02-29", value: 0 },
      { signalMonthEnd: "2020-02-29", monthEnd: "2020-03-31", value: 0 },
      { signalMonthEnd: "2020-03-31", monthEnd: "2020-04-30", value: -0.5 }, // a huge crash realized AFTER the 2020-03-31 signal date
    ]);

    const regimeFlat = buildBasketVolRegime([flat]);
    const regimeCrash = buildBasketVolRegime([withCrash]);
    // The reading AS OF the 2020-03-31 signal date must be identical
    // whether or not a crash later realizes from that same date —
    // otherwise the regime filter is "seeing" the crash before it signals.
    expect(regimeCrash.byMonth.get("2020-03")).toEqual(regimeFlat.byMonth.get("2020-03"));
  });

  it("AUD/JPY momentum regime keys by signalMonthEnd's month, not monthEnd's", () => {
    const s = series([
      { signalMonthEnd: "2020-01-31", monthEnd: "2020-02-29", value: 0.02 },
      { signalMonthEnd: "2020-02-29", monthEnd: "2020-03-31", value: -0.3 },
      { signalMonthEnd: "2020-03-31", monthEnd: "2020-04-30", value: 0.01 },
    ]);
    const regime = buildAudJpyMomentumRegime(s, 3);
    // Keys must be the SIGNAL months (2020-01, 2020-02, 2020-03) —
    // never the realization months (2020-02, 2020-03, 2020-04).
    expect([...regime.byMonth.keys()].sort()).toEqual(["2020-01", "2020-02", "2020-03"]);
  });

  it("the 3-month momentum window for index i uses only returns strictly before i", () => {
    const s = series([
      { signalMonthEnd: "2020-01-31", monthEnd: "2020-02-29", value: 0.1 },
      { signalMonthEnd: "2020-02-29", monthEnd: "2020-03-31", value: 0.1 },
      { signalMonthEnd: "2020-03-31", monthEnd: "2020-04-30", value: 0.1 },
      { signalMonthEnd: "2020-04-30", monthEnd: "2020-05-31", value: -0.9 }, // crash realized from the 4th signal date onward
    ]);
    const regime = buildAudJpyMomentumRegime(s, 3);
    // The 4th signal date's OWN reading must not reflect the crash that
    // realizes FROM that date (index 3's window is entries[0..3), i.e.
    // indices 0,1,2 — all +0.1, so momentum should read positive, never
    // capturing -0.9 which belongs to index 3 itself).
    const fourthReading = regime.byMonth.get("2020-04");
    expect(fourthReading!.value).toBeGreaterThan(0);
  });
});

describe("regimeScaleFactor", () => {
  it("NONE always returns 1 regardless of percentile", () => {
    expect(regimeScaleFactor(99, "NONE", 80)).toBe(1);
  });

  it("HARD_EXIT is 1 below threshold and 0 at/above it", () => {
    expect(regimeScaleFactor(79, "HARD_EXIT", 80)).toBe(1);
    expect(regimeScaleFactor(80, "HARD_EXIT", 80)).toBe(0);
    expect(regimeScaleFactor(100, "HARD_EXIT", 80)).toBe(0);
  });

  it("SOFT_SCALE de-risks gradually from 1x at the threshold to 0.5x at the 100th percentile", () => {
    expect(regimeScaleFactor(79, "SOFT_SCALE", 80)).toBe(1);
    expect(regimeScaleFactor(80, "SOFT_SCALE", 80)).toBe(1);
    expect(regimeScaleFactor(100, "SOFT_SCALE", 80)).toBeCloseTo(0.5, 10);
    const mid = regimeScaleFactor(90, "SOFT_SCALE", 80);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
  });
});
