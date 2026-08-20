import type { Result } from "@/core/shared/types";

/**
 * Observability Upgrade §6 — `MarketNewsProvider` abstraction. NovaCore
 * must never be permanently coupled to one news API; adding a second
 * provider later means implementing this interface and switching what
 * `provider-factory.ts` returns, nothing else in the codebase changes.
 * Mirrors the existing `MarketDataProvider` pattern
 * (`src/core/market-data/types.ts` + `provider-factory.ts`) deliberately.
 */
export interface RawMarketNewsItem {
  id: string;
  headline: string;
  source: string;
  publishedAt: string;
  url: string;
  summary?: string;
  symbols: string[];
}

export interface MarketNewsProviderError {
  code: "PROVIDER_UNAVAILABLE" | "RATE_LIMITED" | "NO_DATA" | "UNKNOWN";
  message: string;
}

export interface MarketNewsProvider {
  id: string;
  fetchRecent(params: { limit: number }): Promise<Result<RawMarketNewsItem[], MarketNewsProviderError>>;
}
