import type { Candle } from "@/core/market-data/types";
import type { SameCandlePolicy } from "@/core/backtesting/types";

export interface OpenPositionLevels {
  direction: "BUY" | "SELL";
  stopLoss: number;
  takeProfit?: number;
}

export interface IntrabarExitResult {
  exitPrice: number;
  exitReason: "STOP_LOSS" | "TAKE_PROFIT";
  /** True when this bar's OHLC touched BOTH stopLoss and takeProfit — genuinely can't be known which came first from OHLC alone. */
  ambiguous: boolean;
}

/**
 * Resolves whether `candle` closes out an open position via its stop
 * loss or take profit, and — critically — what to do when BOTH levels
 * fall within the bar's [low, high] range. OHLC data can never reveal
 * which was actually touched first intrabar; this function never
 * silently assumes the favorable outcome. `CONSERVATIVE` (the required
 * default) always resolves an ambiguous bar to the UNFAVORABLE exit;
 * `OPTIMISTIC` always resolves it to the favorable one. Every ambiguous
 * bar is flagged via `ambiguous: true` regardless of policy, so results
 * remain auditable no matter which policy produced them.
 *
 * Returns `null` when neither level was touched (position stays open).
 */
export function resolveIntrabarExit(
  position: OpenPositionLevels,
  candle: Candle,
  policy: SameCandlePolicy,
): IntrabarExitResult | null {
  const stopHit =
    position.direction === "BUY" ? candle.low <= position.stopLoss : candle.high >= position.stopLoss;
  const targetHit =
    position.takeProfit !== undefined &&
    (position.direction === "BUY" ? candle.high >= position.takeProfit : candle.low <= position.takeProfit);

  if (stopHit && targetHit) {
    const favorsStop = policy === "CONSERVATIVE";
    return {
      exitPrice: favorsStop ? position.stopLoss : position.takeProfit!,
      exitReason: favorsStop ? "STOP_LOSS" : "TAKE_PROFIT",
      ambiguous: true,
    };
  }
  if (stopHit) {
    return { exitPrice: position.stopLoss, exitReason: "STOP_LOSS", ambiguous: false };
  }
  if (targetHit) {
    return { exitPrice: position.takeProfit!, exitReason: "TAKE_PROFIT", ambiguous: false };
  }
  return null;
}
