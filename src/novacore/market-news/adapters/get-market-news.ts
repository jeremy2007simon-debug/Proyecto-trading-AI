import "server-only";

import { createMarketNewsProvider } from "@/novacore/market-news/provider-factory";
import { buildWhyItMatters, classifyCategory, deriveRelatedMarkets, scoreRelevance } from "@/novacore/market-news/relevance";
import type { MarketNewsItem, MarketNewsQuery, MarketNewsResult } from "@/novacore/market-news/types";

const DEFAULT_LIMIT = 30;
const CACHE_TTL_MS = 5 * 60_000;

let cache: { result: MarketNewsResult; expiresAt: number } | undefined;

/**
 * Observability Upgrade §6-9 — orchestrates provider → relevance
 * classification → filtering/sorting. Never fabricates an item: when no
 * provider is configured (this environment) or the provider call fails,
 * returns `available: false` with the real reason, exactly like
 * `getSpyBenchmarkSeries`/`getMarketBenchmarkSeries` do for price data.
 * A short in-memory TTL cache avoids re-fetching on every request,
 * matching the benchmark-chart adapters' existing pattern.
 */
export async function getMarketNews(query: MarketNewsQuery = {}): Promise<MarketNewsResult> {
  if (!cache || cache.expiresAt <= Date.now()) {
    cache = { result: await fetchAndClassify(), expiresAt: Date.now() + CACHE_TTL_MS };
  }

  const result = cache.result;
  if (!result.available) return result;

  let items = result.items;
  const { category, market, limit } = query;
  if (category) items = items.filter((item) => item.category === category);
  if (market) items = items.filter((item) => item.relatedMarkets.includes(market));
  if (limit) items = items.slice(0, limit);

  return { ...result, items };
}

async function fetchAndClassify(): Promise<MarketNewsResult> {
  const provider = createMarketNewsProvider();
  if (!provider.ok) {
    return { available: false, unavailableReason: provider.error.message, items: [], provenance: "UNAVAILABLE", source: "Market news provider (not configured)" };
  }

  const fetched = await provider.value.fetchRecent({ limit: DEFAULT_LIMIT });
  if (!fetched.ok) {
    return { available: false, unavailableReason: fetched.error.message, items: [], provenance: "UNAVAILABLE", source: `${provider.value.id} (unavailable)` };
  }

  const items: MarketNewsItem[] = fetched.value.map((raw) => {
    const category = classifyCategory(`${raw.headline} ${raw.summary ?? ""}`);
    const relatedMarkets = deriveRelatedMarkets(raw.symbols);
    return {
      id: raw.id,
      headline: raw.headline,
      source: raw.source,
      publishedAt: raw.publishedAt,
      url: raw.url,
      summary: raw.summary,
      category,
      relatedMarkets,
      relatedSymbols: raw.symbols,
      relevanceScore: scoreRelevance(category, relatedMarkets),
      whyItMatters: buildWhyItMatters(category, relatedMarkets),
    };
  });

  items.sort((a, b) => b.relevanceScore - a.relevanceScore || b.publishedAt.localeCompare(a.publishedAt));

  return { available: true, items, provenance: "LIVE", source: `${provider.value.id} — https://data.alpaca.markets/v1beta1/news`, asOf: new Date().toISOString() };
}
