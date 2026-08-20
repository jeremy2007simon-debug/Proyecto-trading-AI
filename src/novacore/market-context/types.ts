import type { DataProvenance } from "@/novacore/shared/types";

/**
 * Block 7 / Observability Upgrade — S&P 500 benchmark chart. Explicitly
 * SPY (the ETF proxy already used everywhere else in this codebase for
 * the logical market "SP500" — see `src/core/market-data/instruments.ts`),
 * never silently conflated with the index itself.
 */
export type ChartTimeframe = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export interface ChartPoint {
  timestamp: string;
  close: number;
}

export interface SpyBenchmarkSeries {
  available: boolean;
  unavailableReason?: string;
  timeframe: ChartTimeframe;
  ticker: "SPY";
  points: ChartPoint[];
  lastValue?: number;
  lastTimestamp?: string;
  absoluteChange?: number;
  percentChange?: number;
  provenance: DataProvenance;
  source: string;
}
