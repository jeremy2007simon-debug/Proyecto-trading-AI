/**
 * Block 6, Fase 18 — pure month-boundary/scheduling logic for the RS3M
 * rebalance scheduler, extracted out of `run-rebalance.ts` (which does
 * the actual I/O) so this genuinely safety-relevant date arithmetic has
 * its own dedicated tests (Fase 27 explicitly calls out "month-boundary"
 * coverage) instead of being buried inside a script.
 */
import { getLastTradingDayOfMonth, getNextTradingDay, type CalendarDateOnly } from "@/core/market-hours/nyse-calendar";

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function monthKeyOf(date: { year: number; month: number }): string {
  return `${date.year}-${pad2(date.month)}`;
}

export function calendarDateCompare(a: CalendarDateOnly, b: CalendarDateOnly): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function previousCalendarMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export interface RebalanceTarget {
  decisionMonthKey: string;
  lastTradingDayOfTarget: CalendarDateOnly;
  executionDay: CalendarDateOnly;
  /** True when `today` is on or after `executionDay` — the scheduler should act (subject to the idempotency check, done separately with I/O). */
  isExecutionDayOrLater: boolean;
  /** End-of-day ISO bound to cap the data fetch at, so the fetched data's latest month bucket is guaranteed to be this complete target month — see `fetchRs3mUniverse`'s `to` param doc. */
  dataCutoffIso: string;
}

/**
 * The RS3M rebalance target for `today`: always the PREVIOUS calendar
 * month (the only month guaranteed to have fully closed), together with
 * whether today is late enough (on/after the next trading day following
 * that month's close) to act on it. Never reasons about the CURRENT
 * calendar month at all — see the module doc comment in
 * `run-rebalance.ts` for why that's what prevents ever computing a signal
 * from a partial, still-forming month.
 */
export function determineRebalanceTarget(today: CalendarDateOnly): RebalanceTarget {
  const targetMonth = previousCalendarMonth(today.year, today.month);
  const lastTradingDayOfTarget = getLastTradingDayOfMonth(targetMonth.year, targetMonth.month);
  const executionDay = getNextTradingDay(lastTradingDayOfTarget);

  return {
    decisionMonthKey: monthKeyOf(targetMonth),
    lastTradingDayOfTarget,
    executionDay,
    isExecutionDayOrLater: calendarDateCompare(today, executionDay) >= 0,
    dataCutoffIso: `${lastTradingDayOfTarget.year}-${pad2(lastTradingDayOfTarget.month)}-${pad2(lastTradingDayOfTarget.day)}T23:59:59.999Z`,
  };
}
