import type { Candle } from "@/core/market-data/types";

/**
 * Block 9.x — aligns N tickers' adjusted candle series onto their
 * common trading-date INTERSECTION (SPY starts 1993, QQQ 1999, IWM
 * 2000, DIA 1998 — Families F-A/F-B and C-C/C-D need all 4 present on
 * the same date to rank/rotate). A date missing from ANY ticker's
 * series is dropped from ALL of them, never filled/interpolated — a
 * documented reduction in usable history for these specific
 * cross-sectional configs, not a fabricated data point.
 */
export function alignByDate(seriesByTicker: Readonly<Record<string, readonly Candle[]>>): Record<string, Candle[]> {
  const tickers = Object.keys(seriesByTicker);
  const dateSets = tickers.map((t) => new Set(seriesByTicker[t].map((c) => c.timestamp.slice(0, 10))));
  const commonDates = [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d)));
  commonDates.sort();
  const commonDateSet = new Set(commonDates);

  const result: Record<string, Candle[]> = {};
  for (const ticker of tickers) {
    result[ticker] = seriesByTicker[ticker]
      .filter((c) => commonDateSet.has(c.timestamp.slice(0, 10)))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return result;
}
