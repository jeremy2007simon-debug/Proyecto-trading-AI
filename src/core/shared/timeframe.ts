import type { Timeframe } from "@/core/shared/types";

/** Nominal duration of one candle for each supported timeframe, in minutes. */
export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "1d": 24 * 60,
};
