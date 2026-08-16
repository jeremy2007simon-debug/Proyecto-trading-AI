import type { MarketRegime } from "@/core/market-regime/types";
import type { StrategyMatrixRow } from "@/components/strategy/StrategyMatrix";

/**
 * MOCK DATA — clearly flagged so it can never be mistaken for a live
 * reading. `StrategyMatrix` owns `StrategyMatrixRow` (see that file);
 * this mock is just one producer of that same shape, same as
 * `getStrategySignals` is for real data.
 */
export const IS_MOCK_DATA = true as const;

export const mockCurrentRegime: MarketRegime = "UPTREND";

export const mockStrategyMatrixRows: StrategyMatrixRow[] = [
  {
    strategyId: "trend-following",
    strategyName: "Trend Following",
    market: "SP500",
    timeframe: "15m",
    signal: "BUY",
    weight: 0.3,
    rawScore: 68,
    currentRegime: mockCurrentRegime,
    compatibleWithCurrentRegime: true,
    enabled: true,
    winRate: 0.54,
    profitFactor: 1.42,
    sampleSize: 118,
  },
  {
    strategyId: "breakout",
    strategyName: "Breakout",
    market: "SP500",
    timeframe: "15m",
    signal: "BUY",
    weight: 0.25,
    rawScore: 55,
    currentRegime: mockCurrentRegime,
    compatibleWithCurrentRegime: true,
    enabled: true,
    winRate: 0.47,
    profitFactor: 1.21,
    sampleSize: 96,
  },
  {
    strategyId: "vwap",
    strategyName: "VWAP",
    market: "SP500",
    timeframe: "15m",
    signal: "WAIT",
    weight: 0.2,
    rawScore: 12,
    currentRegime: mockCurrentRegime,
    compatibleWithCurrentRegime: true,
    enabled: true,
    winRate: 0.51,
    profitFactor: 1.18,
    sampleSize: 74,
  },
  {
    strategyId: "mean-reversion",
    strategyName: "Mean Reversion",
    market: "SP500",
    timeframe: "15m",
    signal: "SELL",
    weight: 0.1,
    rawScore: -22,
    currentRegime: mockCurrentRegime,
    compatibleWithCurrentRegime: false,
    enabled: true,
    winRate: 0.49,
    profitFactor: 1.05,
    sampleSize: 61,
  },
  {
    strategyId: "opening-range-breakout",
    strategyName: "Opening Range Breakout",
    market: "SP500",
    timeframe: "5m",
    signal: "WAIT",
    weight: 0.15,
    rawScore: 4,
    currentRegime: mockCurrentRegime,
    compatibleWithCurrentRegime: true,
    enabled: true,
    winRate: 0.46,
    profitFactor: 1.11,
    sampleSize: 39,
  },
];
