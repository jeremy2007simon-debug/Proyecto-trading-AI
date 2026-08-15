import "server-only";

import { createAlpacaMarketDataProvider } from "@/core/market-data/providers/alpaca.adapter";
import type { MarketDataError, MarketDataProvider } from "@/core/market-data/types";
import type { Result } from "@/core/shared/types";

/**
 * Resolves the configured `MarketDataProvider` from environment
 * variables. Server-only (never bundled into client code). Returns a
 * typed error instead of throwing when credentials are missing — the
 * same "503 if unconfigured" philosophy already used by
 * `src/app/api/webhooks/tradingview/route.ts`, so callers (API routes,
 * server components) can render a clean "data unavailable" state
 * instead of crashing.
 */
export function createMarketDataProvider(): Result<MarketDataProvider, MarketDataError> {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_API_SECRET_KEY;

  if (!keyId || !secretKey) {
    return {
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        message:
          "Market data provider not configured. Set ALPACA_API_KEY_ID and " +
          "ALPACA_API_SECRET_KEY (see .env.example) to enable real market data.",
      },
    };
  }

  return { ok: true, value: createAlpacaMarketDataProvider({ keyId, secretKey }) };
}
