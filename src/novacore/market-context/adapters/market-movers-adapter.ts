import "server-only";

import { getMarketBenchmarkSeries, RS3M_UNIVERSE_MARKETS } from "@/novacore/market-context/adapters/market-benchmark-adapter";
import type { Market } from "@/core/shared/types";
import type { DataProvenance } from "@/novacore/shared/types";

/**
 * Observability Upgrade §4 — "Market performance" row: SPY/QQQ/DIA/IWM,
 * one % change per market. Reuses `getMarketBenchmarkSeries("1D", ...)`
 * (same cache, same credential domain) rather than adding a second data
 * path; "1D" mirrors the exact window already shown as the SPY chart's
 * own 1D headline, so the number here always matches what a user sees if
 * they open that market's own chart — no separate, silently-different
 * "daily change" calculation.
 */
export interface MarketMoverRow {
  market: Market;
  label: string;
  ticker: string;
  available: boolean;
  lastValue?: number;
  percentChange?: number;
  provenance: DataProvenance;
}

export async function getMarketMovers(): Promise<MarketMoverRow[]> {
  const series = await Promise.all(RS3M_UNIVERSE_MARKETS.map((market) => getMarketBenchmarkSeries(market, "1D")));

  return series.map((s) => ({
    market: s.market,
    label: s.label,
    ticker: s.ticker,
    available: s.available,
    lastValue: s.lastValue,
    percentChange: s.percentChange,
    provenance: s.provenance,
  }));
}
