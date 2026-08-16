import type { Market } from "@/core/shared/types";
import type {
  MarketHoursCalendar,
  MarketSession,
  MarketStatus,
} from "@/core/market-hours/types";

const NY_TZ = "America/New_York";

const PRE_MARKET_START_MIN = 4 * 60; // 04:00
const REGULAR_START_MIN = 9 * 60 + 30; // 09:30
const REGULAR_END_MIN = 16 * 60; // 16:00
const AFTER_HOURS_END_MIN = 20 * 60; // 20:00

interface CalendarDate {
  year: number;
  month: number; // 1-indexed
  day: number;
}

export interface EasternParts extends CalendarDate {
  hour: number;
  minute: number;
  weekday: number; // 0=Sun..6=Sat
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(d: CalendarDate): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const wallClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  timeZoneName: "shortOffset",
});

function getEasternParts(instant: Date): EasternParts {
  const parts = wallClockFormatter.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

/** UTC offset in minutes (negative west of UTC) America/New_York observes at this instant — -240 (EDT) or -300 (EST). */
function getUtcOffsetMinutes(instant: Date): number {
  const parts = offsetFormatter.formatToParts(instant);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const match = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec(raw);
  if (!match) return -300;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

/**
 * Converts an America/New_York wall-clock time to the corresponding UTC
 * instant, correctly handling DST via a 2-step fixed-point iteration.
 * Safe for any time of day used in this module (04:00-20:00 ET) since
 * that range never crosses a UTC calendar-day boundary ambiguity given
 * America/New_York's offset is always exactly -240 or -300 minutes.
 */
function easternWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let guessMs = Date.UTC(year, month - 1, day, hour, minute) + 5 * 60 * 60 * 1000;
  for (let i = 0; i < 2; i++) {
    const offsetMinutes = getUtcOffsetMinutes(new Date(guessMs));
    const correctedMs =
      Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60 * 1000;
    if (correctedMs === guessMs) break;
    guessMs = correctedMs;
  }
  return new Date(guessMs);
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): CalendarDate {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
  return { year, month, day };
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): CalendarDate {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastWeekday = new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay();
  const day = daysInMonth - ((lastWeekday - weekday + 7) % 7);
  return { year, month, day };
}

/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher) — deterministic, no hardcoded dates. */
function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function goodFriday(year: number): CalendarDate {
  const easter = easterSunday(year);
  const easterMs = Date.UTC(easter.year, easter.month - 1, easter.day);
  const gf = new Date(easterMs - 2 * 24 * 60 * 60 * 1000);
  return { year: gf.getUTCFullYear(), month: gf.getUTCMonth() + 1, day: gf.getUTCDate() };
}

/** NYSE observed-holiday rule: Saturday -> observed Friday, Sunday -> observed Monday. */
function observed(date: CalendarDate): CalendarDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const weekday = d.getUTCDay();
  const shiftDays = weekday === 6 ? -1 : weekday === 0 ? 1 : 0;
  if (shiftDays === 0) return date;
  const shifted = new Date(d.getTime() + shiftDays * 24 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

const holidayCache = new Map<number, Set<string>>();

/** Full-day NYSE market holidays for a given year, computed by rule rather than a hardcoded list. */
function getNyseHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const holidays = [
    observed({ year, month: 1, day: 1 }), // New Year's Day
    nthWeekdayOfMonth(year, 1, 1, 3), // MLK Day — 3rd Monday of January
    nthWeekdayOfMonth(year, 2, 1, 3), // Presidents Day — 3rd Monday of February
    goodFriday(year),
    lastWeekdayOfMonth(year, 5, 1), // Memorial Day — last Monday of May
    observed({ year, month: 6, day: 19 }), // Juneteenth
    observed({ year, month: 7, day: 4 }), // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 1), // Labor Day — 1st Monday of September
    nthWeekdayOfMonth(year, 11, 4, 4), // Thanksgiving — 4th Thursday of November
    observed({ year, month: 12, day: 25 }), // Christmas
  ];

  const set = new Set(holidays.map(dateKey));
  holidayCache.set(year, set);
  return set;
}

