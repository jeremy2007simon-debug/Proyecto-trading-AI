import type { MarketStatus } from "@/core/market-hours/types";
import type { ISOTimestamp, Market, Result, Timeframe } from "@/core/shared/types";

/**
 * A single OHLCV candle. This is the atomic unit every downstream module
 * (indicators, regime detector, strategies) consumes — nothing downstream
 * is allowed to reach past this shape back to a raw provider payload.
 *
 * `symbol` and `provider` make every candle self-describing: `symbol` is
 * the exact ticker fetched (e.g. "SPY" for the logical market "SP500" —
 * see `instruments.ts` for why these differ), and `provider` is the id
 * of the `MarketDataProvider` that produced the row. Both are persisted
 * and are part of `market_candles`'s uniqueness constraint (see
 * `supabase/migrations/0002_market_candles_provider_identity.sql`), so
 * two providers reporting the same market/timeframe/timestamp never
 * silently collide.
 */
export interface Candle {
  market: Market;
  timeframe: Timeframe;
  timestamp: ISOTimestamp;
  symbol: string;
  provider: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataRequest {
  market: Market;
  timeframe: Timeframe;
  /** Inclusive range. Omit `to` to request "up to latest". */
  from: ISOTimestamp;
  to?: ISOTimestamp;
  limit?: number;
}

export interface MarketDataError {
  code:
    | "PROVIDER_UNAVAILABLE"
    | "INVALID_RANGE"
    | "NO_DATA"
    | "RATE_LIMITED"
    | "UNKNOWN";
  message: string;
}

/**
 * Contract every market data source must implement (live feed, historical
 * file, TradingView webhook relay, a future broker feed, ...). The rest of
 * the system only ever depends on this interface, never on a concrete
 * provider, so a new data source can be plugged in without touching
 * indicators, regimes, strategies, consensus, or risk.
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly supportedMarkets: readonly Market[];

  getHistoricalCandles(
    request: MarketDataRequest,
  ): Promise<Result<Candle[], MarketDataError>>;

  getLatestCandle(
    market: Market,
    timeframe: Timeframe,
  ): Promise<Result<Candle, MarketDataError>>;

  getCurrentPrice(market: Market): Promise<Result<number, MarketDataError>>;

  /**
   * Most adapters should implement this by delegating to a pure
   * `MarketHoursCalendar.getStatus()` (calendar math, no network call
   * needed) rather than an API call — override only if the provider
   * exposes real exchange status (e.g. trading halts).
   */
  getMarketStatus(market: Market): Promise<Result<MarketStatus, MarketDataError>>;
}
