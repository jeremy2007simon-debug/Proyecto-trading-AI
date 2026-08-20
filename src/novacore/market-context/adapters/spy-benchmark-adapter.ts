import "server-only";

import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { Timeframe } from "@/core/shared/types";
import type { ChartTimeframe, SpyBenchmarkSeries } from "@/novacore/market-context/types";

/**
 * Block 7 / Observability Upgrade — S&P 500 (SPY) benchmark chart data.
 * Reuses the EXISTING Block 1-2 market-data infrastructure
 * (`createMarketDataProvider`, the Alpaca Market Data API adapter) rather
 * than introducing a second data source — this is a genuinely separate
 * credential domain (`ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY`, Market
 * Data API) from RS3M's paper-trading credentials
 * (`ALPACA_PAPER_API_KEY_ID`/`ALPACA_PAPER_API_SECRET_KEY`, Trading API)
 * and touches nothing under `src/core/paper-trading/rs3m` or
 * `scripts/block6`. Read-only: `getHistoricalCandles` never places an
 * order (the Market Data API has no order-placing capability at all).
 *
 * A short in-memory TTL cache keeps this from calling Alpaca on every
 * single page load (Block 7's "no costly calls" principle) without
 * needing a persistence layer — acceptable for this phase since NovaCore
 * explicitly isn't adding storage yet. The cache is per server process
 * and resets on redeploy/restart.
 */

const TIMEFRAME_CONFIG: Record<ChartTimeframe, { timeframe: Timeframe; lookbackDays: number | undefined; cacheTtlMs: number }> = {
  "1D": { timeframe: "15m", lookbackDays: 5, cacheTtlMs: 60_000 },
  "1W": { timeframe: "1h", lookbackDays: 10, cacheTtlMs: 60_000 },
  "1M": { timeframe: "1d", lookbackDays: 35, cacheTtlMs: 300_000 },
  "3M": { timeframe: "1d", lookbackDays: 100, cacheTtlMs: 300_000 },
  "1Y": { timeframe: "1d", lookbackDays: 380, cacheTtlMs: 900_000 },
  ALL: { timeframe: "1d", lookbackDays: undefined, cacheTtlMs: 900_000 },
};

const cache = new Map<ChartTimeframe, { series: SpyBenchmarkSeries; expiresAt: number }>();

function buildUnavailable(timeframe: ChartTimeframe, reason: string): SpyBenchmarkSeries {
  return { available: false, unavailableReason: reason, timeframe, ticker: "SPY", points: [], provenance: "UNAVAILABLE", source: "Alpaca Market Data API (unavailable)" };
}

export async function getSpyBenchmarkSeries(timeframe: ChartTimeframe): Promise<SpyBenchmarkSeries> {
  const cached = cache.get(timeframe);
  if (cached && cached.expiresAt > Date.now()) return cached.series;

  const config = TIMEFRAME_CONFIG[timeframe];
  const provider = createMarketDataProvider();
  if (!provider.ok) return buildUnavailable(timeframe, provider.error.message);

  const to = new Date();
  const from = config.lookbackDays !== undefined ? new Date(to.getTime() - config.lookbackDays * 24 * 60 * 60 * 1000) : new Date(RS3M_CANDIDATE_V1.datasetFrom);

  const result = await provider.value.getHistoricalCandles({ market: "SP500", timeframe: config.timeframe, from: from.toISOString(), to: to.toISOString() });
  if (!result.ok) return buildUnavailable(timeframe, result.error.message);
  if (result.value.length === 0) return buildUnavailable(timeframe, "No candles returned for the requested range.");

  const points = result.value.map((c) => ({ timestamp: c.timestamp, close: c.close })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const first = points[0];
  const last = points[points.length - 1];

  const series: SpyBenchmarkSeries = {
    available: true,
    timeframe,
    ticker: "SPY",
    points,
    lastValue: last.close,
    lastTimestamp: last.timestamp,
    absoluteChange: last.close - first.close,
    percentChange: first.close > 0 ? ((last.close - first.close) / first.close) * 100 : undefined,
    provenance: "LIVE",
    source: "Alpaca Market Data API — SPY (ETF proxy for the S&P 500 index, not the index itself)",
  };

  cache.set(timeframe, { series, expiresAt: Date.now() + config.cacheTtlMs });
  return series;
}
