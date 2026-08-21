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
  | "BITCOIN"
  // Added in Block 4.5 (Phase 7, cross-asset strategy validation) —
  // Russell 2000 and Dow Jones Industrial, both traded via their
  // standard ETF proxies (see `instruments.ts`). Purely additive: kept
  // out of `ACTIVE_MARKETS` below, so the live dashboard/production
  // pipeline behavior is unchanged.
  | "RUSSELL2000"
  | "DOWJONES"
  // Added in Block 8 (Forex Research Lab) — three more FX spot pairs
  // alongside the pre-existing `FOREX_EURUSD` placeholder. Research-only:
  // kept out of `ACTIVE_MARKETS`, same convention as RUSSELL2000/DOWJONES
  // above. No RS3M/equity code path reads these — see
  // `docs/BLOCK8_FOREX_RESEARCH_REPORT.md`.
  | "FOREX_GBPUSD"
  | "FOREX_USDJPY"
  | "FOREX_AUDUSD";

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
