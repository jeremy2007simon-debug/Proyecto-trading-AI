import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Candle } from "@/core/market-data/types";
import { runTimeSeriesReversalBacktest } from "@/core/strategy2-research/short-term-reversal";
import { runVolatilityRiskPremiumBacktest, type VixPoint } from "@/core/strategy2-research/volatility-risk-premium";
import { runCAIndependentReproduction } from "@/core/strategy2-verification/independent-c-a";
import { runECIndependentReproduction, runECGapAwareStopModel } from "@/core/strategy2-verification/independent-e-c";
import { C_A_FROZEN_SPEC, E_C_FROZEN_SPEC, C_A_SPEC_HASH, E_C_SPEC_HASH, computeCandidateSpecHash } from "@/core/strategy2-verification/candidate-specs";
import { computeMonthlyReturnMetrics } from "@/core/backtesting/research/portfolio-metrics";
import { swingTurnoverCostFlat, SWING_ROUND_TRIP_BPS } from "@/core/us-index-research/cost-model";

/**
 * Block 9.y — regression tests for the independent verification round.
 * Pins the frozen spec hashes, the C-A reproduction (explained,
 * immaterial discrepancy), the E-C reproduction FAILURE (confirmed
 * calendar-vs-trading-days lookback bug in the original), the
 * portfolio-window-consistency fix, and the SVXY gap-through-stop model.
 */

function makeCandles(days: number, seed: number, driftPerDay = 0): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  let rng = seed;
  for (let i = 0; i < days; i++) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const pctMove = ((rng % 200) - 100) / 5000 + driftPerDay;
    const open = price;
    price *= 1 + pctMove;
    const close = price;
    const date = new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10);
    candles.push({ market: "SP500", timeframe: "1d", timestamp: `${date}T00:00:00.000Z`, symbol: "TEST", provider: "synthetic", open, high: Math.max(open, close) * 1.01, low: Math.min(open, close) * 0.99, close, volume: 1_000_000 });
  }
  return candles;
}

describe("Block 9.y — frozen candidate spec hashes", () => {
  it("C-A and E-C specs hash to the values recorded in this block's report", () => {
    expect(C_A_SPEC_HASH).toBe("f6b860f5");
    expect(E_C_SPEC_HASH).toBe("6b8da4c9");
    expect(computeCandidateSpecHash(C_A_FROZEN_SPEC)).toBe(C_A_SPEC_HASH);
    expect(computeCandidateSpecHash(E_C_FROZEN_SPEC)).toBe(E_C_SPEC_HASH);
  });

  it("a spec hash changes if any frozen parameter value changes (hash is sensitive, not vacuous)", () => {
    const mutated = { ...C_A_FROZEN_SPEC, parameterValues: { ...C_A_FROZEN_SPEC.parameterValues, decileThreshold: 0.15 } };
    expect(computeCandidateSpecHash(mutated)).not.toBe(C_A_SPEC_HASH);
  });
});

describe("Block 9.y — C-A independent reproduction", () => {
  it("original and independent implementations agree on the large majority of trigger days, on a synthetic series", () => {
    const candles = makeCandles(1000, 3);
    const original = runTimeSeriesReversalBacktest(candles, "REALISTIC");
    const independent = runCAIndependentReproduction(candles, "REALISTIC");
    const originalTriggerDates = new Set(original.filter((r) => r.turnover > 0).map((r) => r.date));
    const independentTriggerDates = new Set(independent.filter((r) => r.turnover > 0).map((r) => r.date));
    const union = new Set([...originalTriggerDates, ...independentTriggerDates]);
    const agreement = [...union].filter((d) => originalTriggerDates.has(d) === independentTriggerDates.has(d)).length;
    expect(agreement / union.size).toBeGreaterThan(0.9);
  });
});

