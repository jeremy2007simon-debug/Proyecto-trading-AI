import type { Candle } from "@/core/market-data/types";

/**
 * Block 5, Family F — Relative Strength / cross-sectional rotation.
 * HYPOTHESIS: rotating monthly into the asset (among SPY/QQQ/IWM/DIA)
 * with the strongest trailing total return captures persistent momentum
 * that a single buy-and-hold position doesn't. Not a claim of
 * profitability — pending the Block 5 validation funnel.
 *
 * Deliberately a SEPARATE, small, dedicated backtest function rather
 * than shoehorned into the `Strategy`/event-driven-simulator interface:
 * rotation has no stop-loss/take-profit/R-multiple — it's a periodic
 * reallocation of 100% of capital, which the trade-based engine has no
 * concept of. Reuses the SAME peak-drawdown and mean/stdev conventions
 * `metrics.ts` uses (not its private helpers directly, since those
 * operate on `BacktestTrade[]`, not a monthly equity curve) — documented
 * explicitly so this isn't read as a second, hidden backtest engine.
 */

export interface RelativeStrengthAssetInput {
  market: string;
  /** Daily candles, chronologically sorted. Only the calendar-month-end close of each is used. */
  candles: readonly Candle[];
}

export interface RelativeStrengthConfig {
  /** Trailing months of total return used to rank assets at each rebalance. */
  lookbackMonths: number;
  /** Which asset's own buy-and-hold return to compare against. */
  benchmarkMarket: string;
  /** Round-trip cost, in bps of notional, charged ONLY on months where the selected asset differs from the previous period (a genuine rebalance) — 0 (the default) models frictionless rotation. This is Block 5's cost-sensitivity axis for this family: rotation has no per-trade slippage/spread in the trade-based sense, so turnover cost is the honest equivalent. */
  rebalanceCostBps?: number;
}

export interface RelativeStrengthPeriod {
  /** Calendar month (YYYY-MM) the decision was made at the end of. */
  decisionMonth: string;
  /** Calendar month (YYYY-MM) whose return was realized by holding the selected asset. */
  holdMonth: string;
  /** `undefined` when no asset had enough history to rank at this rebalance — that month realizes 0% (cash), never fabricated. */
  selectedMarket: string | undefined;
  periodReturnPct: number;
}

export interface EquityPoint {
  month: string;
  equity: number;
}

export interface RelativeStrengthRunResult {
  periods: RelativeStrengthPeriod[];
  strategyEquityCurve: EquityPoint[];
  benchmarkEquityCurve: EquityPoint[];
  equalWeightEquityCurve: EquityPoint[];
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  /** Mean(monthly return) / stdev(monthly return) — documented as monthly and UNANNUALIZED, same simplified-ratio convention `metrics.ts` uses for per-trade Sharpe. `undefined` with fewer than 2 periods or zero variance. */
  sharpeRatio: number | undefined;
  monthsTraded: number;
}

/** Exported additively (Block 6) so `benchmarks.ts` and other monthly-series consumers share the SAME month-bucketing convention instead of re-deriving it. */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Keeps the LAST candle seen for each calendar month — `candles` must already be chronologically sorted. Exported additively (Block 6) — see `monthKey`. */
export function buildMonthlyCloses(candles: readonly Candle[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const candle of candles) map.set(monthKey(candle.timestamp), candle.close);
  return map;
}

function periodReturn(series: Map<string, number>, fromMonth: string, toMonth: string): number | undefined {
  const from = series.get(fromMonth);
  const to = series.get(toMonth);
  if (from === undefined || to === undefined || from <= 0) return undefined;
  return (to - from) / from;
}

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

function buildEquityCurveMetrics(equityCurve: readonly EquityPoint[]): { maxDrawdownPct: number } {
  let peak = 1;
  let maxDrawdownPct = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    const drawdownPct = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
  }
  return { maxDrawdownPct };
}

