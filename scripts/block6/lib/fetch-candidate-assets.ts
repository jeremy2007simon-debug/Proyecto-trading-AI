/**
 * Block 6 — shared data-fetch helper for RS3M_CANDIDATE_V1's universe
 * (SPY/QQQ/IWM/DIA). Used by every Block 6 script that needs the real
 * daily candle history (audit, ledger, independent reproduction, Fase
 * 5-15 analyses) so the fetch/sort/error-handling logic exists once.
 *
 * Deliberately constructs the Alpaca provider directly (not via
 * `createMarketDataProvider()`/`provider-factory.ts`) because this needs
 * to pass an explicit `adjustment`, which the production factory does not
 * expose (and should not — production behavior stays unchanged, see the
 * `AlpacaCredentials.adjustment` doc comment).
 */
import { createAlpacaMarketDataProvider, type AlpacaCredentials } from "@/core/market-data/providers/alpaca.adapter";
import type { Candle, MarketDataProvider } from "@/core/market-data/types";
import type { Market } from "@/core/shared/types";

export const RS3M_LONG_HISTORY_FROM = "2016-01-01T00:00:00.000Z";
export const RS3M_UNIVERSE: Market[] = ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"];
export const RS3M_BENCHMARK: Market = "SP500";

export function resolveAlpacaCredentials(): { keyId: string; secretKey: string; feed?: "sip" | "iex" } | undefined {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secretKey) return undefined;
  const feed = process.env.ALPACA_FEED === "iex" ? "iex" : process.env.ALPACA_FEED === "sip" ? "sip" : undefined;
  return { keyId, secretKey, feed };
}

async function fetchOne(provider: MarketDataProvider, market: Market, from: string): Promise<Candle[] | undefined> {
  const result = await provider.getHistoricalCandles({ market, timeframe: "1d", from });
  if (!result.ok) {
    console.error(`  [fetch failed] ${market}/1d: ${result.error.code} — ${result.error.message}`);
    return undefined;
  }
  return result.value.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Fetches daily candles for the full RS3M universe under a given price adjustment. Returns `undefined` (never a partial universe) if any asset fails to fetch — a rotation strategy needs all 4 assets present for a fair ranking. */
export async function fetchRs3mUniverse(
  adjustment: AlpacaCredentials["adjustment"],
  from: string = RS3M_LONG_HISTORY_FROM,
): Promise<Map<Market, Candle[]> | undefined> {
  const credentials = resolveAlpacaCredentials();
  if (!credentials) {
    console.error("[fetch-candidate-assets] ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY not configured.");
    return undefined;
  }

  const provider = createAlpacaMarketDataProvider({ ...credentials, adjustment });
  const byMarket = new Map<Market, Candle[]>();
  for (const market of RS3M_UNIVERSE) {
    const candles = await fetchOne(provider, market, from);
    if (!candles || candles.length === 0) {
      console.error(`[fetch-candidate-assets] Missing data for ${market} (adjustment=${adjustment ?? "raw/unset"}) — aborting.`);
      return undefined;
    }
    byMarket.set(market, candles);
  }
  return byMarket;
}
