import { createRealizedVolatility, createRollingPercentile, createSma } from "@/core/indicators";
import type { Candle } from "@/core/market-data/types";

/**
 * Block 8.3, Family 3 — causal regime classification, reusing the
 * EXISTING indicator library (`@/core/indicators`) rather than
 * reimplementing SMA/rolling-percentile math: `createSma` and
 * `createRollingPercentile(createRealizedVolatility(...), ...)` are
 * already pure, causal, tested modules (Block 4/4.5/5). Every indicator
 * here reads `candles[i].close`, which — because this module is only
 * ever called with `toAdjustedCandles`'s output (`daily-series.ts`) —
 * is the DIVIDEND-ADJUSTED close, never the raw one.
 *
 * Per the brief's explicit "máximo 2 condiciones de régimen principales"
 * instruction: exactly two regime primitives are defined here
 * (long-term trend, realized-vol percentile) and `trend-pullback.ts`
 * combines AT MOST both, never more.
 */
export interface RegimeSeries {
  /** ISO date (YYYY-MM-DD) -> classification, built ONLY from `candles[0..i]` for the bar dated that day — no future bar ever informs a past date's regime. */
  byDate: Map<string, { longTermTrendBullish: boolean; volRegime: "LOW_VOL" | "HIGH_VOL" }>;
}

const LONG_TERM_TREND_SMA_PERIOD = 200;
const VOL_PERCENTILE_WINDOW = 252;
const VOL_PERCENTILE_HIGH_THRESHOLD = 50;

export function buildRegimeSeries(candles: readonly Candle[]): RegimeSeries {
  const sma200 = createSma(LONG_TERM_TREND_SMA_PERIOD).compute(candles);
  const sma200ByTs = new Map(sma200.map((v) => [v.timestamp, v.value]));

  const volPercentile = createRollingPercentile(createRealizedVolatility(20), (v) => v.value, VOL_PERCENTILE_WINDOW).compute(candles);
  const volPercentileByTs = new Map(volPercentile.map((v) => [v.timestamp, v.percentile]));

  const byDate = new Map<string, { longTermTrendBullish: boolean; volRegime: "LOW_VOL" | "HIGH_VOL" }>();
  for (const candle of candles) {
    const sma = sma200ByTs.get(candle.timestamp);
    const pctile = volPercentileByTs.get(candle.timestamp);
    if (sma === undefined || pctile === undefined) continue; // still in warmup — no regime reading yet, never fabricated
    byDate.set(candle.timestamp.slice(0, 10), {
      longTermTrendBullish: candle.close > sma,
      volRegime: pctile >= VOL_PERCENTILE_HIGH_THRESHOLD ? "HIGH_VOL" : "LOW_VOL",
    });
  }
  return { byDate };
}

export type RegimeFilterMode = "NONE" | "LONG_TERM_TREND" | "VOL_REGIME" | "BOTH";

/** `true` (never blocked) when `mode === "NONE"` or the date has no regime reading yet (warmup) — a strategy without a regime filter should behave identically to one with the filter permanently disabled, not silently gated by warmup. */
export function regimePasses(regime: RegimeSeries, date: string, mode: RegimeFilterMode): boolean {
  if (mode === "NONE") return true;
  const reading = regime.byDate.get(date);
  if (!reading) return true;
  if (mode === "LONG_TERM_TREND") return reading.longTermTrendBullish;
  if (mode === "VOL_REGIME") return reading.volRegime === "LOW_VOL";
  return reading.longTermTrendBullish && reading.volRegime === "LOW_VOL";
}
