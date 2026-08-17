import { buildMonthlyCloses } from "@/core/backtesting/research/relative-strength";
import type { Candle } from "@/core/market-data/types";

/**
 * Block 6 — perfectly comparable benchmark curves (Fase 5). Every
 * function here takes an explicit, shared `months` list (RS3M's own
 * decision+hold month sequence) so every benchmark is computed over
 * EXACTLY the same start date, end date, and month transitions as the
 * candidate — never an independently-derived date range. Never mixes
 * buy-and-hold with rebalanced methodology in the same number.
 */

export interface BenchmarkAssetInput {
  market: string;
  /** Daily candles, chronologically sorted, fetched with the SAME price adjustment as the candidate (see `RS3M_CANDIDATE_V1.priceAdjustment`). */
  candles: readonly Candle[];
}

/** Single-asset buy-and-hold: monthly returns over the transitions `months[i-1] -> months[i]`. `0` (never fabricated) for a transition where either month's close is missing. */
export function computeBuyAndHoldMonthlyReturns(asset: BenchmarkAssetInput, months: readonly string[]): number[] {
  const series = buildMonthlyCloses(asset.candles);
  const returns: number[] = [];
  for (let i = 1; i < months.length; i++) {
    const from = series.get(months[i - 1]);
    const to = series.get(months[i]);
    returns.push(from !== undefined && to !== undefined && from > 0 ? ((to - from) / from) * 100 : 0);
  }
  return returns;
}

/**
 * Equal-weight, BUY-ONCE-AND-NEVER-REBALANCE blend of `assets`: invests
 * 1/N of capital in each asset at `months[0]`'s price (fixed share
 * counts from then on) and lets weights drift with price changes.
 *
 * Distinct from `runRelativeStrengthBacktest`'s own `equalWeightEquityCurve`
 * (Block 5), which rebalances back to equal weight every month — that
 * curve is already computed for free by the candidate's own engine run,
 * so it is NOT reimplemented here. Always label which of the two a
 * reported number uses; never mix them.
 */
export function computeEqualWeightBuyAndHoldMonthlyReturns(assets: readonly BenchmarkAssetInput[], months: readonly string[]): number[] {
  if (assets.length === 0 || months.length === 0) return [];
  const seriesByMarket = new Map(assets.map((a) => [a.market, buildMonthlyCloses(a.candles)]));

  const shares = new Map(
    assets.map((a) => {
      const p0 = seriesByMarket.get(a.market)!.get(months[0]);
      return [a.market, p0 !== undefined && p0 > 0 ? 1 / assets.length / p0 : 0];
    }),
  );

  function portfolioValueAt(month: string): number {
    return assets.reduce((sum, a) => {
      const price = seriesByMarket.get(a.market)!.get(month);
      return sum + (price !== undefined ? shares.get(a.market)! * price : 0);
    }, 0);
  }

  const returns: number[] = [];
  let previousValue = portfolioValueAt(months[0]);
  for (let i = 1; i < months.length; i++) {
    const currentValue = portfolioValueAt(months[i]);
    returns.push(previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0);
    previousValue = currentValue;
  }
  return returns;
}
