import type { ISOTimestamp, Market, Result, Timeframe } from "@/core/shared/types";

/**
 * A single OHLCV candle. This is the atomic unit every downstream module
 * (indicators, regime detector, strategies) consumes — nothing downstream
 * is allowed to reach past this shape back to a raw provider payload.
 */
export interface Candle {
  market: Market;
  timeframe: Timeframe;
  timestamp: ISOTimestamp;
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

  getCandles(
    request: MarketDataRequest,
  ): Promise<Result<Candle[], MarketDataError>>;

  getLatestPrice(market: Market): Promise<Result<number, MarketDataError>>;
}
