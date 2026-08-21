import { describe, expect, it } from "vitest";
import { getMarketCalendar } from "@/core/market-hours/calendar-registry";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";

/**
 * Block 8 — this registry is what lets `event-driven-simulator.ts` pick
 * a calendar per market instead of hardcoding NYSE. The critical safety
 * property under test: every market that existed BEFORE Block 8 must
 * still resolve to bit-for-bit the same NYSE calendar behavior — this is
 * what guarantees RS3M and every prior block's equity backtests are
 * completely unaffected by Block 8.
 */
describe("getMarketCalendar — isolation from Block 8", () => {
  const probeInstants = [
    new Date("2026-01-06T14:30:00.000Z"), // a plain trading instant
    new Date("2026-01-01T12:00:00.000Z"), // New Year's Day (NYSE holiday)
    new Date("2026-01-10T12:00:00.000Z"), // a Saturday
  ];

  for (const market of ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"] as const) {
    it(`${market} resolves to exactly createNyseCalendar's behavior (pre-existing market, unchanged by Block 8)`, () => {
      const registryCalendar = getMarketCalendar(market);
      const directCalendar = createNyseCalendar(market);
      for (const instant of probeInstants) {
        expect(registryCalendar.isTradingDay(instant)).toBe(directCalendar.isTradingDay(instant));
        expect(registryCalendar.getStatus(instant)).toEqual(directCalendar.getStatus(instant));
        expect(registryCalendar.getSessionStartUTC(instant)).toBe(directCalendar.getSessionStartUTC(instant));
        expect(registryCalendar.getTradingDayKey(instant)).toBe(directCalendar.getTradingDayKey(instant));
      }
      expect(registryCalendar.timezone).toBe(directCalendar.timezone);
    });
  }

  for (const market of ["FOREX_EURUSD", "FOREX_GBPUSD", "FOREX_USDJPY", "FOREX_AUDUSD"] as const) {
    it(`${market} resolves to the 24/5 FX calendar, not NYSE`, () => {
      const calendar = getMarketCalendar(market);
      expect(calendar.timezone).toBe("UTC");
      // Saturday: closed under the FX calendar, but NYSE is ALSO closed
      // on Saturday — use a Sunday-evening instant instead, where the two
      // calendars genuinely disagree (FX open, NYSE closed).
      const sundayEvening = new Date("2026-01-11T23:00:00.000Z");
      expect(calendar.isTradingDay(sundayEvening)).toBe(true);
      expect(createNyseCalendar("SP500").isTradingDay(sundayEvening)).toBe(false);
    });
  }
});
