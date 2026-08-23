import { describe, expect, it } from "vitest";
import type { Candle } from "@/core/market-data/types";
import { runOvernightOnlyBacktest, runOvernightIntradayTugOfWarBacktest } from "@/core/strategy2-research/overnight-intraday";
import { runTurnOfMonthBacktest } from "@/core/strategy2-research/turn-of-month";
import { runDefensiveTiltBacktest, runStaticLongOnlyBacktest } from "@/core/strategy2-research/defensive-lowvol";
import { runTimeSeriesReversalBacktest, runCrossSectionalReversalBacktest } from "@/core/strategy2-research/short-term-reversal";
import { runVolatilityRiskPremiumBacktest, type VixPoint } from "@/core/strategy2-research/volatility-risk-premium";

/**
 * Block 9.x — adversarial no-look-ahead tests for every Family
 * D/E/M/F/C module, same pattern as Block 8.4's own
 * `tests/core/r3b-verification/no-lookahead-adversarial.test.ts`:
 * mutate data strictly AFTER a cutoff date, assert every result AT OR
 * BEFORE the cutoff is byte-identical.
 */
function makeSyntheticCandles(symbol: string, days: number, seed = 1): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  let rng = seed;
  for (let i = 0; i < days; i++) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const pctMove = ((rng % 200) - 100) / 5000; // +-2%
    const open = price;
    price *= 1 + pctMove;
    const close = price;
    const date = new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10);
    candles.push({ market: "SP500", timeframe: "1d", timestamp: `${date}T00:00:00.000Z`, symbol, provider: "synthetic", open, high: Math.max(open, close) * 1.01, low: Math.min(open, close) * 0.99, close, volume: 1_000_000 });
  }
  return candles;
}

function mutateFrom(candles: readonly Candle[], fromIndex: number, factor: number): Candle[] {
  return candles.map((c, i) => (i >= fromIndex ? { ...c, open: c.open * factor, high: c.high * factor, low: c.low * factor, close: c.close * factor } : c));
}

describe("Block 9.x no-look-ahead — Family D (overnight/intraday)", () => {
  it("runOvernightOnlyBacktest: mutating a future bar leaves earlier days unchanged", () => {
    const candles = makeSyntheticCandles("SPY", 400);
    const baseline = runOvernightOnlyBacktest(candles, "REALISTIC");
    const mutated = runOvernightOnlyBacktest(mutateFrom(candles, 380, 5), "REALISTIC");
    const cutoff = candles[370].timestamp.slice(0, 10);
    expect(mutated.filter((d) => d.date <= cutoff)).toEqual(baseline.filter((d) => d.date <= cutoff));
  });

  it("runOvernightIntradayTugOfWarBacktest: mutating a future bar leaves earlier days unchanged", () => {
    const candles = makeSyntheticCandles("SPY", 400);
    const baseline = runOvernightIntradayTugOfWarBacktest(candles, "REALISTIC");
    const mutated = runOvernightIntradayTugOfWarBacktest(mutateFrom(candles, 380, 5), "REALISTIC");
    const cutoff = candles[370].timestamp.slice(0, 10);
    expect(mutated.filter((d) => d.date <= cutoff)).toEqual(baseline.filter((d) => d.date <= cutoff));
  });
});

describe("Block 9.x no-look-ahead — Family M (turn-of-month)", () => {
  it("mutating a future bar leaves earlier months' results unchanged", () => {
    const candles = makeSyntheticCandles("SPY", 800);
    const baseline = runTurnOfMonthBacktest(candles, "REALISTIC");
    const mutated = runTurnOfMonthBacktest(mutateFrom(candles, 700, 5), "REALISTIC");
    const cutoff = candles[650].timestamp.slice(0, 10);
    expect(mutated.filter((d) => d.date <= cutoff)).toEqual(baseline.filter((d) => d.date <= cutoff));
  });
});

describe("Block 9.x no-look-ahead — Family F (defensive tilt)", () => {
  it("runDefensiveTiltBacktest: mutating a future bar (all 4 tickers) leaves earlier months unchanged", () => {
    const byTicker = { SPY: makeSyntheticCandles("SPY", 800, 1), QQQ: makeSyntheticCandles("QQQ", 800, 2), IWM: makeSyntheticCandles("IWM", 800, 3), DIA: makeSyntheticCandles("DIA", 800, 4) };
    const baseline = runDefensiveTiltBacktest(byTicker, "REALIZED_VOL", "REALISTIC");
    const mutatedByTicker = { SPY: mutateFrom(byTicker.SPY, 700, 5), QQQ: mutateFrom(byTicker.QQQ, 700, 5), IWM: mutateFrom(byTicker.IWM, 700, 5), DIA: mutateFrom(byTicker.DIA, 700, 5) };
    const mutated = runDefensiveTiltBacktest(mutatedByTicker, "REALIZED_VOL", "REALISTIC");
    const cutoff = byTicker.SPY[650].timestamp.slice(0, 10);
    expect(mutated.filter((d) => d.date <= cutoff)).toEqual(baseline.filter((d) => d.date <= cutoff));
  });

  it("runStaticLongOnlyBacktest: mutating a future bar leaves earlier days unchanged (trivially causal — daily return only ever looks one bar back)", () => {
    const candles = makeSyntheticCandles("USMV", 400);
    const baseline = runStaticLongOnlyBacktest(candles);
    const mutated = runStaticLongOnlyBacktest(mutateFrom(candles, 380, 5));
    const cutoff = candles[370].timestamp.slice(0, 10);
    expect(mutated.filter((d) => d.date <= cutoff)).toEqual(baseline.filter((d) => d.date <= cutoff));
  });
});

