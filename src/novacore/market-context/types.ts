import type { Market } from "@/core/shared/types";
import type { DataProvenance } from "@/novacore/shared/types";

/**
 * Block 7 / Observability Upgrade — market benchmark charts. Explicitly
 * ETF proxies (SPY/QQQ/DIA/IWM, already used everywhere else in this
 * codebase for the logical markets SP500/NASDAQ100/DOWJONES/RUSSELL2000
 * — see `src/core/market-data/instruments.ts`), never silently conflated
 * with the indices themselves — these are the four markets in RS3M's own
 * rotation universe (`RS3M_CANDIDATE_V1.universe`).
 */
export type ChartTimeframe = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export interface ChartPoint {
  timestamp: string;
  close: number;
}

export interface MarketBenchmarkSeries {
  available: boolean;
  unavailableReason?: string;
  timeframe: ChartTimeframe;
  market: Market;
  /** Human-readable name, e.g. "S&P 500 (SPY)" — always names both the index and its ETF proxy so the two are never conflated in the UI. */
  label: string;
  ticker: string;
  points: ChartPoint[];
  lastValue?: number;
  lastTimestamp?: string;
  absoluteChange?: number;
  percentChange?: number;
  provenance: DataProvenance;
  source: string;
}

/** Back-compat alias — the SPY-specific route/component/tests predate the multi-market generalization; `ticker` is narrowed by convention (always "SPY" when `market === "SP500"`), not by the type. */
export type SpyBenchmarkSeries = MarketBenchmarkSeries;
