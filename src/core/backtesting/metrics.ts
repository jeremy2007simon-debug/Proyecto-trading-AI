import { getEasternWallClockParts } from "@/core/market-hours/nyse-calendar";
import { classifySampleQuality } from "@/core/backtesting/sample-quality";
import type { BacktestMetrics, BacktestTrade } from "@/core/backtesting/types";
import type { MarketRegime } from "@/core/market-regime/types";

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** See the Sortino fix note below — a stdev of R-multiples below this is floating-point noise, not real variance. */
const MIN_MEANINGFUL_STDEV = 1e-6;

function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function maxConsecutive(trades: readonly BacktestTrade[], predicate: (t: BacktestTrade) => boolean): number {
  let max = 0;
  let current = 0;
  for (const trade of trades) {
    if (predicate(trade)) {
      current += 1;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

/**
 * Max drawdown over the equity curve implied by replaying `trades` in
 * chronological order from `initialCapital`. Returns both the % and the
 * absolute $ amount, each measured against the peak equity at the time
 * of the drawdown (not against `initialCapital`), which is the standard
 * convention.
 */
function computeMaxDrawdown(
  trades: readonly BacktestTrade[],
  initialCapital: number,
): { pct: number; amount: number } {
  let equity = initialCapital;
  let peak = initialCapital;
  let maxDrawdownAmount = 0;
  let maxDrawdownPct = 0;

  for (const trade of trades) {
    equity += trade.pnlAmount ?? 0;
    peak = Math.max(peak, equity);
    const drawdownAmount = peak - equity;
    const drawdownPct = peak > 0 ? (drawdownAmount / peak) * 100 : 0;
    maxDrawdownAmount = Math.max(maxDrawdownAmount, drawdownAmount);
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
  }

  return { pct: maxDrawdownPct, amount: maxDrawdownAmount };
}

function isWithinRegularHoursSubWindow(entryAt: string, windowStartMin: number, windowEndMin: number): boolean {
  const parts = getEasternWallClockParts(new Date(entryAt));
  const minuteOfDay = parts.hour * 60 + parts.minute;
  return minuteOfDay >= windowStartMin && minuteOfDay < windowEndMin;
}

const REGULAR_START_MIN = 9 * 60 + 30; // 09:30
const REGULAR_END_MIN = 16 * 60; // 16:00
const OPENING_END_MIN = REGULAR_START_MIN + 60; // 10:30
const CLOSING_START_MIN = REGULAR_END_MIN - 60; // 15:00

/**
 * Computes the full metrics set (point 12) for a list of CLOSED trades.
 * `includeBreakdowns=false` computes only the top-level numbers, used
 * internally when computing each `performanceByX` bucket's own metrics
 * — a bucket's metrics never contain a further nested breakdown of
 * itself, which would be both pointless and unboundedly expensive given
 * `BacktestMetrics` is self-referential by design (point 14/15/16).
 */
export function computeBacktestMetrics(
  trades: readonly BacktestTrade[],
  initialCapital: number,
  periodStart: string,
  periodEnd: string,
  includeBreakdowns = true,
): BacktestMetrics {
  const pnlAmounts = trades.map((t) => t.pnlAmount ?? 0);
  const pnlRs = trades.map((t) => t.pnlR ?? 0);
  const winners = trades.filter((t) => (t.pnlAmount ?? 0) > 0);
  const losers = trades.filter((t) => (t.pnlAmount ?? 0) < 0);

  const averageWin = mean(winners.map((t) => t.pnlAmount ?? 0));
  const averageLoss = mean(losers.map((t) => t.pnlAmount ?? 0)); // signed (negative), or 0 if no losers
  const grossProfit = winners.reduce((sum, t) => sum + (t.pnlAmount ?? 0), 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.pnlAmount ?? 0), 0));

  const netProfit = pnlAmounts.reduce((sum, v) => sum + v, 0);
  const drawdown = computeMaxDrawdown(trades, initialCapital);

  const periodMs = new Date(periodEnd).getTime() - new Date(periodStart).getTime();
  const periodDays = periodMs > 0 ? periodMs / 86_400_000 : 0;
  const periodMonths = periodDays / 30.44;

  const holdingTimesMs = trades
    .filter((t) => t.exitAt)
    .map((t) => new Date(t.exitAt!).getTime() - new Date(t.entryAt).getTime());
  const totalHoldingTimeMs = holdingTimesMs.reduce((sum, v) => sum + v, 0);

  const rReturns = pnlRs;
  const downsideReturns = rReturns.filter((r) => r < 0);
  const sharpeDenominator = stdev(rReturns);
  const sortinoDenominator = stdev(downsideReturns);

  const metrics: BacktestMetrics = {
    totalTrades: trades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: trades.length > 0 ? winners.length / trades.length : 0,
    averageWin,
    averageLoss,
    averageR: mean(pnlRs),
    medianR: median(pnlRs),
    // Documented approximation: RR here is |averageWin / averageLoss|,
    // not the per-trade planned risk:reward the strategy proposed.
    riskRewardRatio: averageLoss !== 0 ? Math.abs(averageWin / averageLoss) : 0,
    // 0 when there are no losing trades to divide by (avoids Infinity).
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
    expectancy: mean(pnlAmounts),
    // Mathematically equal to `averageR` (expectancy in R IS the mean R
    // by definition) — kept as its own explicitly-named field because
    // the spec calls for "expectancy in R" as a primary, clearly-labeled
    // metric, not because it's a different computation.
    expectancyR: mean(pnlRs),
    maxDrawdownPct: drawdown.pct,
    maxDrawdownAmount: drawdown.amount,
    netProfit,
    returnPct: initialCapital > 0 ? (netProfit / initialCapital) * 100 : 0,
    // Simplified per-trade Sharpe/Sortino: mean(R) / stdev(R) over the
    // trade sequence, UNANNUALIZED — not the classical daily-return
    // Sharpe ratio. Documented approximation, undefined (not fabricated
    // as 0) when there are fewer than 2 trades or zero variance.
    //
    // Block 4.5 fix: the denominator is compared against
    // MIN_MEANINGFUL_STDEV, not exact zero. R-multiples are O(1), so a
    // standard deviation below 1e-6 is floating-point noise, not a real
    // signal — e.g. a zero-cost run where nearly every losing trade
    // closes at exactly -1.00R can produce a `downsideReturns` stdev of
    // ~1e-13 instead of exact 0, and dividing by that produced absurd
    // values (observed: -2.65e15) in the Block 4 report. When downside
    // deviation is ~0, Sortino is undefined — there is no meaningful
    // variance to normalize by, never an extreme ratio.
    sharpeRatio: trades.length >= 2 && sharpeDenominator > 0 ? mean(rReturns) / sharpeDenominator : undefined,
    sortinoRatio:
      trades.length >= 2 && downsideReturns.length > 0 && sortinoDenominator > MIN_MEANINGFUL_STDEV
        ? mean(rReturns) / sortinoDenominator
        : undefined,
    consecutiveWins: maxConsecutive(trades, (t) => (t.pnlAmount ?? 0) > 0),
    consecutiveLosses: maxConsecutive(trades, (t) => (t.pnlAmount ?? 0) < 0),
    exposurePct: periodMs > 0 ? (totalHoldingTimeMs / periodMs) * 100 : 0,
    tradesPerMonth: periodMonths > 0 ? trades.length / periodMonths : trades.length,
    averageHoldingTimeMs: mean(holdingTimesMs),
    sampleQuality: classifySampleQuality(trades.length),
    performanceByRegime: {},
    performanceByStrategy: {},
    performanceByHour: {},
    performanceByWeekday: {},
    performanceByMonth: {},
    performanceBySession: {},
  };

  if (!includeBreakdowns) return metrics;

  metrics.performanceByRegime = groupMetricsByRegime(trades, initialCapital, periodStart, periodEnd);
  metrics.performanceByStrategy = groupMetricsByStrategy(trades, initialCapital, periodStart, periodEnd);
  metrics.performanceByHour = groupMetricsByHour(trades, initialCapital, periodStart, periodEnd);
  metrics.performanceByWeekday = groupMetricsByWeekday(trades, initialCapital, periodStart, periodEnd);
  metrics.performanceByMonth = groupMetricsByMonth(trades, initialCapital, periodStart, periodEnd);
  metrics.performanceBySession = groupMetricsBySession(trades, initialCapital, periodStart, periodEnd);

  return metrics;
}

function groupBy<T, K extends string | number>(items: readonly T[], keyFn: (item: T) => K | undefined): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (key === undefined) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export function groupMetricsByRegime(
  trades: readonly BacktestTrade[],
  initialCapital: number,
  periodStart: string,
  periodEnd: string,
): Partial<Record<MarketRegime, BacktestMetrics>> {
  const groups = groupBy(trades, (t) => t.marketRegimeAtEntry);
  const result: Partial<Record<MarketRegime, BacktestMetrics>> = {};
  for (const [regime, groupTrades] of groups) {
    result[regime] = computeBacktestMetrics(groupTrades, initialCapital, periodStart, periodEnd, false);
  }
  return result;
}

export function groupMetricsByStrategy(
  trades: readonly BacktestTrade[],
  initialCapital: number,
  periodStart: string,
  periodEnd: string,
): Record<string, BacktestMetrics> {
  const groups = groupBy(trades, (t) => t.strategyId);
  const result: Record<string, BacktestMetrics> = {};
  for (const [strategyId, groupTrades] of groups) {
    result[strategyId] = computeBacktestMetrics(groupTrades, initialCapital, periodStart, periodEnd, false);
  }
  return result;
}

export function groupMetricsByHour(
  trades: readonly BacktestTrade[],
  initialCapital: number,
  periodStart: string,
  periodEnd: string,
): Record<number, BacktestMetrics> {
  const groups = groupBy(trades, (t) => getEasternWallClockParts(new Date(t.entryAt)).hour);
  const result: Record<number, BacktestMetrics> = {};
  for (const [hour, groupTrades] of groups) {
    result[hour] = computeBacktestMetrics(groupTrades, initialCapital, periodStart, periodEnd, false);
  }
  return result;
}

export function groupMetricsByWeekday(
  trades: readonly BacktestTrade[],
  initialCapital: number,
  periodStart: string,
  periodEnd: string,
): Record<number, BacktestMetrics> {
  const groups = groupBy(trades, (t) => getEasternWallClockParts(new Date(t.entryAt)).weekday);
  const result: Record<number, BacktestMetrics> = {};
  for (const [weekday, groupTrades] of groups) {
    result[weekday] = computeBacktestMetrics(groupTrades, initialCapital, periodStart, periodEnd, false);
  }
  return result;
}

export function groupMetricsByMonth(
  trades: readonly BacktestTrade[],
  initialCapital: number,
  periodStart: string,
  periodEnd: string,
): Record<string, BacktestMetrics> {
  const groups = groupBy(trades, (t) => {
    const parts = getEasternWallClockParts(new Date(t.entryAt));
    return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  });
  const result: Record<string, BacktestMetrics> = {};
  for (const [monthKey, groupTrades] of groups) {
    result[monthKey] = computeBacktestMetrics(groupTrades, initialCapital, periodStart, periodEnd, false);
  }
  return result;
}

/** OPENING = first 60 min of RTH, CLOSING = last 60 min, MIDDAY = the rest. Trades entered outside RTH (shouldn't normally happen) are excluded from all three buckets. */
export function groupMetricsBySession(
  trades: readonly BacktestTrade[],
  initialCapital: number,
  periodStart: string,
  periodEnd: string,
): Partial<Record<"OPENING" | "MIDDAY" | "CLOSING", BacktestMetrics>> {
  const groups = groupBy(trades, (t): "OPENING" | "MIDDAY" | "CLOSING" | undefined => {
    if (isWithinRegularHoursSubWindow(t.entryAt, REGULAR_START_MIN, OPENING_END_MIN)) return "OPENING";
    if (isWithinRegularHoursSubWindow(t.entryAt, CLOSING_START_MIN, REGULAR_END_MIN)) return "CLOSING";
    if (isWithinRegularHoursSubWindow(t.entryAt, OPENING_END_MIN, CLOSING_START_MIN)) return "MIDDAY";
    return undefined;
  });
  const result: Partial<Record<"OPENING" | "MIDDAY" | "CLOSING", BacktestMetrics>> = {};
  for (const [session, groupTrades] of groups) {
    result[session] = computeBacktestMetrics(groupTrades, initialCapital, periodStart, periodEnd, false);
  }
  return result;
}
