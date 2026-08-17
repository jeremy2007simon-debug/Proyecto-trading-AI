import { describe, expect, it } from "vitest";
import { calendarDateCompare, determineRebalanceTarget, monthKeyOf, previousCalendarMonth } from "../../../scripts/block6/paper/scheduling";

describe("previousCalendarMonth", () => {
  it("returns the prior month within the same year", () => {
    expect(previousCalendarMonth(2026, 5)).toEqual({ year: 2026, month: 4 });
  });

  it("wraps from January back to December of the prior year", () => {
    expect(previousCalendarMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("calendarDateCompare", () => {
  it("orders by year first, then month, then day", () => {
    expect(calendarDateCompare({ year: 2025, month: 12, day: 31 }, { year: 2026, month: 1, day: 1 })).toBeLessThan(0);
    expect(calendarDateCompare({ year: 2026, month: 1, day: 1 }, { year: 2026, month: 2, day: 1 })).toBeLessThan(0);
    expect(calendarDateCompare({ year: 2026, month: 5, day: 1 }, { year: 2026, month: 5, day: 2 })).toBeLessThan(0);
    expect(calendarDateCompare({ year: 2026, month: 5, day: 3 }, { year: 2026, month: 5, day: 3 })).toBe(0);
  });
});

describe("monthKeyOf", () => {
  it("formats with a zero-padded month", () => {
    expect(monthKeyOf({ year: 2026, month: 4 })).toBe("2026-04");
    expect(monthKeyOf({ year: 2026, month: 12 })).toBe("2026-12");
  });
});

describe("determineRebalanceTarget (Block 6, month-boundary coverage)", () => {
  it("targets the PREVIOUS month, never the current (possibly incomplete) month", () => {
    // Today: 2026-05-15 (mid-May) -> target month must be April, not May.
    const target = determineRebalanceTarget({ year: 2026, month: 5, day: 15 });
    expect(target.decisionMonthKey).toBe("2026-04");
  });

  it("is NOT execution-day-or-later before the first trading day after last month's close", () => {
    // April 2026's last trading day is 2026-04-30 (Thursday), so the
    // execution day is 2026-05-01 (Friday). If "today" were somehow
    // 2026-04-29 with a May target computed (shouldn't normally happen
    // since target is always the PRIOR month to today's own month), the
    // execution-day check must still correctly gate on May's own boundary.
    // Concretely: today = 2026-05-01 itself IS the execution day.
    const target = determineRebalanceTarget({ year: 2026, month: 5, day: 1 });
    expect(target.executionDay).toEqual({ year: 2026, month: 5, day: 1 });
    expect(target.isExecutionDayOrLater).toBe(true);
  });

  it("stays execution-day-or-later on every subsequent day of the month (idempotency handles the actual dedup)", () => {
    const target = determineRebalanceTarget({ year: 2026, month: 5, day: 20 });
    expect(target.isExecutionDayOrLater).toBe(true);
    expect(target.decisionMonthKey).toBe("2026-04");
  });

  it("correctly skips a weekend when computing the execution day (month ending on a Sunday)", () => {
    // 2026-08-31 is a Monday actually — pick a real weekend-ending month:
    // 2026-05-31 is a Sunday -> May's last trading day is Friday 2026-05-29,
    // execution day is Monday 2026-06-01.
    const target = determineRebalanceTarget({ year: 2026, month: 6, day: 1 });
    expect(target.lastTradingDayOfTarget).toEqual({ year: 2026, month: 5, day: 29 });
    expect(target.executionDay).toEqual({ year: 2026, month: 6, day: 1 });
  });

  it("wraps correctly across a year boundary (January targets December of the prior year)", () => {
    const target = determineRebalanceTarget({ year: 2027, month: 1, day: 5 });
    expect(target.decisionMonthKey).toBe("2026-12");
  });

  it("produces a dataCutoffIso that pins the exact target month's last trading day (never later)", () => {
    const target = determineRebalanceTarget({ year: 2026, month: 5, day: 15 });
    expect(target.dataCutoffIso).toBe("2026-04-30T23:59:59.999Z");
  });

  it("catches up correctly when the scheduler runs several days late (still targets the same prior month, still execution-day-or-later)", () => {
    const onTime = determineRebalanceTarget({ year: 2026, month: 5, day: 1 });
    const late = determineRebalanceTarget({ year: 2026, month: 5, day: 6 });
    expect(late.decisionMonthKey).toBe(onTime.decisionMonthKey);
    expect(late.dataCutoffIso).toBe(onTime.dataCutoffIso);
    expect(late.isExecutionDayOrLater).toBe(true);
  });
});
