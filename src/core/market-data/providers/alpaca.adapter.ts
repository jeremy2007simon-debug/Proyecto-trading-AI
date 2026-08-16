import { getInstrumentConfig } from "@/core/market-data/instruments";
import type {
  Candle,
  MarketDataError,
  MarketDataProvider,
  MarketDataRequest,
} from "@/core/market-data/types";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import type { MarketStatus } from "@/core/market-hours/types";
import type { Market, Result, Timeframe } from "@/core/shared/types";

/**
 * Alpaca Market Data API v2 adapter — https://docs.alpaca.markets/reference/stockbars
 * Feed defaults to `sip` (full consolidated tape) but is configurable —
 * see `AlpacaCredentials.feed`. `iex` (the free real-time-only feed) was
 * this adapter's original hardcoded default; empirical testing during
 * the backtesting block found `iex` 5-minute bars for SPY inconsistent
 * before ~2020 (entire weeks missing), while `sip` reliably returns data
 * back to ~2016 on this account — `sip` is the better default for
 * historical research even though it may require a paid plan on other
 * accounts, which is exactly why it stays configurable, not hardcoded
 * either way. Credentials are passed in by the caller
 * (`provider-factory.ts`, server-only) — this file never reads
 * `process.env` itself, which keeps it directly unit-testable.
 */

const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets/v2";
const DEFAULT_FEED = "sip";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  "1m": "1Min",
  "5m": "5Min",
  "15m": "15Min",
  "30m": "30Min",
  "1h": "1Hour",
  "4h": "4Hour",
  "1d": "1Day",
};

export interface AlpacaCredentials {
  keyId: string;
  secretKey: string;
  /** "sip" (full consolidated tape, default) or "iex" (free real-time-only feed). See the module doc comment above for why `sip` is the default. */
  feed?: "sip" | "iex";
}

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AlpacaBarsResponse {
  bars: AlpacaBar[] | null;
  symbol: string;
  next_page_token: string | null;
}

interface AlpacaLatestBarResponse {
  symbol: string;
  bar: AlpacaBar | null;
}

interface AlpacaLatestTradeResponse {
  symbol: string;
  trade: { t: string; p: number } | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared request helper: auth headers, retry with exponential backoff on
 * 429/5xx, and mapping of HTTP outcomes to `MarketDataError.code`.
 */
async function alpacaRequest<T>(
  path: string,
  query: Record<string, string | undefined>,
  credentials: AlpacaCredentials,
): Promise<Result<T, MarketDataError>> {
  const url = new URL(`${ALPACA_DATA_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  let lastError: MarketDataError = {
    code: "UNKNOWN",
    message: "Alpaca request failed before any attempt completed.",
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: {
          "APCA-API-KEY-ID": credentials.keyId,
          "APCA-API-SECRET-KEY": credentials.secretKey,
          Accept: "application/json",
        },
      });
    } catch (err) {
      lastError = {
        code: "PROVIDER_UNAVAILABLE",
        message: `Network error calling Alpaca: ${err instanceof Error ? err.message : String(err)}`,
      };
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }

    if (response.status === 429) {
      lastError = { code: "RATE_LIMITED", message: "Alpaca rate limit exceeded (429)." };
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }
    if (response.status >= 500) {
      lastError = {
        code: "PROVIDER_UNAVAILABLE",
        message: `Alpaca returned ${response.status}.`,
      };
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }
    if (response.status === 404 || response.status === 422) {
      return {
        ok: false,
        error: {
          code: "NO_DATA",
          message: `Alpaca returned ${response.status} for ${path} — check the symbol/timeframe/date range.`,
        },
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: `Alpaca returned unexpected status ${response.status}.` },
      };
    }

    const body = (await response.json()) as T;
    return { ok: true, value: body };
  }

  return { ok: false, error: lastError };
}

function mapAlpacaBar(
  bar: AlpacaBar,
  market: Market,
  timeframe: Timeframe,
  symbol: string,
): Candle {
  return {
    market,
    timeframe,
    timestamp: bar.t,
    symbol,
    provider: "alpaca",
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  };
}

export function createAlpacaMarketDataProvider(
  credentials: AlpacaCredentials,
): MarketDataProvider {
  const feed = credentials.feed ?? DEFAULT_FEED;

  return {
    id: "alpaca",
    supportedMarkets: ["SP500"],

    async getHistoricalCandles(
      request: MarketDataRequest,
    ): Promise<Result<Candle[], MarketDataError>> {
      const instrument = getInstrumentConfig(request.market);
      if (!instrument.ok) {
        return { ok: false, error: { code: "INVALID_RANGE", message: instrument.error.message } };
      }

      const candles: Candle[] = [];
      let pageToken: string | undefined;

      do {
        const result = await alpacaRequest<AlpacaBarsResponse>(
          `/stocks/${instrument.value.ticker}/bars`,
          {
            timeframe: TIMEFRAME_MAP[request.timeframe],
            start: request.from,
            end: request.to,
            limit: request.limit ? String(request.limit) : "10000",
            feed,
            page_token: pageToken,
          },
          credentials,
        );
        if (!result.ok) return result;

        for (const bar of result.value.bars ?? []) {
          candles.push(mapAlpacaBar(bar, request.market, request.timeframe, instrument.value.ticker));
        }
        pageToken = result.value.next_page_token ?? undefined;
      } while (pageToken);

      if (candles.length === 0) {
        return { ok: false, error: { code: "NO_DATA", message: "Alpaca returned zero candles for this range." } };
      }
      return { ok: true, value: candles };
    },

    async getLatestCandle(
      market: Market,
      timeframe: Timeframe,
    ): Promise<Result<Candle, MarketDataError>> {
      const instrument = getInstrumentConfig(market);
      if (!instrument.ok) {
        return { ok: false, error: { code: "INVALID_RANGE", message: instrument.error.message } };
      }

      const result = await alpacaRequest<AlpacaLatestBarResponse>(
        `/stocks/${instrument.value.ticker}/bars/latest`,
        { feed },
        credentials,
      );
      if (!result.ok) return result;
      if (!result.value.bar) {
        return { ok: false, error: { code: "NO_DATA", message: "Alpaca returned no latest bar." } };
      }
      return {
        ok: true,
        value: mapAlpacaBar(result.value.bar, market, timeframe, instrument.value.ticker),
      };
    },

    async getCurrentPrice(market: Market): Promise<Result<number, MarketDataError>> {
      const instrument = getInstrumentConfig(market);
      if (!instrument.ok) {
        return { ok: false, error: { code: "INVALID_RANGE", message: instrument.error.message } };
      }

      const result = await alpacaRequest<AlpacaLatestTradeResponse>(
        `/stocks/${instrument.value.ticker}/trades/latest`,
        { feed },
        credentials,
      );
      if (!result.ok) return result;
      if (!result.value.trade) {
        return { ok: false, error: { code: "NO_DATA", message: "Alpaca returned no latest trade." } };
      }
      return { ok: true, value: result.value.trade.p };
    },

    async getMarketStatus(market: Market): Promise<Result<MarketStatus, MarketDataError>> {
      // Calendar math, not a network call — Alpaca's own market-status
      // endpoint would cost an extra request for information we can
      // compute locally and deterministically.
      return { ok: true, value: createNyseCalendar(market).getStatus(new Date()) };
    },
  };
}
