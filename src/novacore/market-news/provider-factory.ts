import "server-only";

import { createAlpacaNewsProvider } from "@/novacore/market-news/providers/alpaca-news-provider";
import type { MarketNewsProvider, MarketNewsProviderError } from "@/novacore/market-news/provider";
import type { Result } from "@/core/shared/types";

/**
 * Resolves the configured `MarketNewsProvider`. Mirrors
 * `src/core/market-data/provider-factory.ts` exactly: server-only,
 * returns a typed error instead of throwing when unconfigured, so
 * callers render an honest "not connected" state instead of crashing or
 * inventing headlines. Reuses the Market Data API credentials
 * (`ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY`) — no separate
 * `MARKET_NEWS_*` secret exists or is required for the default provider.
 * In this environment those credentials are unset, so this correctly
 * returns "unavailable" until the operator configures them — see
 * `docs/MARKET_NEWS_PROVIDERS.md`.
 */
export function createMarketNewsProvider(): Result<MarketNewsProvider, MarketNewsProviderError> {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_API_SECRET_KEY;

  if (!keyId || !secretKey) {
    return {
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        message:
          "Market news provider not configured. Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY " +
          "(same Market Data API credentials already used for the SPY/QQQ/DIA/IWM charts — see " +
          ".env.example) to enable real market news. See docs/MARKET_NEWS_PROVIDERS.md for alternatives.",
      },
    };
  }

  return { ok: true, value: createAlpacaNewsProvider({ keyId, secretKey }) };
}
