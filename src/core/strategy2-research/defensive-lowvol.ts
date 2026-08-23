import type { Candle } from "@/core/market-data/types";
import { SWING_ROUND_TRIP_BPS, type CostScenario } from "@/core/us-index-research/cost-model";
import { alignByDate } from "@/core/strategy2-research/multi-asset";
import type { Strategy2DayResult } from "@/core/strategy2-research/types";

const TICKERS = ["SPY", "QQQ", "IWM", "DIA"] as const;

function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

function trailingRealizedVol(returns: readonly number[], endIndexExclusive: number, lookback: number): number | undefined {
  if (endIndexExclusive < lookback) return undefined;
  return stdev(returns.slice(endIndexExclusive - lookback, endIndexExclusive));
}

function trailingBeta(assetReturns: readonly number[], basketReturns: readonly number[], endIndexExclusive: number, lookback: number): number | undefined {
  if (endIndexExclusive < lookback) return undefined;
  const a = assetReturns.slice(endIndexExclusive - lookback, endIndexExclusive);
  const b = basketReturns.slice(endIndexExclusive - lookback, endIndexExclusive);
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - meanA) * (b[i] - meanB);
    varB += (b[i] - meanB) ** 2;
  }
  if (varB === 0) return undefined;
  return cov / varB;
}

function monthOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export type DefensiveTiltRanking = "REALIZED_VOL" | "BETA";

/**
 * Block 9.x, Family F — F-A/F-B: monthly rebalance, long the 2-of-4
 * lowest-ranked {SPY, QQQ, IWM, DIA} by trailing realized vol (F-A,
 * 20-trading-day lookback) or trailing beta vs an equal-weight basket
 * of all 4 (F-B, 60-trading-day lookback), equal-weighted between the
 * two selected. Pre-registration §4 — lookback windows fixed before
 * any data was examined, not tuned. CAUSAL BY CONSTRUCTION: the
 * ranking used to set month M's weights is computed from returns
 * strictly BEFORE month M's first trading day (index < the rebalance
 * day), never including it.
 */
export function runDefensiveTiltBacktest(
  candlesByTicker: Readonly<Record<(typeof TICKERS)[number], readonly Candle[]>>,
  ranking: DefensiveTiltRanking,
  scenario: CostScenario,
): Strategy2DayResult[] {
  const aligned = alignByDate(candlesByTicker);
  const dates = aligned.SPY.map((c) => c.timestamp.slice(0, 10));
  const returnsByTicker: Record<string, number[]> = {};
  for (const t of TICKERS) {
    const series = aligned[t];
    returnsByTicker[t] = series.map((c, i) => (i === 0 ? 0 : c.close / series[i - 1].close - 1));
  }
  const basketReturns = dates.map((_, i) => TICKERS.reduce((s, t) => s + returnsByTicker[t][i], 0) / TICKERS.length);

  const lookback = ranking === "REALIZED_VOL" ? 20 : 60;
  const roundTripFraction = SWING_ROUND_TRIP_BPS[scenario] / 10_000;

  const results: Strategy2DayResult[] = [];
  let currentWeights: Record<string, number> = { SPY: 0, QQQ: 0, IWM: 0, DIA: 0 };

  for (let i = 1; i < dates.length; i++) {
    const isFirstTradingDayOfMonth = monthOf(dates[i]) !== monthOf(dates[i - 1]);

    if (isFirstTradingDayOfMonth) {
      const scored = TICKERS.map((t) => ({
        ticker: t,
        score: ranking === "REALIZED_VOL" ? trailingRealizedVol(returnsByTicker[t], i, lookback) : trailingBeta(returnsByTicker[t], basketReturns, i, lookback),
      }));
      const ready = scored.every((s) => s.score !== undefined);
      if (ready) {
        const sorted = [...scored].sort((a, b) => (a.score as number) - (b.score as number));
        const selected = new Set(sorted.slice(0, 2).map((s) => s.ticker));
        const newWeights: Record<string, number> = { SPY: 0, QQQ: 0, IWM: 0, DIA: 0 };
        for (const t of TICKERS) newWeights[t] = selected.has(t) ? 0.5 : 0;

        const turnover = TICKERS.reduce((s, t) => s + Math.abs(newWeights[t] - currentWeights[t]), 0);
        const costDrag = swingCostForTurnover(turnover, roundTripFraction);
        const grossReturn = TICKERS.reduce((s, t) => s + currentWeights[t] * returnsByTicker[t][i], 0); // today's return still earned at OLD weights (rebalance happens at today's close, using data through yesterday)
        results.push({ date: dates[i], grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover });
        currentWeights = newWeights;
        continue;
      }
    }

    const grossReturn = TICKERS.reduce((s, t) => s + currentWeights[t] * returnsByTicker[t][i], 0);
    results.push({ date: dates[i], grossReturn, costDrag: 0, netReturn: grossReturn, turnover: 0 });
  }
  return results;
}

function swingCostForTurnover(turnoverUnits: number, roundTripFractionPerUnit: number): number {
  return turnoverUnits * roundTripFractionPerUnit;
}

/** F-C/F-D — long-only, unconditional, a single listed low-vol factor ETF (USMV or SPLV). No in-house ranking, no ongoing turnover beyond the one-time entry (negligible over a multi-year series). */
export function runStaticLongOnlyBacktest(candles: readonly Candle[]): Strategy2DayResult[] {
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const results: Strategy2DayResult[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const grossReturn = sorted[i].close / sorted[i - 1].close - 1;
    results.push({ date: sorted[i].timestamp.slice(0, 10), grossReturn, costDrag: 0, netReturn: grossReturn, turnover: 0 });
  }
  return results;
}
