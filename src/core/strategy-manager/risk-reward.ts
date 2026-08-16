/**
 * Default minimum acceptable risk:reward ratio for any BUY/SELL signal.
 * A research-phase starting point, NOT claimed to be optimal — subject
 * to revision once backtesting exists. Individual strategies may
 * override it via their own `minimumRiskReward` parameter.
 */
export const DEFAULT_MINIMUM_RISK_REWARD = 1.5;

/**
 * Risk:reward ratio for a proposed trade. Returns 0 (never negative,
 * never NaN) when `entry === stopLoss`, since a zero-risk "trade" can't
 * have a meaningful reward ratio — callers should treat 0 as "reject",
 * same as any ratio below their minimum.
 */
export function computeRiskReward(entry: number, stopLoss: number, takeProfit: number): number {
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  return risk > 0 ? reward / risk : 0;
}
