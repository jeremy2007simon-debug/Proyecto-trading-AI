import { computeBacktestMetrics } from "@/core/backtesting/metrics";
import type { BacktestMetrics, BacktestTrade } from "@/core/backtesting/types";
import type { Candle } from "@/core/market-data/types";

/**
 * Buy the first candle's close, hold to the last candle's close — a
 * single conceptual "trade" with NO stop loss, NO risk management, and
 * 100% time exposure. Provided as a comparison baseline (point 25), NOT
 * as a metrics-compatible peer of the risk-managed strategies: R-multiple
 * has no meaning without a defined stop (`pnlR` is fixed at 0 here,
 * `stopLoss` is a placeholder equal to entry), so `averageR`,
 * `expectancyR`, `profitFactor`, `winRate` etc. on this result are
 * degenerate and must never be presented next to a real strategy's
 * without that caveat — only `netProfit`/`returnPct`/`maxDrawdownPct`
 * are meaningfully comparable.
 */
export function computeBuyAndHoldBaseline(candles: readonly Candle[], initialCapital: number): BacktestMetrics {
  if (candles.length === 0) {
    return computeBacktestMetrics([], initialCapital, new Date(0).toISOString(), new Date(0).toISOString());
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const units = initialCapital / first.close;
  const pnlAmount = units * (last.close - first.close);

  const trade: BacktestTrade = {
    id: crypto.randomUUID(),
    market: first.market,
    timeframe: first.timeframe,
    direction: "BUY",
    entryPrice: first.close,
    stopLoss: first.close, // placeholder — no real stop for buy & hold, see doc comment above
    exitPrice: last.close,
    entryAt: first.timestamp,
    exitAt: last.timestamp,
    exitReason: "TIME_EXIT",
    ambiguousIntrabarExit: false,
    positionSize: units,
    riskAmount: 0, // undefined risk basis — see doc comment above
    grossPnlAmount: pnlAmount,
    pnlAmount,
    pnlR: 0, // undefined risk basis — see doc comment above
    commissionPaid: 0,
    slippagePaid: 0,
    entrySlippageAmount: 0,
    entrySpreadAmount: 0,
    exitSlippageAmount: 0,
    exitSpreadAmount: 0,
    rulesTriggered: [],
  };

  return computeBacktestMetrics([trade], initialCapital, first.timestamp, last.timestamp);
}
