import { createForexCalendar } from "@/core/market-hours/forex-calendar";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import type { MarketHoursCalendar } from "@/core/market-hours/types";
import type { Market } from "@/core/shared/types";

const FOREX_MARKETS: ReadonlySet<Market> = new Set<Market>([
  "FOREX_EURUSD",
  "FOREX_GBPUSD",
  "FOREX_USDJPY",
  "FOREX_AUDUSD",
]);

/**
 * Block 8 — resolves the correct `MarketHoursCalendar` for a given
 * market, so the backtesting engine no longer has to hardcode
 * `createNyseCalendar`. Every market that existed before Block 8
 * (SP500/NASDAQ100/RUSSELL2000/DOWJONES/GOLD/BITCOIN) resolves to exactly
 * `createNyseCalendar(market)` — the SAME calendar instance behavior as
 * before this registry existed — so no equity backtest result (including
 * every RS3M verification script) changes. Only the four new FOREX_*
 * markets get the new 24/5 calendar.
 */
export function getMarketCalendar(market: Market): MarketHoursCalendar {
  if (FOREX_MARKETS.has(market)) {
    return createForexCalendar(market);
  }
  return createNyseCalendar(market);
}
