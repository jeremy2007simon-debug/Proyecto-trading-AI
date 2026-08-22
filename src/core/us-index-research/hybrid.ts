import { createAdx, createRsi } from "@/core/indicators";
import type { Candle } from "@/core/market-data/types";
import { swingTurnoverCost, swingTurnoverCostFlat, type CostScenario } from "@/core/us-index-research/cost-model";

/**
 * Block 8.3, Family 5 — Hybrid Momentum-Contrarian.
 *
 * HYPOTHESIS: a single, ex-ante (never retrospectively chosen) rule
 * switches between two well-known but usually mutually-exclusive
 * behaviors — momentum in a trending regime, mean-reversion in a
 * range-bound one — and this combination performs more consistently
 * across regimes than either sub-strategy run unconditionally on its
 * own (the same "regime dictates which effect is live" logic
 * `docs/BLOCK5_STRATEGY_DISCOVERY_REPORT.md`'s Family H already
 * validated conceptually, applied here to a single-index long/cash
 * construction instead of that block's pairs/cross-asset shape).
 *
 * Regime classification (simple, reproducible, NO ML): ADX(14) >=
 * `adxTrendThreshold` => TREND_REGIME, else RANGE_REGIME — exactly ONE
 * classifier, computed once. Exactly TWO subsignals, both already
 * tested/reused indicators:
 *   - TREND_REGIME: momentum — long if `rocLookbackDays`-day rate of
 *     change is positive, else flat.
 *   - RANGE_REGIME: contrarian — long if RSI(14) < `contrarianRsiLow`
 *     (oversold bounce), flat once RSI recovers above `contrarianRsiHigh`.
 * Long/cash only. CAUSAL, ONE-DAY-LAG (same convention as
 * `vol-target.ts`/`trend-pullback.ts`): today's position is decided
 * from yesterday's close-of-day readings.
 */
export interface HybridConfig {
  adxPeriod: number;
  adxTrendThreshold: number;
  rocLookbackDays: number;
  contrarianRsiLow: number;
  contrarianRsiHigh: number;
}

export interface HybridDayResult {
  date: string;
  regime: "TREND_REGIME" | "RANGE_REGIME" | undefined;
  inPosition: boolean;
  grossReturn: number;
  costDrag: number;
  netReturn: number;
  turnover: number;
}

export function runHybridBacktest(candles: readonly Candle[], config: HybridConfig, scenario: CostScenario, flatCostBpsOverride?: number): HybridDayResult[] {
  const adx = createAdx(config.adxPeriod).compute(candles);
  const adxByTs = new Map(adx.map((v) => [v.timestamp, v.adx]));
  const rsi = createRsi(14).compute(candles);
  const rsiByTs = new Map(rsi.map((v) => [v.timestamp, v.value]));

  interface Reading {
    date: string;
    close: number;
    regime: "TREND_REGIME" | "RANGE_REGIME" | undefined;
    rocPositive: boolean | undefined;
    rsi: number | undefined;
  }
  const readings: Reading[] = candles.map((c, i) => {
    const adxValue = adxByTs.get(c.timestamp);
    const regime = adxValue === undefined ? undefined : adxValue >= config.adxTrendThreshold ? "TREND_REGIME" : "RANGE_REGIME";
    const pastClose = i >= config.rocLookbackDays ? candles[i - config.rocLookbackDays].close : undefined;
    return {
      date: c.timestamp.slice(0, 10),
      close: c.close,
      regime,
      rocPositive: pastClose !== undefined ? c.close > pastClose : undefined,
      rsi: rsiByTs.get(c.timestamp),
    };
  });

  const results: HybridDayResult[] = [];
  let inPosition = false;
  let previousPositionFlag = 0;

  for (let i = 1; i < readings.length; i++) {
    const prior = readings[i - 1];
    const today = readings[i];
    const dailyReturn = today.close / prior.close - 1;

    if (prior.regime === "TREND_REGIME") {
      inPosition = prior.rocPositive === true;
    } else if (prior.regime === "RANGE_REGIME" && prior.rsi !== undefined) {
      if (!inPosition && prior.rsi < config.contrarianRsiLow) inPosition = true;
      else if (inPosition && prior.rsi > config.contrarianRsiHigh) inPosition = false;
      // else: hold whatever the prior state was — contrarian is a hold-until-exit-signal rule, not re-evaluated to flat every bar.
    } else if (prior.regime === undefined) {
      inPosition = false; // still in indicator warmup — no signal, never fabricated
    }

    const positionFlag = inPosition ? 1 : 0;
    const turnover = Math.abs(positionFlag - previousPositionFlag);
    const costDrag = flatCostBpsOverride !== undefined ? swingTurnoverCostFlat(turnover, flatCostBpsOverride) : swingTurnoverCost(turnover, scenario);
    const grossReturn = positionFlag * dailyReturn;

    results.push({ date: today.date, regime: prior.regime, inPosition, grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover });
    previousPositionFlag = positionFlag;
  }
  return results;
}

export interface HybridAttribution {
  contributionMomentumPct: number;
  contributionContrarianPct: number;
  switchingFrequency: number;
}

/** Recomputes the momentum/contrarian return attribution + regime-switch count for an already-run result set — kept separate from `runHybridBacktest` so callers that only need metrics don't have to re-run the backtest, and so the attribution logic is independently testable. */
export function computeHybridAttribution(candles: readonly Candle[], config: HybridConfig, results: readonly HybridDayResult[]): HybridAttribution {
  let momentum = 0;
  let contrarian = 0;
  let switches = 0;
  let lastRegime: HybridDayResult["regime"];
  for (const r of results) {
    if (r.regime !== undefined && r.regime !== lastRegime) {
      if (lastRegime !== undefined) switches += 1;
      lastRegime = r.regime;
    }
    if (r.inPosition && r.regime === "TREND_REGIME") momentum += r.netReturn;
    if (r.inPosition && r.regime === "RANGE_REGIME") contrarian += r.netReturn;
  }
  return { contributionMomentumPct: momentum * 100, contributionContrarianPct: contrarian * 100, switchingFrequency: results.length > 0 ? (switches / results.length) * 100 : 0 };
}