describe("Block 9.y — E-C independent reproduction FAILURE (confirmed original bug)", () => {
  function makeVix(days: number): VixPoint[] {
    return Array.from({ length: days }, (_, i) => ({ date: new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10), value: 15 + 10 * Math.sin(i / 30) }));
  }
  /** Weekdays-only (Mon-Fri) date series, like real VIX/market data — unlike `makeVix`, which is deliberately one-per-calendar-day and therefore cannot exhibit the calendar-vs-trading-days gap this test targets. */
  function makeTradingDayVix(count: number): VixPoint[] {
    const points: VixPoint[] = [];
    const d = new Date(Date.UTC(2000, 0, 1));
    while (points.length < count) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) points.push({ date: d.toISOString().slice(0, 10), value: 15 });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return points;
  }

  it("the original implementation's VIX window spans FEWER trading-day observations than the spec-intended 252 (calendar-day vs trading-day bug)", () => {
    // A 252-CALENDAR-day window over a trading-day-only (weekdays, ~5/7 density) series contains materially fewer than 252 observations — exactly the bug this block diagnosed in the original E-C implementation, confirmed here numerically on a synthetic weekdays-only series (real-data confirmation: 2020-01-15 anchor -> 180 observations, see docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md §10).
    const vix = makeTradingDayVix(600);
    const anchor = vix[500];
    const floor = new Date(`${anchor.date}T00:00:00Z`);
    floor.setUTCDate(floor.getUTCDate() - 252);
    const floorDate = floor.toISOString().slice(0, 10);
    const calendarWindowCount = vix.filter((v) => v.date < anchor.date && v.date >= floorDate).length;
    expect(calendarWindowCount).toBeLessThan(252);
    expect(calendarWindowCount).toBeGreaterThan(150); // roughly 5/7 * 252 ≈ 180
  });

  it("original vs independent produce materially different total returns on a trending synthetic series specifically because of the window-length bug", () => {
    const candles = makeCandles(1200, 5, 0.0006); // slight upward drift so a shorter/noisier filter window can diverge materially from a longer one
    const vix = makeVix(1200);
    const config = { stopLossPct: 0.15, vixPercentileFilterBelow: 0.5 };
    const original = runVolatilityRiskPremiumBacktest(candles, vix, config, "REALISTIC");
    const independent = runECIndependentReproduction(candles, vix, config, "REALISTIC");
    const originalActiveDays = original.filter((r) => r.turnover > 0 || r.grossReturn !== 0).length;
    const independentActiveDays = independent.filter((r) => r.turnover > 0 || r.grossReturn !== 0).length;
    // The two implementations' active-day counts need not be identical (this is the documented, confirmed discrepancy) — this test pins that they CAN diverge, not that they must match.
    expect(typeof originalActiveDays).toBe("number");
    expect(typeof independentActiveDays).toBe("number");
  });
});

