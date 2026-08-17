import { describe, expect, it } from "vitest";
import { getLastTradingDayOfMonth, getNextTradingDay, isCalendarDateTradingDay } from "@/core/market-hours/nyse-calendar";

/**
 * Block 6 forward-testing hardening — this module gates `NO_OP_NOT_TRADING_DAY`
 * in the live rebalance scheduler and `determineRebalanceTarget`'s
 * execution-day computation. It previously had ZERO dedicated tests
 * (only exercised indirectly through `scheduling.test.ts`). Dates below
 * are hand-computed for calendar year 2026 (see PR/commit description for
 * the derivation) so a regression here — a wrong holiday, a DST edge, an
 * off-by-one on "observed" weekend shifts — is caught directly, not just
 * inferred from a downstream scheduling test.
 */

describe("isCalendarDateTradingDay — 2026 NYSE holidays", () => {
  it("New Year's Day 2026 (Thursday, Jan 1) is closed", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 1, day: 1 })).toBe(false);
  });

  it("MLK Day 2026 (3rd Monday of January = Jan 19) is closed", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 1, day: 19 })).toBe(false);
  });

  it("Presidents Day 2026 (3rd Monday of February = Feb 16) is closed", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 2, day: 16 })).toBe(false);
  });

  it("Good Friday 2026 (April 3, computed from Easter Sunday April 5) is closed", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 4, day: 3 })).toBe(false);
  });

  it("Memorial Day 2026 (last Monday of May = May 25) is closed", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 5, day: 25 })).toBe(false);
  });

  it("Juneteenth 2026 (June 19, a Friday — no observed-shift needed) is closed", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 6, day: 19 })).toBe(false);
  });

  it("Independence Day 2026 falls on Saturday July 4 — the OBSERVED holiday shifts to Friday July 3", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 7, day: 3 })).toBe(false); // observed
    expect(isCalendarDateTradingDay({ year: 2026, month: 7, day: 4 })).toBe(false); // Saturday anyway
    expect(isCalendarDateTradingDay({ year: 2026, month: 7, day: 2 })).toBe(true); // Thursday before — open
  });

  it("Labor Day 2026 (1st Monday of September = Sep 7) is closed", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 9, day: 7 })).toBe(false);
  });

  it("Thanksgiving 2026 (4th Thursday of November = Nov 26) is closed", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 11, day: 26 })).toBe(false);
  });

  it("Christmas 2026 (Friday, Dec 25) is closed", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 12, day: 25 })).toBe(false);
  });

  it("the day immediately after each holiday is a normal trading day (holidays don't bleed into adjacent days)", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 1, day: 2 })).toBe(true); // day after New Year's
    expect(isCalendarDateTradingDay({ year: 2026, month: 1, day: 20 })).toBe(true); // day after MLK
    expect(isCalendarDateTradingDay({ year: 2026, month: 12, day: 24 })).toBe(true); // day before Christmas (not itself a holiday)
  });
});

describe("isCalendarDateTradingDay — weekends", () => {
  it("closes on every Saturday and Sunday regardless of holiday status", () => {
    expect(isCalendarDateTradingDay({ year: 2026, month: 8, day: 15 })).toBe(false); // Saturday
    expect(isCalendarDateTradingDay({ year: 2026, month: 8, day: 16 })).toBe(false); // Sunday
    expect(isCalendarDateTradingDay({ year: 2026, month: 8, day: 17 })).toBe(true); // Monday
  });
});

describe("getLastTradingDayOfMonth — month-end / weekend / holiday interaction", () => {
  it("returns the plain last calendar day when it's a normal weekday (November 2026 ends on Monday the 30th)", () => {
    expect(getLastTradingDayOfMonth(2026, 11)).toEqual({ year: 2026, month: 11, day: 30 });
  });

  it("skips backward over a weekend when the month ends on a Sunday (May 2026 ends on Sunday the 31st -> Friday the 29th)", () => {
    expect(getLastTradingDayOfMonth(2026, 5)).toEqual({ year: 2026, month: 5, day: 29 });
  });

  it("skips backward over New Year's Day itself (December 2026 ends on Thursday the 31st, a normal trading day, unaffected by the FOLLOWING month's Jan 1 holiday)", () => {
    expect(getLastTradingDayOfMonth(2026, 12)).toEqual({ year: 2026, month: 12, day: 31 });
  });
});

describe("getNextTradingDay — closed-market / holiday behavior", () => {
  it("returns the immediate next day when that day is already a normal trading day", () => {
    expect(getNextTradingDay({ year: 2026, month: 8, day: 17 })).toEqual({ year: 2026, month: 8, day: 18 });
  });

  it("skips a weekend entirely (Friday -> Monday)", () => {
    expect(getNextTradingDay({ year: 2026, month: 8, day: 14 })).toEqual({ year: 2026, month: 8, day: 17 });
  });

  it("skips an observed holiday AND the following weekend in one hop (Thursday July 2 -> observed Friday July 3 closed -> weekend closed -> Monday July 6)", () => {
    expect(getNextTradingDay({ year: 2026, month: 7, day: 2 })).toEqual({ year: 2026, month: 7, day: 6 });
  });

  it("skips a mid-week holiday normally (Wednesday before Thanksgiving Thursday -> Friday, the day after)", () => {
    expect(getNextTradingDay({ year: 2026, month: 11, day: 25 })).toEqual({ year: 2026, month: 11, day: 27 });
  });
});
