import { describe, expect, it } from "vitest";
import { createNyseCalendar, getLastTradingDayOfMonth, getNextTradingDay, isCalendarDateTradingDay } from "@/core/market-hours/nyse-calendar";

const calendar = createNyseCalendar("SP500");

describe("createNyseCalendar — DST correctness", () => {
  it("classifies the same UTC wall-clock hour differently in EDT (June) vs EST (January)", () => {
    // 13:30 UTC on a June Monday is 09:30 ET (EDT, UTC-4) -> REGULAR open.
    const juneStatus = calendar.getStatus(new Date("2024-06-17T13:30:00.000Z"));
    expect(juneStatus.isDST).toBe(true);
    expect(juneStatus.session).toBe("REGULAR");
    expect(juneStatus.isOpen).toBe(true);

    // The exact same UTC wall-clock hour on a January Tuesday is 08:30 ET
    // (EST, UTC-5) -> still pre-market. Same instant-of-day, different
    // session purely because of the DST offset — this is the actual
    // DST-correctness assertion.
    const januaryStatus = calendar.getStatus(new Date("2024-01-16T13:30:00.000Z"));
    expect(januaryStatus.isDST).toBe(false);
    expect(januaryStatus.session).toBe("PRE_MARKET");
    expect(januaryStatus.isOpen).toBe(false);
  });

  it("computes the correct UTC instant for 09:30 ET on both sides of the DST boundary", () => {
    expect(
      calendar.getSessionStartUTC(new Date("2024-06-17T18:00:00.000Z")),
    ).toBe("2024-06-17T13:30:00.000Z");

    expect(
      calendar.getSessionStartUTC(new Date("2024-01-16T18:00:00.000Z")),
    ).toBe("2024-01-16T14:30:00.000Z");
  });
});

describe("createNyseCalendar — weekends and holidays", () => {
  it("is always CLOSED on a Saturday regardless of time of day", () => {
    const status = calendar.getStatus(new Date("2024-06-15T15:00:00.000Z"));
    expect(status.session).toBe("CLOSED");
    expect(status.isOpen).toBe(false);
    expect(calendar.isTradingDay(new Date("2024-06-15T15:00:00.000Z"))).toBe(false);
  });

  it("is CLOSED on a fixed-date holiday (Christmas) even though it falls on a weekday", () => {
    // 2024-12-25 is a Wednesday.
    const status = calendar.getStatus(new Date("2024-12-25T16:00:00.000Z"));
    expect(status.session).toBe("CLOSED");
    expect(calendar.isTradingDay(new Date("2024-12-25T16:00:00.000Z"))).toBe(false);
  });

  it("is CLOSED on a rule-computed floating holiday (MLK Day 2024 = 3rd Monday of January)", () => {
    expect(calendar.isTradingDay(new Date("2024-01-15T16:00:00.000Z"))).toBe(false);
  });

  it("is a normal trading day on an ordinary weekday", () => {
    expect(calendar.isTradingDay(new Date("2024-06-17T16:00:00.000Z"))).toBe(true);
  });
});

describe("createNyseCalendar — session boundaries", () => {
  it("classifies pre-market, regular, after-hours, and closed correctly within one trading day", () => {
    // All on 2024-06-17 (Monday, EDT = UTC-4).
    expect(calendar.getStatus(new Date("2024-06-17T06:00:00.000Z")).session).toBe("CLOSED"); // 02:00 ET
    expect(calendar.getStatus(new Date("2024-06-17T09:00:00.000Z")).session).toBe("PRE_MARKET"); // 05:00 ET
    expect(calendar.getStatus(new Date("2024-06-17T13:30:00.000Z")).session).toBe("REGULAR"); // 09:30 ET
    expect(calendar.getStatus(new Date("2024-06-17T20:30:00.000Z")).session).toBe("AFTER_HOURS"); // 16:30 ET
  });
});

describe("getLastTradingDayOfMonth (Block 6)", () => {
  it("returns the calendar month's last day when it's an ordinary weekday", () => {
    // 2024-07-31 is a Wednesday, no holiday.
    expect(getLastTradingDayOfMonth(2024, 7)).toEqual({ year: 2024, month: 7, day: 31 });
  });

  it("rolls back over a weekend when the month ends on a Sunday", () => {
    // 2024-06-30 is a Sunday -> last trading day is Friday 2024-06-28.
    expect(getLastTradingDayOfMonth(2024, 6)).toEqual({ year: 2024, month: 6, day: 28 });
  });

  it("rolls back over a weekend when the month ends on a Saturday", () => {
    // 2024-11-30 is a Saturday -> last trading day is Friday 2024-11-29.
    expect(getLastTradingDayOfMonth(2024, 11)).toEqual({ year: 2024, month: 11, day: 29 });
  });
});

describe("getNextTradingDay (Block 6)", () => {
  it("returns the very next day for an ordinary weekday", () => {
    // 2024-06-17 is a Monday.
    expect(getNextTradingDay({ year: 2024, month: 6, day: 17 })).toEqual({ year: 2024, month: 6, day: 18 });
  });

  it("skips a weekend", () => {
    // 2024-06-28 is a Friday -> next trading day is Monday 2024-07-01.
    expect(getNextTradingDay({ year: 2024, month: 6, day: 28 })).toEqual({ year: 2024, month: 7, day: 1 });
  });

  it("skips a Monday holiday (Memorial Day 2024 = 2024-05-27)", () => {
    // 2024-05-24 is a Friday -> next trading day skips the Memorial Day Monday, landing on Tuesday 2024-05-28.
    expect(getNextTradingDay({ year: 2024, month: 5, day: 24 })).toEqual({ year: 2024, month: 5, day: 28 });
  });
});

describe("isCalendarDateTradingDay (Block 6)", () => {
  it("is true for an ordinary weekday", () => {
    expect(isCalendarDateTradingDay({ year: 2024, month: 6, day: 17 })).toBe(true);
  });

  it("is false for a weekend", () => {
    expect(isCalendarDateTradingDay({ year: 2024, month: 6, day: 15 })).toBe(false);
  });

  it("is false for a fixed-date holiday", () => {
    expect(isCalendarDateTradingDay({ year: 2024, month: 12, day: 25 })).toBe(false);
  });
});
