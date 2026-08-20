import "server-only";

import { getMarketBenchmarkSeries } from "@/novacore/market-context/adapters/market-benchmark-adapter";
import type { ChartTimeframe, SpyBenchmarkSeries } from "@/novacore/market-context/types";

/**
 * Block 7 / Observability Upgrade — S&P 500 (SPY) benchmark chart data.
 * Thin, backward-compatible wrapper over the generalized
 * `getMarketBenchmarkSeries` (added when the Mobile UX + Market News
 * addendum extended benchmark charting to RS3M's full four-market
 * universe). Kept as its own function/module because it is a stable,
 * separately-tested entry point (`/api/novacore/market/spy`,
 * `SpyBenchmarkChart`) — every existing caller keeps working unchanged.
 */
export async function getSpyBenchmarkSeries(timeframe: ChartTimeframe): Promise<SpyBenchmarkSeries> {
  return getMarketBenchmarkSeries("SP500", timeframe);
}
