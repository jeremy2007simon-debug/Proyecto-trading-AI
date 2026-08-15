/**
 * Shared domain primitives used across every module in `src/core`.
 *
 * These types intentionally have no dependency on any other core module,
 * so they can be imported from anywhere (market-data, indicators, regime,
 * strategies, consensus, risk, signal, backtesting, paper-trading, ...)
 * without creating circular imports.
 */

/**
 * Tradeable markets. The system launches with SP500 only; every other
 * module (strategies, regime detector, risk engine, consensus engine)
 * is written against this union so adding a market is a matter of
 * extending this list plus a MarketDataProvider — never a core rewrite.
 */
export type Market =
  | "SP500"
  | "NASDAQ100"
  | "FOREX_EURUSD"
  | "GOLD"
  | "BITCOIN";

export const ACTIVE_MARKETS: readonly Market[] = ["SP500"] as const;

/** Timeframes supported by the market data / indicator layer. */
export type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d";

/**
 * The only three states the system is allowed to output at every stage
 * of the pipeline (per-strategy signal, consensus, final signal).
 */
export type SignalDirection = "BUY" | "SELL" | "WAIT";

/** ISO-8601 timestamp string (UTC). Kept as a branded-ish alias for clarity. */
export type ISOTimestamp = string;

/**
 * Generic result wrapper so modules can fail explicitly instead of
 * throwing across boundaries (market data outages, invalid candles, etc).
 * Consumers MUST check `ok` before reading `value`.
 */
export type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface DomainError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Every persisted domain record carries these audit fields so the system
 * stays auditable end-to-end (a hard requirement from the architecture doc).
 */
export interface AuditFields {
  createdAt: ISOTimestamp;
  updatedAt?: ISOTimestamp;
}
