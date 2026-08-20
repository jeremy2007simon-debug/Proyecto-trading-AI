import "server-only";

import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import { getInstrumentConfig } from "@/core/market-data/instruments";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { Market, Timeframe } from "@/core/shared/types";
import type { ChartTimeframe, MarketBenchmarkSeries } from "@/novacore/market-context/types";

/**
 * Block 7 / Observability Upgrade — generalizes the original SPY-only
 * benchmark adapter to any of the four markets in RS3M's own rotation
 * universe (`RS3M_CANDIDATE_V1.universe`: SP500/NASDAQ100/DOWJONES/
 * RUSSELL2000), reusing the EXISTING Block 1-2 market-data
 * infrastructure (`createMarketDataProvider`) rather than a second data
 * source. Same credential domain, same read-only guarantee, same
 * in-memory TTL cache pattern as the original — see that file's removed
 * doc comment history for the full rationale (now superseded by this
 * one).
 */

const MARKET_LABEL: Record<Market, string> = {
  SP500: "S&P 500",
  NASDAQ100: "Nasdaq 100",
  DOWJONES: "Dow Jones",
  RUSSELL2000: "Russell 2000",
  FOREX_EURUSD: "EUR/USD",
  GOLD: "Gold",
  BITCOIN: "Bitcoin",
};

const TIMEFRAME_CONFIG: Record<ChartTimeframe, { timeframe: Timeframe; lookbackDays: number | undefined; cacheTtlMs: number }> = {
  "1D": { timeframe: "15m", lookbackDays: 5, cacheTtlMs: 60_000 },
  "1W": { timeframe: "1h", lookbackDays: 10, cacheTtlMs: 60_000 },
  "1M": { timeframe: "1d", lookbackDays: 35, cacheTtlMs: 300_000 },
  "3M": { timeframe: "1d", lookbackDays: 100, cacheTtlMs: 300_000 },
  "1Y": { timeframe: "1d", lookbackDays: 380, cacheTtlMs: 900_000 },
  ALL: { timeframe: "1d", lookbackDays: undefined, cacheTtlMs: 900_000 },
};

const cache = new Map<string, { series: MarketBenchmarkSeries; expiresAt: number }>();

function cacheKey(market: Market, timeframe: ChartTimeframe): string {
  return `${market}:${timeframe}`;
}

function buildUnavailable(market: Market, ticker: string, timeframe: ChartTimeframe, reason: string): MarketBenchmarkSeries {
  return {
    available: false,
    unavailableReason: reason,
    timeframe,
    market,
    label: `${MARKET_LABEL[market]} (${ticker})`,
    ticker,
    points: [],
    provenance: "UNAVAILABLE",
    source: "Alpaca Market Data API (unavailable)",
  };
}

export async function getMarketBenchmarkSeries(market: Market, timeframe: ChartTimeframe): Promise<MarketBenchmarkSeries> {
  const key = cacheKey(market, timeframe);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.series;

  const instrument = getInstrumentConfig(market);
  const ticker = instrument.ok ? instrument.value.ticker : market;

  const config = TIMEFRAME_CONFIG[timeframe];
  const provider = createMarketDataProvider();
  if (!provider.ok) return buildUnavailable(market, ticker, timeframe, provider.error.message);

  const to = new Date();
  const from = config.lookbackDays !== undefined ? new Date(to.getTime() - config.lookbackDays * 24 * 60 * 60 * 1000) : new Date(RS3M_CANDIDATE_V1.datasetFrom);

  const result = await provider.value.getHistoricalCandles({ market, timeframe: config.timeframe, from: from.toISOString(), to: to.toISOString() });
  if (!result.ok) return buildUnavailable(market, ticker, timeframe, result.error.message);
  if (result.value.length === 0) return buildUnavailable(market, ticker, timeframe, "No candles returned for the requested range.");

  const points = result.value.map((c) => ({ timestamp: c.timestamp, close: c.close })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const first = points[0];
  const last = points[points.length - 1];

  const series: MarketBenchmarkSeries = {
    available: true,
    timeframe,
    market,
    label: `${MARKET_LABEL[market]} (${ticker})`,
    ticker,
    points,
    lastValue: last.close,
    lastTimestamp: last.timestamp,
    absoluteChange: last.close - first.close,
    percentChange: first.close > 0 ? ((last.close - first.close) / first.close) * 100 : undefined,
    provenance: "LIVE",
    source: `Alpaca Market Data API — ${ticker} (ETF proxy for ${MARKET_LABEL[market]}, not the index itself)`,
  };

  cache.set(key, { series, expiresAt: Date.now() + config.cacheTtlMs });
  return series;
}

/** The four markets in RS3M's own rotation universe — the set `getMarketMovers` reports on. */
export const RS3M_UNIVERSE_MARKETS: Market[] = ["SP500", "NASDAQ100", "DOWJONES", "RUSSELL2000"];
