import type { Market } from "@/core/shared/types";
import type { MarketHoursCalendar, MarketSession, MarketStatus } from "@/core/market-hours/types";

/**
 * Block 8 (Forex Research Lab) — a 24/5 FX market calendar.
 *
 * Real FX trading hours roll over at 17:00 New York time (a DST-moving
 * instant, 21:00 or 22:00 UTC depending on the season) rather than a
 * fixed UTC hour. This calendar deliberately uses a FIXED UTC cutoff
 * (22:00 UTC Friday close, 22:00 UTC Sunday open) instead of reproducing
 * that DST-aware rule — a documented, research-phase simplification (see
 * `docs/BLOCK8_FOREX_RESEARCH_REPORT.md` §Data Quality) that can shift the
 * true open/close by up to an hour depending on the time of year. This
 * never fabricates bars where the market is actually closed (data candles
 * are still gated by what the provider returned), it only affects how the
 * `isTradingDay`/`getStatus` calendar math itself buckets instants — used
 * by the daily risk gate and VWAP-style session resets, not by data
 * fetching.
 *
 * Session ("REGULAR" while open, "CLOSED" over the weekend) intentionally
 * collapses the PRE_MARKET/AFTER_HOURS distinction that makes sense for a
 * single-exchange equity market — FX has no such distinction, it's either
 * open (interbank/retail liquidity flowing) or weekend-closed.
 */

const WEEKEND_CLOSE_UTC_HOUR = 22; // Friday
const WEEKEND_OPEN_UTC_HOUR = 22; // Sunday

/**
 * Approximate, DST-naive UTC session windows for the London/New York
 * sessions and their overlap — used by the Session Breakout research
 * family (Block 8, Family D), not by this calendar's open/closed status.
 * Real session boundaries shift by an hour with DST; these are fixed
 * research-phase approximations, documented here so every consumer
 * shares the same definition instead of hand-rolling their own.
 */
export const FX_SESSION_WINDOWS_UTC = {
  LONDON: { startHour: 7, endHour: 16 },
  NEW_YORK: { startHour: 12, endHour: 21 },
  LONDON_NEW_YORK_OVERLAP: { startHour: 12, endHour: 16 },
} as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function utcDateKey(instant: Date): string {
  return `${instant.getUTCFullYear()}-${pad2(instant.getUTCMonth() + 1)}-${pad2(instant.getUTCDate())}`;
}

/** True whenever the fixed Sun 22:00 UTC - Fri 22:00 UTC window is open. */
function isMarketOpen(instant: Date): boolean {
  const weekday = instant.getUTCDay(); // 0=Sun..6=Sat
  const hour = instant.getUTCHours();

  if (weekday === 6) return false; // Saturday: always closed
  if (weekday === 0) return hour >= WEEKEND_OPEN_UTC_HOUR; // Sunday: opens at 22:00 UTC
  if (weekday === 5) return hour < WEEKEND_CLOSE_UTC_HOUR; // Friday: closes at 22:00 UTC
  return true; // Mon-Thu: always open
}

function nextTransitionUTC(instant: Date, open: boolean): Date {
  const cursor = new Date(instant);
  cursor.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8; i++) {
    cursor.setUTCHours(cursor.getUTCHours() + 1);
    if (isMarketOpen(cursor) !== open) return cursor;
  }
  throw new Error("forex-calendar: no session transition found within 8 days");
}

/** Concrete 24/5 FX calendar. `market` must be one of the FOREX_* markets (see `instruments.ts`); passed through rather than validated to keep this a pure calendar (no dependency on `instruments.ts`). */
export function createForexCalendar(market: Market): MarketHoursCalendar {
  return {
    market,
    timezone: "UTC",

    isTradingDay(instant: Date): boolean {
      return isMarketOpen(instant);
    },

    getSessionStartUTC(instant: Date): string {
      // FX has no single daily "session open" the way NYSE does — VWAP-style
      // indicators reset at 00:00 UTC each calendar day instead, matching
      // `getTradingDayKey` below.
      const start = new Date(instant);
      start.setUTCHours(0, 0, 0, 0);
      return start.toISOString();
    },

    getTradingDayKey(instant: Date): string {
      return utcDateKey(instant);
    },

    getStatus(instant: Date): MarketStatus {
      const open = isMarketOpen(instant);
      const session: MarketSession = open ? "REGULAR" : "CLOSED";
      return {
        market,
        asOf: instant.toISOString(),
        session,
        isOpen: open,
        // FX itself has no DST-dependent session shift under this
        // fixed-UTC-cutoff model — always reported false.
        isDST: false,
        tradingDay: utcDateKey(instant),
        nextTransitionAt: nextTransitionUTC(instant, open).toISOString(),
      };
    },
  };
}