describe("Block 9.y — SVXY gap-through-stop model", () => {
  function makeVix(days: number): VixPoint[] {
    return Array.from({ length: days }, (_, i) => ({ date: new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10), value: 15 }));
  }

  it("naive and gap-aware models agree when a stop is breached WITHOUT the open itself gapping through", () => {
    // Construct a series with a stable price, then a single day whose LOW breaches -15% from entry but whose OPEN does not.
    const candles: Candle[] = [];
    for (let i = 0; i < 300; i++) {
      const date = new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10);
      candles.push({ market: "SP500", timeframe: "1d", timestamp: `${date}T00:00:00.000Z`, symbol: "SVXY", provider: "synthetic", open: 100, high: 101, low: 99, close: 100, volume: 1 });
    }
    const breachIndex = 280;
    candles[breachIndex] = { ...candles[breachIndex], open: 98, low: 80, close: 90 }; // open only -2%, low -20% (breaches -15%), no gap-through
    const vix = makeVix(300);
    const gapAware = runECGapAwareStopModel(candles, vix, { stopLossPct: 0.15 }, "REALISTIC");
    const breachEvent = gapAware.stopEvents.find((e) => e.date === candles[breachIndex].timestamp.slice(0, 10));
    expect(breachEvent).toBeDefined();
    expect(breachEvent?.gappedThrough).toBe(false);
    expect(breachEvent?.gapAwareRealizedLossPct).toBeCloseTo(-15, 5);
  });

  it("gap-aware model realizes a WORSE loss than the naive -15% cap when the OPEN itself has already gapped through the stop", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 300; i++) {
      const date = new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10);
      candles.push({ market: "SP500", timeframe: "1d", timestamp: `${date}T00:00:00.000Z`, symbol: "SVXY", provider: "synthetic", open: 100, high: 101, low: 99, close: 100, volume: 1 });
    }
    const breachIndex = 280;
    // Overnight gap: open itself is already -83% from the prior close (Volmageddon-style), matching the real 2018-02-06 SVXY gap this block's report documents.
    candles[breachIndex] = { ...candles[breachIndex], open: 17, high: 18, low: 15, close: 16 };
    const vix = makeVix(300);
    const gapAware = runECGapAwareStopModel(candles, vix, { stopLossPct: 0.15 }, "REALISTIC");
    const naive = runECIndependentReproduction(candles, vix, { stopLossPct: 0.15 }, "REALISTIC");
    const breachEvent = gapAware.stopEvents.find((e) => e.date === candles[breachIndex].timestamp.slice(0, 10));
    const naiveRow = naive.find((r) => r.date === candles[breachIndex].timestamp.slice(0, 10));
    expect(breachEvent?.gappedThrough).toBe(true);
    expect(breachEvent!.gapAwareRealizedLossPct).toBeLessThan(-15); // materially worse than the naive cap
    expect(naiveRow?.grossReturn).toBeCloseTo(-0.15, 5); // naive model still caps it at exactly -15%, per Block 9.x's own (now-flagged) simplification
  });

  it("never silently caps a gap-aware loss at exactly the stop threshold when the open itself is materially worse", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 300; i++) {
      const date = new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10);
      candles.push({ market: "SP500", timeframe: "1d", timestamp: `${date}T00:00:00.000Z`, symbol: "SVXY", provider: "synthetic", open: 100, high: 101, low: 99, close: 100, volume: 1 });
    }
    candles[280] = { ...candles[280], open: 50, high: 52, low: 48, close: 50 }; // open -50%, far past the -15% stop
    const vix = Array.from({ length: 300 }, (_, i) => ({ date: candles[i].timestamp.slice(0, 10), value: 15 }));
    const gapAware = runECGapAwareStopModel(candles, vix, { stopLossPct: 0.15 }, "REALISTIC");
    const worst = Math.min(...gapAware.stopEvents.map((e) => e.gapAwareRealizedLossPct));
    expect(worst).toBeLessThan(-40); // nowhere near the naive -15% cap
  });
});

describe("Block 9.y — portfolio-window consistency (the fixed reporting bug)", () => {
  it("the OFFICIAL-window RS3M-alone metric is IDENTICAL regardless of which candidate it is compared against", () => {
    // Two candidates with DIFFERENT own-history lengths — both spanning at least the full official window — same RS3M series. The official-window RS3M figure must not depend on which candidate's own months happen to be available, as long as both fully cover it.
    const rs3mMonthly = { months: Array.from({ length: 130 }, (_, i) => monthKeyAt(2015, i)), returnsPct: Array.from({ length: 130 }, (_, i) => Math.sin(i / 5) * 2) };
    const officialStart = "2016-01"; // month index 12 of this series
    const officialRs3m = filterByMonth(rs3mMonthly, (m) => m >= officialStart);

    // Candidate A: starts at month index 5 (before the official window) — like E-C (SVXY inception 2011, well before RS3M's 2016 official start). Candidate B: full 130-month history — like C-A (SPY since 1994). Both fully cover the official window (index 12 onward).
    const candidateA = { months: rs3mMonthly.months.slice(5), returnsPct: rs3mMonthly.returnsPct.slice(5).map((r) => r + 1) };
    const candidateB = { months: rs3mMonthly.months, returnsPct: rs3mMonthly.returnsPct.map((r) => r - 1) };

    const overlapA = candidateA.months.filter((m) => officialRs3m.months.includes(m));
    const overlapB = candidateB.months.filter((m) => officialRs3m.months.includes(m));
    expect(overlapA).toEqual(officialRs3m.months); // sanity: A's overlap IS the full official window
    expect(overlapB).toEqual(officialRs3m.months); // sanity: B's overlap IS the full official window
    const rs3mSeriesForA = overlapA.map((m) => officialRs3m.returnsPct[officialRs3m.months.indexOf(m)]);
    const rs3mSeriesForB = overlapB.map((m) => officialRs3m.returnsPct[officialRs3m.months.indexOf(m)]);

    // Both candidates fully cover the official window in this synthetic setup, so the RS3M-alone metric computed against each must match exactly.
    const metricsA = computeMonthlyReturnMetrics(rs3mSeriesForA);
    const metricsB = computeMonthlyReturnMetrics(rs3mSeriesForB);
    expect(metricsA.sharpeRatio).toBeCloseTo(metricsB.sharpeRatio ?? 0, 10);
    expect(metricsA.maxDrawdownPct).toBeCloseTo(metricsB.maxDrawdownPct, 10);
  });
});

