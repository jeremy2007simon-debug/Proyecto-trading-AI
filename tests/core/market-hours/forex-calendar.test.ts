import { describe, expect, it } from "vitest";
import { createForexCalendar, FX_SESSION_WINDOWS_UTC } from "@/core/market-hours/forex-calendar";

/**
 * Block 8 (Forex Research Lab) — the FX 24/5 calendar gates the daily
 * risk gate's day-bucketing and the backtesting engine's session-anchor
 * logic for every FX experiment. A wrong weekend boundary here would
 * silently let the engine "trade" hours the real market is closed.
 */

describe("createForexCalendar — 24/5 trading week", () => {
  const calendar = createForexCalendar("FOREX_EURUSD");

  it("is open on a plain Tuesday", () => {
    expect(calendar.isTradingDay(new Date("2026-01-06T12:00:00.000Z"))).toBe(true);
  });

  it("is closed all day Saturday", () => {
    expect(calendar.isTradingDay(new Date("2026-01-10T00:00:00.000Z"))).toBe(false);
    expect(calendar.isTradingDay(new Date("2026-01-10T12:00:00.000Z"))).toBe(false);
    expect(calendar.isTradingDay(new Date("2026-01-10T23:59:00.000Z"))).toBe(false);
  });

  it("is closed Sunday before 22:00 UTC and open from 22:00 UTC onward", () => {
    expect(calendar.isTradingDay(new Date("2026-01-11T21:59:00.000Z"))).toBe(false);
    expect(calendar.isTradingDay(new Date("2026-01-11T22:00:00.000Z"))).toBe(true);
    expect(calendar.isTradingDay(new Date("2026-01-11T23:30:00.000Z"))).toBe(true);
  });

  it("is open Friday before 22:00 UTC and closed from 22:00 UTC onward", () => {
    expect(calendar.isTradingDay(new Date("2026-01-09T21:59:00.000Z"))).toBe(true);
    expect(calendar.isTradingDay(new Date("2026-01-09T22:00:00.000Z"))).toBe(false);
    expect(calendar.isTradingDay(new Date("2026-01-09T23:00:00.000Z"))).toBe(false);
  });

  it("getStatus reports isOpen/session consistently with isTradingDay", () => {
    const openInstant = new Date("2026-01-06T12:00:00.000Z");
    const closedInstant = new Date("2026-01-10T12:00:00.000Z");
    expect(calendar.getStatus(openInstant).isOpen).toBe(true);
    expect(calendar.getStatus(openInstant).session).toBe("REGULAR");
    expect(calendar.getStatus(closedInstant).isOpen).toBe(false);
    expect(calendar.getStatus(closedInstant).session).toBe("CLOSED");
  });

  it("getTradingDayKey buckets by UTC calendar date", () => {
    expect(calendar.getTradingDayKey(new Date("2026-01-06T00:00:00.000Z"))).toBe("2026-01-06");
    expect(calendar.getTradingDayKey(new Date("2026-01-06T23:59:59.000Z"))).toBe("2026-01-06");
    expect(calendar.getTradingDayKey(new Date("2026-01-07T00:00:00.000Z"))).toBe("2026-01-07");
  });

  it("getSessionStartUTC resets at 00:00 UTC each day", () => {
    const start = calendar.getSessionStartUTC(new Date("2026-01-06T15:30:00.000Z"));
    expect(start).toBe("2026-01-06T00:00:00.000Z");
  });

  it("nextTransitionAt for a closed Saturday instant lands on Sunday 22:00 UTC", () => {
    const status = calendar.getStatus(new Date("2026-01-10T12:00:00.000Z"));
    expect(status.nextTransitionAt).toBe("2026-01-11T22:00:00.000Z");
  });
});

describe("FX_SESSION_WINDOWS_UTC", () => {
  it("defines London before New York, with the overlap inside both", () => {
    expect(FX_SESSION_WINDOWS_UTC.LONDON.startHour).toBeLessThan(FX_SESSION_WINDOWS_UTC.NEW_YORK.startHour);
    expect(FX_SESSION_WINDOWS_UTC.LONDON_NEW_YORK_OVERLAP.startHour).toBeGreaterThanOrEqual(FX_SESSION_WINDOWS_UTC.LONDON.startHour);
    expect(FX_SESSION_WINDOWS_UTC.LONDON_NEW_YORK_OVERLAP.endHour).toBeLessThanOrEqual(FX_SESSION_WINDOWS_UTC.LONDON.endHour);
    expect(FX_SESSION_WINDOWS_UTC.LONDON_NEW_YORK_OVERLAP.startHour).toBeGreaterThanOrEqual(FX_SESSION_WINDOWS_UTC.NEW_YORK.startHour);
  });
});