/**
 * Monthly rotation among `assets`: at the close of each month (from
 * `lookbackMonths` months in), ranks every asset by its trailing
 * `lookbackMonths` total return using ONLY data up to and including that
 * month — never a future month — and holds the single best-ranked asset
 * through the following month. Compares against a pure buy-and-hold of
 * `config.benchmarkMarket` and an equal-weight blend of all `assets`,
 * computed over the exact same set of months.
 */
export function runRelativeStrengthBacktest(
  assets: readonly RelativeStrengthAssetInput[],
  config: RelativeStrengthConfig,
): RelativeStrengthRunResult {
  const monthlySeriesByMarket = new Map(assets.map((a) => [a.market, buildMonthlyCloses(a.candles)]));
  const allMonths = [...new Set(assets.flatMap((a) => [...monthlySeriesByMarket.get(a.market)!.keys()]))].sort();

  const periods: RelativeStrengthPeriod[] = [];
  const strategyEquityCurve: EquityPoint[] = [];
  const benchmarkEquityCurve: EquityPoint[] = [];
  const equalWeightEquityCurve: EquityPoint[] = [];
  let strategyEquity = 1;
  let benchmarkEquity = 1;
  let equalWeightEquity = 1;
  let previousSelected: string | undefined;
  const rebalanceCostFraction = (config.rebalanceCostBps ?? 0) / 10_000;

  for (let i = config.lookbackMonths; i < allMonths.length - 1; i++) {
    const decisionMonth = allMonths[i];
    const holdMonth = allMonths[i + 1];
    const lookbackStartMonth = allMonths[i - config.lookbackMonths];

    let best: { market: string; trailingReturn: number } | undefined;
    for (const asset of assets) {
      const series = monthlySeriesByMarket.get(asset.market)!;
      const trailingReturn = periodReturn(series, lookbackStartMonth, decisionMonth);
      if (trailingReturn !== undefined && (!best || trailingReturn > best.trailingReturn)) {
        best = { market: asset.market, trailingReturn };
      }
    }

    const grossReturn = best ? (periodReturn(monthlySeriesByMarket.get(best.market)!, decisionMonth, holdMonth) ?? 0) : 0;
    const isRebalance = best?.market !== previousSelected;
    const realizedReturn = isRebalance ? grossReturn - rebalanceCostFraction : grossReturn;
    previousSelected = best?.market;
    strategyEquity *= 1 + realizedReturn;
    periods.push({ decisionMonth, holdMonth, selectedMarket: best?.market, periodReturnPct: realizedReturn * 100 });
    strategyEquityCurve.push({ month: holdMonth, equity: strategyEquity });

    const benchmarkReturn = periodReturn(monthlySeriesByMarket.get(config.benchmarkMarket)!, decisionMonth, holdMonth) ?? 0;
    benchmarkEquity *= 1 + benchmarkReturn;
    benchmarkEquityCurve.push({ month: holdMonth, equity: benchmarkEquity });

    const equalWeightReturns = assets
      .map((a) => periodReturn(monthlySeriesByMarket.get(a.market)!, decisionMonth, holdMonth))
      .filter((r): r is number => r !== undefined);
    const equalWeightReturn = mean(equalWeightReturns);
    equalWeightEquity *= 1 + equalWeightReturn;
    equalWeightEquityCurve.push({ month: holdMonth, equity: equalWeightEquity });
  }

  const monthlyReturns = periods.map((p) => p.periodReturnPct / 100);
  const returnStdev = stdev(monthlyReturns);
  const totalReturnPct = (strategyEquity - 1) * 100;
  const monthsTraded = periods.length;
  const cagrPct = monthsTraded > 0 ? (strategyEquity ** (12 / monthsTraded) - 1) * 100 : 0;

  return {
    periods,
    strategyEquityCurve,
    benchmarkEquityCurve,
    equalWeightEquityCurve,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: buildEquityCurveMetrics(strategyEquityCurve).maxDrawdownPct,
    sharpeRatio: monthlyReturns.length >= 2 && returnStdev > 1e-9 ? mean(monthlyReturns) / returnStdev : undefined,
    monthsTraded,
  };
}
