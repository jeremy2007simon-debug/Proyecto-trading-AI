import type { ISOTimestamp, Market } from "@/core/shared/types";

export type MarketSession = "PRE_MARKET" | "REGULAR" | "AFTER_HOURS" | "CLOSED";

/**
 * Point-in-time trading session status for a market. `isOpen` is `true`
 * only when `session === "REGULAR"` — this platform's signal pipeline is
 * Regular-Trading-Hours-only by design (pre/after-hours liquidity is too
 * thin for the strategies planned here), which is why staleness checks
 * in the Data Quality Engine key off `isOpen`, not "market has any
 * session active at all".
 */
export interface MarketStatus {
  market: Market;
  asOf: ISOTimestamp;
  session: MarketSession;
  isOpen: boolean;
  isDST: boolean;
  /** Exchange-local calendar date (YYYY-MM-DD), used for VWAP session grouping. */
  tradingDay: string;
  nextTransitionAt: ISOTimestamp;
}

/**
 * Pure calendar math — no network calls. DST is handled via the host's
 * native IANA timezone database (`Intl.DateTimeFormat` with a `timeZone`
 * option), which is why no date/timezone library dependency is needed.
 */
export interface MarketHoursCalendar {
  readonly market: Market;
  readonly timezone: string;

  getStatus(instant: Date): MarketStatus;
  isTradingDay(instant: Date): boolean;
  /** UTC instant of this trading day's Regular-Trading-Hours open (09:30 local) — used to reset session-based indicators like VWAP. */
  getSessionStartUTC(instant: Date): ISOTimestamp;
  /**
   * Calendar-local "trading day" bucket key (e.g. "2026-01-15"), used by
   * the backtesting engine's daily risk gate to decide when a new day's
   * trade/loss budget starts (see `daily-risk-gate.ts`). Added in Block 8
   * so the engine can bucket days per-market instead of always assuming
   * NYSE's Eastern-time trading day — `createNyseCalendar`'s
   * implementation is unchanged from its pre-Block-8 internal `dateKey`
   * helper, so every existing (equity) market's bucketing is bit-for-bit
   * identical to before.
   */
  getTradingDayKey(instant: Date): string;
}
