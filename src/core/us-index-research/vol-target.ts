import { swingTurnoverCost, swingTurnoverCostFlat, type CostScenario } from "@/core/us-index-research/cost-model";
import { buildDailyReturnSeries } from "@/core/us-index-research/daily-series";
import type { UsIndexDailyBar } from "@/core/us-index-research/types";

/**
 * Block 8.3, Family 1 — Volatility-Managed Equity Exposure.
 *
 * HYPOTHESIS: scaling exposure to a single long ETF position between 0%
 * and 100% so that EXPECTED (trailing-realized) volatility stays near a
 * fixed target improves risk-adjusted return (higher Sharpe/Sortino,
 * shallower drawdown) versus static buy-and-hold, at some cost to raw
 * CAGR — the well-documented "volatility-managed portfolios" effect
 * (Moreira & Muir 2017, "Volatility-Managed Portfolios", Journal of
 * Finance). This is explicitly NOT a directional market-timing claim —
 * exposure never exceeds 100% and never goes short; it only asks "how
 * much of the SAME long position to hold," never "which direction."
 *
 * CAUSAL BY CONSTRUCTION: exposure for day `i` is decided from the
 * trailing-vol reading AS OF THE CLOSE OF DAY `i-1` (i.e.
 * `points[i-1].trailingRealizedVolPct`/`trailingAtrVolPct`) — never
 * `points[i]`'s own reading, which would require knowing day `i`'s
 * close before the day happened. `no-lookahead.test.ts` checks this
 * explicitly. Position changes are charged the SWING cost tier
 * (`cost-model.ts`) only on days exposure actually changes — a
 * no-change day pays nothing, matching how a real vol-target overlay
 * would only trade when its target moves.
 */
export type VolProxy = "REALIZED" | "ATR";

export interface VolTargetConfig {
  targetVolPct: number;
  volLookbackDays: number;
  volProxy: VolProxy;
  /** Never >1 in this round's first pass — see the brief's explicit "no >100% exposure inicialmente" instruction. */
  maxExposure: number;
}

export interface VolTargetDayResult {
  date: string;
  exposure: number;
  grossReturn: number;
  costDrag: number;
  netReturn: number;
  /** |exposure[i] - exposure[i-1]| — the turnover unit cost is charged against. */
  turnover: number;
}

export function runVolTargetBacktest(bars: readonly UsIndexDailyBar[], config: VolTargetConfig, scenario: CostScenario, flatCostBpsOverride?: number): VolTargetDayResult[] {
  const points = buildDailyReturnSeries(bars, config.volLookbackDays);
  const results: VolTargetDayResult[] = [];
  let previousExposure = 0;

  for (let i = 0; i < points.length; i++) {
    const dailyReturn = points[i].dailyReturn;
    if (dailyReturn === undefined) continue;

    // Causal: the vol reading that decides TODAY's exposure comes from
    // YESTERDAY's point (index i-1), never today's own.
    const priorVol = i > 0 ? (config.volProxy === "REALIZED" ? points[i - 1].trailingRealizedVolPct : points[i - 1].trailingAtrVolPct) : undefined;
    if (priorVol === undefined) continue; // still in warmup — no position, not fabricated as flat/0 exposure with a real signal

    const exposure = priorVol > 0 ? Math.min(config.maxExposure, config.targetVolPct / priorVol) : config.maxExposure;
    const turnover = Math.abs(exposure - previousExposure);
    const costDrag = flatCostBpsOverride !== undefined ? swingTurnoverCostFlat(turnover, flatCostBpsOverride) : swingTurnoverCost(turnover, scenario);
    const grossReturn = exposure * dailyReturn;

    results.push({ date: points[i].date, exposure, grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover });
    previousExposure = exposure;
  }
  return results;
}

export interface VolTargetSummary {
  daysTraded: number;
  averageExposure: number;
  timeInMarketPct: number;
  averageTurnoverPerDay: number;
}

export function summarizeVolTarget(results: readonly VolTargetDayResult[]): VolTargetSummary {
  const n = results.length;
  if (n === 0) return { daysTraded: 0, averageExposure: 0, timeInMarketPct: 0, averageTurnoverPerDay: 0 };
  const averageExposure = results.reduce((s, r) => s + r.exposure, 0) / n;
  const timeInMarketPct = (results.filter((r) => r.exposure > 0.01).length / n) * 100;
  const averageTurnoverPerDay = results.reduce((s, r) => s + r.turnover, 0) / n;
  return { daysTraded: n, averageExposure, timeInMarketPct, averageTurnoverPerDay };
}

/** Downside capture: mean(strategy return | benchmark return < 0) / mean(benchmark return | benchmark return < 0) * 100 — the specific metric §6 of the brief calls out ("¿reduce drawdown sin destruir excesivamente retorno?"). `undefined` if there are no down days in the benchmark, or its mean is ~0. */
export function computeDownsideCapturePct(strategyReturns: readonly number[], benchmarkReturns: readonly number[]): number | undefined {
  const n = Math.min(strategyReturns.length, benchmarkReturns.length);
  const downStrategy: number[] = [];
  const downBenchmark: number[] = [];
  for (let i = 0; i < n; i++) {
    if (benchmarkReturns[i] < 0) {
      downStrategy.push(strategyReturns[i]);
      downBenchmark.push(benchmarkReturns[i]);
    }
  }
  if (downBenchmark.length === 0) return undefined;
  const meanS = downStrategy.reduce((s, v) => s + v, 0) / downStrategy.length;
  const meanB = downBenchmark.reduce((s, v) => s + v, 0) / downBenchmark.length;
  if (Math.abs(meanB) < 1e-9) return undefined;
  return (meanS / meanB) * 100;
}