describe("Block 9.x no-look-ahead — Family C (short-term reversal)", () => {
  it("runTimeSeriesReversalBacktest: mutating a future bar leaves earlier days unchanged", () => {
    const candles = makeSyntheticCandles("SPY", 800);
    const baseline = runTimeSeriesReversalBacktest(candles, "REALISTIC");
    const mutated = runTimeSeriesReversalBacktest(mutateFrom(candles, 700, 5), "REALISTIC");
    const cutoff = candles[650].timestamp.slice(0, 10);
    expect(mutated.filter((d) => d.date <= cutoff)).toEqual(baseline.filter((d) => d.date <= cutoff));
  });

  it("runCrossSectionalReversalBacktest (daily): mutating a future bar leaves earlier days unchanged", () => {
    const byTicker = { SPY: makeSyntheticCandles("SPY", 400, 1), QQQ: makeSyntheticCandles("QQQ", 400, 2), IWM: makeSyntheticCandles("IWM", 400, 3), DIA: makeSyntheticCandles("DIA", 400, 4) };
    const baseline = runCrossSectionalReversalBacktest(byTicker, "daily", "REALISTIC");
    const mutatedByTicker = { SPY: mutateFrom(byTicker.SPY, 380, 5), QQQ: mutateFrom(byTicker.QQQ, 380, 5), IWM: mutateFrom(byTicker.IWM, 380, 5), DIA: mutateFrom(byTicker.DIA, 380, 5) };
    const mutated = runCrossSectionalReversalBacktest(mutatedByTicker, "daily", "REALISTIC");
    const cutoff = byTicker.SPY[370].timestamp.slice(0, 10);
    expect(mutated.filter((d) => d.date <= cutoff)).toEqual(baseline.filter((d) => d.date <= cutoff));
  });
});

describe("Block 9.x no-look-ahead — Family E (volatility risk premium)", () => {
  function makeVix(days: number): VixPoint[] {
    const points: VixPoint[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10);
      points.push({ date, value: 15 + 10 * Math.sin(i / 30) });
    }
    return points;
  }

  it("mutating a future SVXY bar leaves earlier days unchanged (unconditional entry)", () => {
    const candles = makeSyntheticCandles("SVXY", 400);
    const vix = makeVix(400);
    const baseline = runVolatilityRiskPremiumBacktest(candles, vix, { stopLossPct: 0.15 }, "REALISTIC");
    const mutated = runVolatilityRiskPremiumBacktest(mutateFrom(candles, 380, 5), vix, { stopLossPct: 0.15 }, "REALISTIC");
    const cutoff = candles[370].timestamp.slice(0, 10);
    expect(mutated.filter((d) => d.date <= cutoff)).toEqual(baseline.filter((d) => d.date <= cutoff));
  });

  it("mutating a future VIX reading leaves earlier days unchanged (VIX-percentile-filtered entry)", () => {
    const candles = makeSyntheticCandles("SVXY", 400);
    const vix = makeVix(400);
    const baseline = runVolatilityRiskPremiumBacktest(candles, vix, { stopLossPct: 0.15, vixPercentileFilterBelow: 0.5 }, "REALISTIC");
    const mutatedVix = vix.map((v, i) => (i >= 380 ? { ...v, value: v.value * 3 } : v));
    const mutated = runVolatilityRiskPremiumBacktest(candles, mutatedVix, { stopLossPct: 0.15, vixPercentileFilterBelow: 0.5 }, "REALISTIC");
    const cutoff = candles[370].timestamp.slice(0, 10);
    expect(mutated.filter((d) => d.date <= cutoff)).toEqual(baseline.filter((d) => d.date <= cutoff));
  });

  it("the module never produces a naked/unbounded short-vol position — every day's worst-case loss is capped at the configured stop", () => {
    const candles = makeSyntheticCandles("SVXY", 800, 7);
    const vix = makeVix(800);
    const results = runVolatilityRiskPremiumBacktest(candles, vix, { stopLossPct: 0.15 }, "REALISTIC");
    for (const day of results) {
      expect(day.grossReturn).toBeGreaterThanOrEqual(-0.15 - 1e-9);
    }
  });
});