function isTradingCalendarDay(date: CalendarDate, weekday: number): boolean {
  if (weekday === 0 || weekday === 6) return false;
  return !getNyseHolidays(date.year).has(dateKey(date));
}

function nextTradingDayFrom(date: CalendarDate): CalendarDate {
  let cursor = new Date(Date.UTC(date.year, date.month - 1, date.day));
  for (let i = 0; i < 10; i++) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const candidate: CalendarDate = {
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
    };
    if (isTradingCalendarDay(candidate, cursor.getUTCDay())) return candidate;
  }
  throw new Error("nextTradingDayFrom: no trading day found within 10 days");
}

function sessionForMinuteOfDay(minuteOfDay: number): MarketSession {
  if (minuteOfDay >= PRE_MARKET_START_MIN && minuteOfDay < REGULAR_START_MIN) {
    return "PRE_MARKET";
  }
  if (minuteOfDay >= REGULAR_START_MIN && minuteOfDay < REGULAR_END_MIN) {
    return "REGULAR";
  }
  if (minuteOfDay >= REGULAR_END_MIN && minuteOfDay < AFTER_HOURS_END_MIN) {
    return "AFTER_HOURS";
  }
  return "CLOSED";
}

function computeNextTransitionUTC(today: CalendarDate, minuteOfDay: number, isTradingDay: boolean): Date {
  if (isTradingDay) {
    if (minuteOfDay < PRE_MARKET_START_MIN) {
      return easternWallTimeToUtc(today.year, today.month, today.day, 4, 0);
    }
    if (minuteOfDay < REGULAR_START_MIN) {
      return easternWallTimeToUtc(today.year, today.month, today.day, 9, 30);
    }
    if (minuteOfDay < REGULAR_END_MIN) {
      return easternWallTimeToUtc(today.year, today.month, today.day, 16, 0);
    }
    if (minuteOfDay < AFTER_HOURS_END_MIN) {
      return easternWallTimeToUtc(today.year, today.month, today.day, 20, 0);
    }
  }
  const next = nextTradingDayFrom(today);
  return easternWallTimeToUtc(next.year, next.month, next.day, 4, 0);
}

/**
 * Public wrapper over the module's internal Eastern wall-clock
 * conversion — exposes `{year, month, day, hour, minute, weekday}` for
 * callers that need Eastern-local time bucketing (e.g. backtesting's
 * performance-by-hour/weekday/month/session breakdowns) without
 * reimplementing the DST-correct `Intl.DateTimeFormat` conversion this
 * module already has.
 */
export function getEasternWallClockParts(instant: Date): EasternParts {
  return getEasternParts(instant);
}

/** Concrete NYSE-hours calendar, used for SPY (the SP500 instrument proxy — see market-data/instruments.ts). */
export function createNyseCalendar(market: Market = "SP500"): MarketHoursCalendar {
  return {
    market,
    timezone: NY_TZ,

    isTradingDay(instant: Date): boolean {
      const parts = getEasternParts(instant);
      return isTradingCalendarDay(parts, parts.weekday);
    },

    getSessionStartUTC(instant: Date): string {
      const parts = getEasternParts(instant);
      return easternWallTimeToUtc(parts.year, parts.month, parts.day, 9, 30).toISOString();
    },

    getStatus(instant: Date): MarketStatus {
      const parts = getEasternParts(instant);
      const tradingDay = isTradingCalendarDay(parts, parts.weekday);
      const minuteOfDay = parts.hour * 60 + parts.minute;
      const session: MarketSession = tradingDay ? sessionForMinuteOfDay(minuteOfDay) : "CLOSED";
      const offsetMinutes = getUtcOffsetMinutes(instant);

      return {
        market,
        asOf: instant.toISOString(),
        session,
        isOpen: session === "REGULAR",
        isDST: offsetMinutes === -4 * 60,
        tradingDay: dateKey(parts),
        nextTransitionAt: computeNextTransitionUTC(parts, minuteOfDay, tradingDay).toISOString(),
      };
    },
  };
}