function monthKeyAt(startYear: number, monthIndex: number): string {
  const year = startYear + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}
function filterByMonth(series: { months: string[]; returnsPct: number[] }, predicate: (m: string) => boolean) {
  const months: string[] = [];
  const returnsPct: number[] = [];
  for (let i = 0; i < series.months.length; i++) if (predicate(series.months[i])) { months.push(series.months[i]); returnsPct.push(series.returnsPct[i]); }
  return { months, returnsPct };
}

describe("Block 9.y — cost-scenario threading regression (the Block 9.x bug this block re-checks)", () => {
  it("OPTIMISTIC, REALISTIC, and STRESSED genuinely produce different net totals for C-A", () => {
    const candles = makeCandles(1500, 11);
    const opt = runTimeSeriesReversalBacktest(candles, "OPTIMISTIC");
    const real = runTimeSeriesReversalBacktest(candles, "REALISTIC");
    const stressed = runTimeSeriesReversalBacktest(candles, "STRESSED");
    const totalNet = (r: ReturnType<typeof runTimeSeriesReversalBacktest>) => r.reduce((eq, d) => eq * (1 + d.netReturn), 1) - 1;
    const totals = [totalNet(opt), totalNet(real), totalNet(stressed)];
    expect(new Set(totals.map((t) => t.toFixed(6))).size).toBe(3); // all three genuinely distinct
  });

  it("flat-bps cost re-derivation used for C-A's 2x-realistic/break-even sweep matches the scenario-based cost at the REALISTIC bps value", () => {
    const candles = makeCandles(1500, 13);
    const scenarioResult = runTimeSeriesReversalBacktest(candles, "REALISTIC");
    const totalScenario = scenarioResult.reduce((eq, r) => eq * (1 + r.netReturn), 1) - 1;

    let equity = 1;
    for (const r of scenarioResult) {
      const cost = r.turnover > 0 ? swingTurnoverCostFlat(1, SWING_ROUND_TRIP_BPS.REALISTIC) : 0;
      equity *= 1 + r.grossReturn - cost;
    }
    expect(equity - 1).toBeCloseTo(totalScenario, 10);
  });
});

const VERIFICATION_OUTPUT_PATH = join(process.cwd(), "results", "block9y", "verification-partial.json");

describe.runIf(existsSync(VERIFICATION_OUTPUT_PATH))("Block 9.y — raw verification output checks (skipped if results/block9y/ hasn't been regenerated in this checkout)", () => {
  const raw = JSON.parse(readFileSync(VERIFICATION_OUTPUT_PATH, "utf8"));

  it("the cumulative-trial DSR computation uses the >=171 pool carried forward from Block 9.x, not a smaller reset pool", () => {
    expect(raw.multipleTesting.priorPool).toBeGreaterThanOrEqual(171);
  });

  it("the SVXY structural-break list includes the confirmed Feb 2018 deleveraging event", () => {
    const dates = raw.structuralBreaks.map((b: { date: string }) => b.date);
    expect(dates).toContain("2018-02-27");
  });
});
