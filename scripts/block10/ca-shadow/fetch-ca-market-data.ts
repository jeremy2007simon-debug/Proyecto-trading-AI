/**
 * Block 10 §9 — C-A shadow market data fetch. "Prioritize Alpaca Market
 * Data if available; else use the SAME audited source C-A verification
 * used (Yahoo Finance)." Never silently switches source without recording
 * which one was used — `fetchCaMarketData()`'s return always tags
 * `source` and `adjustment` explicitly, and both are threaded through to
 * `ShadowDayResult`/the forward-evidence ledger.
 *
 * Deliberately constructs the Alpaca provider directly (like
 * `scripts/block6/lib/fetch-candidate-assets.ts`), not via the
 * "server-only"-marked `provider-factory.ts` (that factory is for Next.js
 * server code; this is a standalone script) — and, same reasoning as that
 * file, because it needs the EXACT `adjustment: "all"` (split+dividend
 * adjusted close) convention C-A was verified under, which the
 * production factory does not let callers choose.
 *
 * READ-ONLY: `getHistoricalCandles` only. This file never imports
 * anything execution/order-related — see `tests/core/ca-shadow/
 * no-broker-writes.test.ts`.
 */
import { createAlpacaMarketDataProvider } from "@/core/market-data/providers/alpaca.adapter";
import type { Candle } from "@/core/market-data/types";
import type { Market } from "@/core/shared/types";
import { CA_CANDIDATE_V1 } from "@/core/ca-shadow/candidate";
import { EXPECTED_CA_DATA_ADJUSTMENT } from "@/core/ca-shadow/shadow-engine";

const CA_MARKET = CA_CANDIDATE_V1.market as Market;
const CA_SYMBOL = "SPY";
/** Generously more than 252 trading days before any plausible forward-start date — see `docs/BLOCK10_CA_SHADOW_FORWARD_VALIDATION.md`. */
const CA_HISTORY_FROM = "2015-01-01T00:00:00.000Z";

export type CaMarketDataSource = "ALPACA" | "YAHOO";

export interface CaMarketDataResult {
  candles: Candle[];
  source: CaMarketDataSource;
  adjustment: string;
  dataCutoffIso: string;
}

async function fetchFromAlpaca(): Promise<Candle[] | undefined> {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secretKey) return undefined;
  const feed = process.env.ALPACA_FEED === "iex" ? "iex" : process.env.ALPACA_FEED === "sip" ? "sip" : undefined;

  try {
    const provider = createAlpacaMarketDataProvider({ keyId, secretKey, feed, adjustment: "all" });
    const result = await provider.getHistoricalCandles({ market: CA_MARKET, timeframe: "1d", from: CA_HISTORY_FROM });
    if (!result.ok) {
      console.error(`[ca-shadow][fetch] Alpaca fetch failed: ${result.error.code} — ${result.error.message}`);
      return undefined;
    }
    return [...result.value].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch (err) {
    console.error(`[ca-shadow][fetch] Alpaca fetch threw: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

interface YahooChartResponse {
  chart: {
    result?: [
      {
        meta: { dataGranularity: string };
        timestamp: number[];
        indicators: {
          quote: [{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }];
          adjclose?: [{ adjclose: (number | null)[] }];
        };
      },
    ];
    error?: { code: string; description: string };
  };
}

/** Same endpoint, params, and User-Agent as `scripts/research/strategy2/fetch-block9b-data.ts` — the exact audited source C-A's own verification used. */
async function fetchFromYahoo(): Promise<Candle[] | undefined> {
  try {
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${CA_SYMBOL}?interval=1d&period1=0&period2=${period2}&events=div,split`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" } });
    if (response.status !== 200) {
      console.error(`[ca-shadow][fetch] Yahoo chart fetch failed for ${CA_SYMBOL}: HTTP ${response.status}`);
      return undefined;
    }
    const raw = (await response.json()) as YahooChartResponse;
    const result = raw.chart.result?.[0];
    if (!result) {
      console.error(`[ca-shadow][fetch] Yahoo chart returned no result for ${CA_SYMBOL}: ${JSON.stringify(raw.chart.error)}`);
      return undefined;
    }
    if (result.meta.dataGranularity !== "1d") {
      console.error(`[ca-shadow][fetch] Yahoo returned granularity "${result.meta.dataGranularity}", expected "1d" — refusing.`);
      return undefined;
    }

    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    const adj = indicators.adjclose?.[0]?.adjclose;
    const candles: Candle[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const open = quote.open[i];
      const high = quote.high[i];
      const low = quote.low[i];
      const close = quote.close[i];
      const adjClose = adj?.[i];
      if (open === null || high === null || low === null || close === null || adjClose == null) continue;
      const ratio = close > 0 ? adjClose / close : 1;
      const date = new Date(timestamp[i] * 1000).toISOString().slice(0, 10);
      candles.push({ market: CA_MARKET, timeframe: "1d", timestamp: `${date}T00:00:00.000Z`, symbol: CA_SYMBOL, provider: "yahoo-adjusted", open: open * ratio, high: high * ratio, low: low * ratio, close: adjClose, volume: quote.volume[i] ?? 0 });
    }
    return candles.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch (err) {
    console.error(`[ca-shadow][fetch] Yahoo fetch threw: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

/**
 * Tries Alpaca first (adjustment "all" — the canonical split+dividend
 * adjusted convention C-A was verified under, see `shadow-engine.ts`'s
 * `EXPECTED_CA_DATA_ADJUSTMENT`); falls back to Yahoo ONLY if Alpaca is
 * unconfigured or fails outright. Returns `undefined` (never a partial/
 * empty dataset presented as real) if BOTH sources fail.
 */
export async function fetchCaMarketData(): Promise<CaMarketDataResult | undefined> {
  const alpacaCandles = await fetchFromAlpaca();
  if (alpacaCandles && alpacaCandles.length > 0) {
    const last = alpacaCandles[alpacaCandles.length - 1];
    return { candles: alpacaCandles, source: "ALPACA", adjustment: EXPECTED_CA_DATA_ADJUSTMENT, dataCutoffIso: last.timestamp };
  }

  console.warn("[ca-shadow][fetch] Alpaca unavailable — falling back to Yahoo Finance (the same audited source C-A verification used, per §9).");
  const yahooCandles = await fetchFromYahoo();
  if (yahooCandles && yahooCandles.length > 0) {
    const last = yahooCandles[yahooCandles.length - 1];
    return { candles: yahooCandles, source: "YAHOO", adjustment: EXPECTED_CA_DATA_ADJUSTMENT, dataCutoffIso: last.timestamp };
  }

  return undefined;
}
