import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Candle } from "@/core/market-data/types";
import { runTimeSeriesReversalBacktest } from "@/core/strategy2-research/short-term-reversal";
import { evaluateCanonicalCaSignal, canonicalQuantile, type CanonicalCaSignalPoint } from "@/core/ca-shadow/canonical-signal";

/**
 * Block 10 §2/§27 — proves the canonical signal module reproduces the
 * ORIGINAL (verified) implementation's day-by-day trigger flags EXACTLY
 * (0 discrepancies), resolving Block 9.y's 4/8194 reproduction ambiguity
 * for good. Runs the canonical evaluator "as of" every historical day
 * (a rolling, causal re-derivation — never peeking past that day) and
 * compares against the original's own single backtest pass.
 */
function makeCandles(days: number, seed: number): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  let rng = seed;
  for (let i = 0; i < days; i++) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const pctMove = ((rng % 200) - 100) / 5000;
    price *= 1 + pctMove;
    const date = new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10);
    candles.push({ market: "SP500", timeframe: "1d", timestamp: `${date}T00:00:00.000Z`, symbol: "SPY", provider: "synthetic", open: price, high: price * 1.01, low: price * 0.99, close: price, volume: 1_000_000 });
  }
  return candles;
}

function toPoints(candles: readonly Candle[]): CanonicalCaSignalPoint[] {
  return [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map((c) => ({ date: c.timestamp.slice(0, 10), close: c.close }));
}

describe("Block 10 — canonical C-A signal: exact reproduction of the original (synthetic, portable)", () => {
  it("matches the original's trigger flag on every day with sufficient history, 0 discrepancies", () => {
    const candles = makeCandles(1500, 7);
    const original = runTimeSeriesReversalBacktest(candles, "REALISTIC");
    const originalTriggerByDate = new Map(original.map((r) => [r.date, r.turnover > 0]));

    const points = toPoints(candles);
    let checked = 0;
    let mismatches = 0;
    // The original's `yesterdayReturn` for its own loop index `i` is `returns[i-1]`, tested
    // against a window ending at `i-2`, but the RESULT ROW is stored under `sorted[i].date` —
    // the EXIT day, one trading day AFTER the day whose return was actually tested. Canonical's
    // `decisionDate` (evaluated "as of" points[i], the array's last element) corresponds to that
    // tested day, i.e. the original's `i-1`. So canonical's evaluation "as of points[i]" must be
    // compared against the original's row dated `points[i+1].date`, not `points[i].date`.
    for (let i = 253; i < points.length - 1; i++) {
      const asOf = points.slice(0, i + 1);
      const signal = evaluateCanonicalCaSignal(asOf, 252, 0.1);
      if (!signal?.sufficientHistory) continue;
      const exitDate = points[i + 1].date;
      const originalTriggered = originalTriggerByDate.get(exitDate);
      if (originalTriggered === undefined) continue; // original's own warmup differs by 1 row at the boundary — not compared
      checked += 1;
      if (signal.triggered !== originalTriggered) mismatches += 1;
    }

    expect(checked).toBeGreaterThan(1000);
    expect(mismatches).toBe(0);
  });

  it("canonicalQuantile matches the original's own linear-interpolation quantile() on known values", () => {
    const sorted = [-0.05, -0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04, 0.05];
    // idx = (n-1)*q = 9*0.1 = 0.9 -> lo=0, hi=1 -> sorted[0] + (sorted[1]-sorted[0])*0.9 (linear interpolation, NOT nearest-rank)
    const idx = 9 * 0.1;
    const expected = sorted[0] + (sorted[1] - sorted[0]) * idx;
    expect(canonicalQuantile(sorted, 0.1)).toBeCloseTo(expected, 10);
    expect(canonicalQuantile(sorted, 0.1)).not.toBeCloseTo(sorted[1], 5); // distinguishes from nearest-rank, which would pick sorted[1] (Math.ceil(0.9)=1) exactly
  });

  it("returns undefined for fewer than 2 points, and sufficientHistory=false with fewer than 252 usable trailing returns", () => {
    expect(evaluateCanonicalCaSignal([], 252, 0.1)).toBeUndefined();
    expect(evaluateCanonicalCaSignal([{ date: "2020-01-01", close: 100 }], 252, 0.1)).toBeUndefined();

    const shortPoints = toPoints(makeCandles(50, 1));
    const signal = evaluateCanonicalCaSignal(shortPoints, 252, 0.1);
    expect(signal?.sufficientHistory).toBe(false);
  });

  it("is causal: mutating a future point never changes an earlier evaluation", () => {
    const candles = makeCandles(600, 11);
    const points = toPoints(candles);
    const asOf400 = points.slice(0, 400);
    const baseline = evaluateCanonicalCaSignal(asOf400, 252, 0.1);

    const mutatedPoints = points.map((p, i) => (i >= 450 ? { ...p, close: p.close * 5 } : p));
    const asOf400Mutated = mutatedPoints.slice(0, 400);
    const mutatedResult = evaluateCanonicalCaSignal(asOf400Mutated, 252, 0.1);

    expect(mutatedResult).toEqual(baseline);
  });
});

const REAL_SPY_PATH = join(process.cwd(), "results", "block9b", "datasets", "SPY_1d.json");

describe.runIf(existsSync(REAL_SPY_PATH))("Block 10 — canonical C-A signal: exact reproduction on REAL SPY data (skipped if results/block9b/datasets/ hasn't been regenerated in this checkout)", () => {
  it("matches the original's trigger flag on every real trading day, 0 discrepancies", () => {
    interface RawBar {
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      adjClose: number;
      volume: number;
    }
    const raw: RawBar[] = JSON.parse(readFileSync(REAL_SPY_PATH, "utf8"));
    const candles: Candle[] = [...raw]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((b) => {
        const ratio = b.close > 0 ? b.adjClose / b.close : 1;
        return { market: "SP500", timeframe: "1d", timestamp: `${b.date}T00:00:00.000Z`, symbol: "SPY", provider: "yahoo-adjusted", open: b.open * ratio, high: b.high * ratio, low: b.low * ratio, close: b.adjClose, volume: b.volume };
      });

    const original = runTimeSeriesReversalBacktest(candles, "REALISTIC");
    const originalTriggerByDate = new Map(original.map((r) => [r.date, r.turnover > 0]));

    const points = toPoints(candles);
    let checked = 0;
    let mismatches = 0;
    // See the synthetic-data test above for why `points[i+1].date` (the exit day), not
    // `points[i].date`, is the correct original row to compare canonical's "as of points[i]"
    // evaluation against.
    for (let i = 253; i < points.length - 1; i++) {
      const signal = evaluateCanonicalCaSignal(points.slice(0, i + 1), 252, 0.1);
      if (!signal?.sufficientHistory) continue;
      const originalTriggered = originalTriggerByDate.get(points[i + 1].date);
      if (originalTriggered === undefined) continue;
      checked += 1;
      if (signal.triggered !== originalTriggered) mismatches += 1;
    }

    expect(checked).toBeGreaterThan(8000);
    expect(mismatches).toBe(0);
  });
});
